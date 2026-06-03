import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

/**
 * POST /api/chatbots/execute
 * Called by the WhatsApp webhook when an inbound message arrives.
 * Body: { userId, contactId, conversationId, message: { text, type } }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { userId, contactId, conversationId, message } = body
  if (!userId || !contactId) {
    return NextResponse.json({ error: 'userId and contactId required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // ── 1. Find active chatbots for this user ──
  const { data: bots } = await admin
    .from('chatbots')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!bots || bots.length === 0) return NextResponse.json({ matched: false })

  // ── 2. Check for waiting session first ──
  const { data: waitSession } = await admin
    .from('chatbot_sessions')
    .select('*, chatbot_nodes(*)')
    .eq('contact_id', contactId)
    .eq('status', 'waiting')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (waitSession) {
    await resumeSession(admin, waitSession, message, userId)
    return NextResponse.json({ matched: true, resumed: true })
  }

  // ── 3. Match trigger from active chatbots ──
  for (const bot of bots) {
    const { data: nodes } = await admin
      .from('chatbot_nodes')
      .select('*')
      .eq('chatbot_id', bot.id)
      .order('created_at')

    if (!nodes || nodes.length === 0) continue

    const triggerNode = nodes.find((n: Record<string, unknown>) => n.node_type === 'trigger')
    if (!triggerNode) continue

    const cfg = triggerNode.config as Record<string, unknown>
    const matched = matchesTrigger(cfg, message)
    if (!matched) continue

    // Create session and start execution
    const { data: session } = await admin
      .from('chatbot_sessions')
      .insert({
        chatbot_id: bot.id,
        contact_id: contactId,
        conversation_id: conversationId ?? null,
        current_node_id: triggerNode.id,
        status: 'active',
        variables: {},
      })
      .select()
      .single()

    if (session) {
      await executeFromNode(admin, session, nodes, triggerNode, userId)
    }
    return NextResponse.json({ matched: true, bot: bot.name })
  }

  return NextResponse.json({ matched: false })
}

// ─── Trigger matching ─────────────────────────────────────────

function matchesTrigger(cfg: Record<string, unknown>, message: { text?: string; type?: string }): boolean {
  const tt = cfg.trigger_type as string ?? 'new_message'
  if (tt === 'new_message') return true

  if (tt === 'hot_keywords' && cfg.keywords) {
    const keywords = String(cfg.keywords).toLowerCase().split(',').map(k => k.trim())
    return keywords.some(k => message.text?.toLowerCase().includes(k))
  }

  if (tt === 'match_keyword' && Array.isArray(cfg.conditions)) {
    const conditions = cfg.conditions as { operator: string; value: string }[]
    return conditions.every(c => {
      const text = message.text?.toLowerCase() ?? ''
      const val = c.value.toLowerCase()
      switch (c.operator) {
        case 'is':          return text === val
        case 'is not':      return text !== val
        case 'Contains':    return text.includes(val)
        case "Doesn't contain": return !text.includes(val)
        case 'Start with':  return text.startsWith(val)
        case 'End with':    return text.endsWith(val)
        default:            return true
      }
    })
  }

  return false
}

// ─── Execution engine ─────────────────────────────────────────

async function executeFromNode(
  admin: ReturnType<typeof supabaseAdmin>,
  session: Record<string, unknown>,
  nodes: Record<string, unknown>[],
  currentNode: Record<string, unknown>,
  userId: string,
) {
  const { data: config } = await admin
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (!config) return

  const accessToken = decrypt(config.access_token)

  const { data: contact } = await admin
    .from('contacts')
    .select('phone, name')
    .eq('id', session.contact_id)
    .maybeSingle()

  if (!contact?.phone) return

  const vars = (session.variables ?? {}) as Record<string, string>

  // Follow the node chain
  let node = currentNode
  const visited = new Set<string>()

  while (node && !visited.has(node.id as string)) {
    visited.add(node.id as string)
    const cfg = (node.config ?? {}) as Record<string, unknown>
    const nodeType = node.node_type as string

    // Interpolate variables in text
    const interp = (text: string) =>
      text
        .replace(/\{\{contact\.name\}\}/gi, contact.name ?? '')
        .replace(/\{\{contact\.phone\}\}/gi, contact.phone)
        .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

    if (nodeType === 'send_message') {
      const text = cfg.text as string ?? ''
      if (text) {
        await sendTextMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: contact.phone,
          text: interp(text),
        }).catch(() => {})
      }
    } else if (nodeType === 'ask_question') {
      const question = cfg.question as string ?? ''
      if (question) {
        await sendTextMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: contact.phone,
          text: interp(question),
        }).catch(() => {})
      }
      // Pause session, wait for response
      await admin.from('chatbot_sessions').update({
        current_node_id: node.id,
        status: 'waiting',
        variables: { ...vars, __expected_variable: cfg.variable, __expected_validation: cfg.validation },
      }).eq('id', session.id)
      return
    } else if (nodeType === 'smart_wait' || nodeType === 'stay_in_session') {
      await admin.from('chatbot_sessions').update({
        current_node_id: node.id,
        status: 'waiting',
      }).eq('id', session.id)
      return
    } else if (nodeType === 'assign_to_agent') {
      await admin.from('conversations').update({ assigned_agent_id: cfg.agent_id ?? null })
        .eq('id', session.conversation_id as string)
    }

    // Advance to next node via edge
    const { data: edge } = await admin
      .from('chatbot_edges')
      .select('target_node_id')
      .eq('source_node_id', node.id as string)
      .eq('source_handle', 'output')
      .maybeSingle()

    if (!edge) break

    const next = nodes.find(n => n.id === edge.target_node_id)
    if (!next) break
    node = next
  }

  // Session completed
  await admin.from('chatbot_sessions').update({ status: 'completed' }).eq('id', session.id)
}

async function resumeSession(
  admin: ReturnType<typeof supabaseAdmin>,
  session: Record<string, unknown>,
  message: { text?: string },
  userId: string,
) {
  const vars = (session.variables ?? {}) as Record<string, string>
  const expectedVar = vars.__expected_variable
  const validation = vars.__expected_validation as string ?? 'any'

  // Validate response
  const text = message.text ?? ''
  const valid = validateInput(text, validation)

  const { data: config } = await admin.from('whatsapp_config').select('phone_number_id, access_token')
    .eq('user_id', userId).maybeSingle()
  const { data: contact } = await admin.from('contacts').select('phone').eq('id', session.contact_id).maybeSingle()

  if (!config || !contact?.phone) return

  const accessToken = decrypt(config.access_token)

  if (!valid) {
    // Send invalid message
    const { data: node } = await admin.from('chatbot_nodes').select('config')
      .eq('id', session.current_node_id as string).maybeSingle()
    const invalidMsg = (node?.config as Record<string, string>)?.invalid_msg ?? 'Please enter a valid value.'
    const retries = (session.retry_count as number ?? 0) + 1
    const maxRetries = ((node?.config as Record<string, unknown>)?.max_retries as number) ?? 3

    await sendTextMessage({ phoneNumberId: config.phone_number_id, accessToken, to: contact.phone, text: invalidMsg }).catch(() => {})
    if (retries >= maxRetries) {
      // Follow timeout handle
      await admin.from('chatbot_sessions').update({ status: 'failed' }).eq('id', session.id)
    } else {
      await admin.from('chatbot_sessions').update({ retry_count: retries }).eq('id', session.id)
    }
    return
  }

  // Save variable and advance
  const newVars = { ...vars, ...(expectedVar ? { [expectedVar]: text } : {}) }
  delete newVars.__expected_variable
  delete newVars.__expected_validation

  await admin.from('chatbot_sessions').update({
    variables: newVars,
    status: 'active',
  }).eq('id', session.id)

  // Find next node via success handle
  const { data: edge } = await admin.from('chatbot_edges').select('target_node_id')
    .eq('source_node_id', session.current_node_id as string).eq('source_handle', 'success').maybeSingle()

  if (edge) {
    const { data: allNodes } = await admin.from('chatbot_nodes').select('*').eq('chatbot_id', session.chatbot_id)
    const targetNode = (allNodes ?? []).find((n: Record<string, unknown>) => n.id === edge.target_node_id)
    if (targetNode) {
      await executeFromNode(admin, { ...session, variables: newVars }, allNodes ?? [], targetNode, userId)
    }
  }
}

function validateInput(text: string, validation: string): boolean {
  if (validation === 'any' || !validation) return true
  if (validation === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
  if (validation === 'phone') return /^\+?[\d\s\-()]{7,}$/.test(text)
  if (validation === 'number') return !isNaN(Number(text))
  if (validation === 'date') return !isNaN(Date.parse(text))
  return text.trim().length > 0
}
