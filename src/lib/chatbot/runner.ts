/**
 * Shared chatbot execution engine.
 *
 * Imported by:
 *   - src/app/api/chatbots/execute/route.ts  (HTTP endpoint)
 *   - src/app/api/whatsapp/webhook/route.ts  (called inline after message save)
 */

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

export interface ChatbotMessage {
  text?: string
  type?: string
}

interface ConditionGroup {
  conditions: Array<{ field?: string; operator: string; value: string }>
}

interface TriggerConfig {
  trigger_type?: string
  keywords?: string
  condition_groups?: ConditionGroup[]
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runChatbotsForContact({
  userId,
  contactId,
  conversationId,
  message,
}: {
  userId: string
  contactId: string
  conversationId?: string | null
  message: ChatbotMessage
}): Promise<void> {
  try {
    const admin = supabaseAdmin()

    // 1. Find active chatbots for this workspace
    const { data: bots, error: botsError } = await admin
      .from('chatbots')
      .select('id, name, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (botsError) {
      console.error('[chatbot] Failed to fetch bots:', botsError.message)
      return
    }

    console.log(`[chatbot] Checking bots for user: ${userId.slice(-8)} — found ${bots?.length ?? 0} active bot(s)`)

    if (!bots || bots.length === 0) {
      console.log('[chatbot] No active bots — done')
      return
    }

    // 2. Resume a waiting session first (ask_question flow)
    const { data: waitSession } = await admin
      .from('chatbot_sessions')
      .select('*')
      .eq('contact_id', contactId)
      .eq('status', 'waiting')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (waitSession) {
      console.log(`[chatbot] Resuming waiting session: ${waitSession.id.slice(-8)}`)
      await resumeSession(admin, waitSession, message, userId)
      return
    }

    // 3. Match trigger and start the first matching bot
    for (const bot of bots) {
      console.log(`[chatbot] Checking bot: "${bot.name}" (${bot.id.slice(-8)})`)

      const { data: nodes, error: nodesError } = await admin
        .from('chatbot_nodes')
        .select('*')
        .eq('chatbot_id', bot.id)
        .order('created_at')

      if (nodesError) {
        console.error(`[chatbot] Failed to fetch nodes for bot ${bot.id.slice(-8)}:`, nodesError.message)
        continue
      }

      if (!nodes || nodes.length === 0) {
        console.log(`[chatbot] Bot "${bot.name}" has no nodes — skipping`)
        continue
      }

      console.log(`[chatbot] Bot "${bot.name}" has ${nodes.length} node(s)`)

      const triggerNode = nodes.find(
        (n: Record<string, unknown>) => n.node_type === 'trigger',
      )
      if (!triggerNode) {
        console.log(`[chatbot] Bot "${bot.name}" has no trigger node — skipping`)
        continue
      }

      const cfg = triggerNode.config as TriggerConfig
      console.log(`[chatbot] Trigger config: type="${cfg.trigger_type}" message_text="${message.text?.slice(0, 40)}"`)

      const matched = matchesTrigger(cfg, message)
      console.log(`[chatbot] Trigger match result: ${matched}`)

      if (!matched) continue

      console.log(`[chatbot] Matched bot: "${bot.name}" — creating session`)

      const { data: session, error: sessionError } = await admin
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

      if (sessionError) {
        console.error(`[chatbot] Failed to create session:`, sessionError.message)
        continue
      }

      if (session) {
        console.log(`[chatbot] Session created: ${session.id.slice(-8)} — executing from trigger node`)
        await executeFromNode(admin, session, nodes, triggerNode, userId)
      }
      return // Only fire the first matching bot
    }

    console.log('[chatbot] No bot matched — done')
  } catch (err) {
    console.error('[chatbot] runChatbotsForContact threw:', err instanceof Error ? err.message : err)
  }
}

// ─── Trigger matching ─────────────────────────────────────────────────────────

function matchesTrigger(cfg: TriggerConfig, message: ChatbotMessage): boolean {
  const tt = (cfg.trigger_type ?? 'new_message').toLowerCase().replace(/\s+/g, '_').replace('keyword_match', 'hot_keywords')

  if (tt === 'hot_keywords' && cfg.keywords) {
    const keywords = String(cfg.keywords)
      .toLowerCase()
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const result = keywords.some((k) => message.text?.toLowerCase().includes(k))
    console.log(`[chatbot] Trigger type=hot_keywords keywords=[${keywords.join(',')}] → ${result}`)
    return result
  }

  if (tt === 'match_keyword') {
    if (!Array.isArray(cfg.condition_groups) || cfg.condition_groups.length === 0) {
      console.log('[chatbot] Trigger type=match_keyword but condition_groups is empty/missing — no match')
      return false
    }
    // Groups are OR-ed; conditions within a group are AND-ed
    const result = cfg.condition_groups.some((group) =>
      group.conditions.every((c) => {
        const text = message.text?.toLowerCase() ?? ''
        const val = c.value.toLowerCase()
        switch (c.operator) {
          case 'Is':                     return text === val
          case 'Is not':                 return text !== val
          case 'Contains':               return text.includes(val)
          case "Doesn't contain":        return !text.includes(val)
          case 'Starts with':            return text.startsWith(val)
          case 'Ends with':              return text.endsWith(val)
          case 'Match pattern (regex)': {
            try { return new RegExp(val, 'i').test(message.text ?? '') }
            catch { return false }
          }
          default: return true
        }
      }),
    )
    console.log(`[chatbot] Trigger type=match_keyword groups=${cfg.condition_groups.length} → ${result}`)
    return result
  }

  console.log(`[chatbot] Unknown trigger type "${tt}" → no match`)
  return false
}

// ─── Execution engine ─────────────────────────────────────────────────────────

async function executeFromNode(
  admin: ReturnType<typeof supabaseAdmin>,
  session: Record<string, unknown>,
  nodes: Record<string, unknown>[],
  startNode: Record<string, unknown>,
  userId: string,
) {
  const { data: config } = await admin
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (!config) {
    console.error('[chatbot] No WhatsApp config found for userId:', userId.slice(-8))
    return
  }

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch (err) {
    console.error('[chatbot] Failed to decrypt access_token:', err instanceof Error ? err.message : err)
    return
  }

  const { data: contact } = await admin
    .from('contacts')
    .select('phone, name')
    .eq('id', session.contact_id)
    .maybeSingle()

  if (!contact?.phone) {
    console.error('[chatbot] Contact not found or missing phone for id:', String(session.contact_id).slice(-8))
    return
  }

  console.log(`[chatbot] Executing flow for contact: ...${contact.phone.slice(-4)}`)

  const vars = (session.variables ?? {}) as Record<string, string>

  const interp = (text: string) =>
    text
      .replace(/\{\{contact\.name\}\}/gi, contact.name ?? '')
      .replace(/\{\{contact\.phone\}\}/gi, contact.phone)
      .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

  let node = startNode
  const visited = new Set<string>()

  while (node && !visited.has(node.id as string)) {
    visited.add(node.id as string)
    const cfg = (node.config ?? {}) as Record<string, unknown>
    const nodeType = node.node_type as string

    console.log(`[chatbot] Executing node: ${nodeType} (${String(node.id).slice(-8)})`)

    if (nodeType === 'trigger') {
      // Skip the trigger node itself — advance to the first real action node
    } else if (nodeType === 'send_text') {
      const text = (cfg.text as string) ?? ''
      if (text) {
        const interpolated = interp(text)
        console.log(`[chatbot] Sending text: "${interpolated.slice(0, 80)}"`)
        try {
          const result = await sendTextMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: contact.phone,
            text: interpolated,
          })
          console.log('[chatbot] Message sent ✓')
          if (session.conversation_id) {
            await admin.from('messages').insert({
              conversation_id: session.conversation_id as string,
              sender_type: 'bot',
              content_type: 'text',
              content_text: interpolated,
              message_id: result.messageId,
              status: 'sent',
            }).catch((e: unknown) => console.error('[chatbot] msg insert failed:', e instanceof Error ? e.message : e))
          }
        } catch (err) {
          console.error('[chatbot] send_text failed:', err instanceof Error ? err.message : err)
        }
      } else {
        console.log('[chatbot] send_text node has empty text — skipping send')
      }
    } else if (nodeType === 'send_template') {
      const name = cfg.template_name as string
      if (name) {
        const params = cfg.variables
          ? Object.values(cfg.variables as Record<string, string>).map(String)
          : []
        console.log(`[chatbot] Sending template: "${name}"`)
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: contact.phone,
            templateName: name,
            language: (cfg.language as string) ?? 'en',
            params,
          })
          console.log('[chatbot] Template sent ✓')
          if (session.conversation_id) {
            await admin.from('messages').insert({
              conversation_id: session.conversation_id as string,
              sender_type: 'bot',
              content_type: 'template',
              template_name: name,
              message_id: result.messageId,
              status: 'sent',
            }).catch((e: unknown) => console.error('[chatbot] msg insert failed:', e instanceof Error ? e.message : e))
          }
        } catch (err) {
          console.error('[chatbot] send_template failed:', err instanceof Error ? err.message : err)
        }
      }
    } else if (nodeType === 'ask_question') {
      const question = (cfg.question as string) ?? ''
      if (question) {
        const questionText = interp(question)
        console.log(`[chatbot] Asking question: "${question.slice(0, 80)}"`)
        try {
          const result = await sendTextMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: contact.phone,
            text: questionText,
          })
          if (session.conversation_id) {
            await admin.from('messages').insert({
              conversation_id: session.conversation_id as string,
              sender_type: 'bot',
              content_type: 'text',
              content_text: questionText,
              message_id: result.messageId,
              status: 'sent',
            }).catch(() => {})
          }
        } catch (err) {
          console.error('[chatbot] ask_question send failed:', err instanceof Error ? err.message : err)
        }
      }
      // Pause and wait for the contact's reply
      await admin.from('chatbot_sessions').update({
        current_node_id: node.id,
        status: 'waiting',
        variables: { ...vars, __expected_variable: cfg.variable, __expected_validation: cfg.validation },
      }).eq('id', session.id)
      console.log('[chatbot] Session paused — waiting for reply')
      return
    } else if (nodeType === 'assign_to_agent') {
      if (session.conversation_id) {
        await admin.from('conversations')
          .update({ assigned_agent_id: cfg.agent_id ?? null })
          .eq('id', session.conversation_id as string)
        console.log('[chatbot] Assigned to agent ✓')
      }
    } else if (nodeType === 'end_bot') {
      console.log('[chatbot] end_bot reached — stopping')
      break
    } else {
      console.log(`[chatbot] Unhandled node type "${nodeType}" — skipping`)
    }

    // Advance via the 'output' edge
    const { data: edge } = await admin
      .from('chatbot_edges')
      .select('target_node_id')
      .eq('source_node_id', node.id as string)
      .eq('source_handle', 'output')
      .maybeSingle()

    if (!edge) {
      console.log('[chatbot] No outgoing edge — end of flow')
      break
    }

    const next = nodes.find((n) => n.id === edge.target_node_id)
    if (!next) {
      console.log(`[chatbot] Edge target ${edge.target_node_id.slice(-8)} not found in loaded nodes — stopping`)
      break
    }
    node = next
  }

  await admin.from('chatbot_sessions').update({ status: 'completed' }).eq('id', session.id)
  console.log('[chatbot] Session completed ✓')
}

async function resumeSession(
  admin: ReturnType<typeof supabaseAdmin>,
  session: Record<string, unknown>,
  message: ChatbotMessage,
  userId: string,
) {
  const vars = (session.variables ?? {}) as Record<string, string>
  const expectedVar = vars.__expected_variable
  const validation = (vars.__expected_validation as string) ?? 'any'
  const text = message.text ?? ''

  const { data: config } = await admin
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('user_id', userId)
    .maybeSingle()
  const { data: contact } = await admin
    .from('contacts')
    .select('phone')
    .eq('id', session.contact_id)
    .maybeSingle()

  if (!config || !contact?.phone) return

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return
  }

  if (!validateInput(text, validation)) {
    const { data: node } = await admin
      .from('chatbot_nodes')
      .select('config')
      .eq('id', session.current_node_id as string)
      .maybeSingle()

    const invalidMsg = (node?.config as Record<string, string>)?.invalid_msg ?? 'Please enter a valid value.'
    const retries = ((session.retry_count as number) ?? 0) + 1
    const maxRetries = ((node?.config as Record<string, unknown>)?.max_retries as number) ?? 3

    try {
      const result = await sendTextMessage({ phoneNumberId: config.phone_number_id, accessToken, to: contact.phone, text: invalidMsg })
      if (session.conversation_id) {
        await admin.from('messages').insert({
          conversation_id: session.conversation_id as string,
          sender_type: 'bot',
          content_type: 'text',
          content_text: invalidMsg,
          message_id: result.messageId,
          status: 'sent',
        }).catch(() => {})
      }
    } catch {
      // ignore — the session retry/fail logic below still runs
    }

    if (retries >= maxRetries) {
      await admin.from('chatbot_sessions').update({ status: 'failed' }).eq('id', session.id)
    } else {
      await admin.from('chatbot_sessions').update({ retry_count: retries }).eq('id', session.id)
    }
    return
  }

  const newVars = { ...vars, ...(expectedVar ? { [expectedVar]: text } : {}) }
  delete newVars.__expected_variable
  delete newVars.__expected_validation

  await admin.from('chatbot_sessions').update({ variables: newVars, status: 'active' }).eq('id', session.id)

  const { data: edge } = await admin
    .from('chatbot_edges')
    .select('target_node_id')
    .eq('source_node_id', session.current_node_id as string)
    .eq('source_handle', 'success')
    .maybeSingle()

  if (edge) {
    const { data: allNodes } = await admin.from('chatbot_nodes').select('*').eq('chatbot_id', session.chatbot_id)
    const target = (allNodes ?? []).find((n: Record<string, unknown>) => n.id === edge.target_node_id)
    if (target) {
      await executeFromNode(admin, { ...session, variables: newVars }, allNodes ?? [], target, userId)
    }
  }
}

function validateInput(text: string, validation: string): boolean {
  if (!validation || validation === 'any') return true
  if (validation === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
  if (validation === 'phone') return /^\+?[\d\s\-() ]{7,}$/.test(text)
  if (validation === 'number') return !isNaN(Number(text))
  if (validation === 'date') return !isNaN(Date.parse(text))
  return text.trim().length > 0
}
