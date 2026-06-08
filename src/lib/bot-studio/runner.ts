/**
 * Shared Bot Studio execution engine.
 *
 * Imported by:
 *   - src/app/api/bot-studio/webhook/[botId]/route.ts  (external webhook trigger)
 *   - src/app/api/whatsapp/webhook/route.ts            (inbound message_received trigger)
 *
 * Bots store their flow as inline JSONB ({nodes, edges}) on the `bots`
 * row — there are no normalized node/edge tables (unlike Chatbots).
 * Each run is logged to `bot_executions` for debugging.
 */

import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  sendTextMessage, sendTemplateMessage, sendMediaMessage, sendInteractiveListMessage,
} from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

export interface BotMessage {
  text?: string
  type?: string
}

interface BotNode {
  id: string
  type?: string
  data?: { node_type?: string; config?: Record<string, unknown>; label?: string }
}

interface BotEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
}

interface BotRow {
  id: string
  user_id: string
  status: string
  trigger: string
  nodes: BotNode[]
  edges: BotEdge[]
}

interface LogEntry {
  node_id: string
  node_type: string
  status: 'ok' | 'skipped' | 'error'
  detail?: string
}

const START_NODE_ID = 'start'

// ─── Trigger matching (message_received) ──────────────────────────────────────

interface MessageReceivedConfig {
  trigger_type?: string
  keyword?: string
  match_type?: 'exact' | 'contains' | 'starts_with'
}

export function matchesMessageReceivedTrigger(cfg: MessageReceivedConfig, message: BotMessage): boolean {
  const keyword = (cfg.keyword ?? '').trim()
  if (!keyword) return true // "any message"

  const text = (message.text ?? '').toLowerCase()
  const needle = keyword.toLowerCase()
  switch (cfg.match_type ?? 'contains') {
    case 'exact':       return text === needle
    case 'starts_with': return text.startsWith(needle)
    case 'contains':
    default:            return text.includes(needle)
  }
}

// ─── Public entry points ──────────────────────────────────────────────────────

/** Run a bot's flow for a given phone number — used by both the webhook route and the inbound-message trigger. */
export async function executeBotForPhone({
  bot,
  phone,
  message,
}: {
  bot: BotRow
  phone: string
  message?: BotMessage
}): Promise<void> {
  const admin = supabaseAdmin()
  const log: LogEntry[] = []
  let status: 'completed' | 'failed' = 'completed'

  try {
    const { data: config } = await admin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('user_id', bot.user_id)
      .maybeSingle()

    if (!config) {
      log.push({ node_id: '-', node_type: '-', status: 'error', detail: 'No WhatsApp config found for this workspace' })
      status = 'failed'
      await recordExecution(admin, bot.id, status, log)
      return
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch {
      log.push({ node_id: '-', node_type: '-', status: 'error', detail: 'Failed to decrypt access token' })
      await recordExecution(admin, bot.id, 'failed', log)
      return
    }

    const { data: contact } = await admin
      .from('contacts')
      .select('id, name, phone, tags')
      .eq('user_id', bot.user_id)
      .eq('phone', phone)
      .maybeSingle()

    const ctx: ExecContext = {
      admin,
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      contact: contact ?? null,
      message: message ?? {},
      log,
    }

    const nodes = bot.nodes ?? []
    const edges = bot.edges ?? []
    const startNode = nodes.find(n => n.id === START_NODE_ID || (n.data?.node_type ?? n.type) === 'trigger')

    if (!startNode) {
      log.push({ node_id: '-', node_type: '-', status: 'error', detail: 'Bot has no start node' })
      await recordExecution(admin, bot.id, 'failed', log)
      return
    }

    await walkFlow(ctx, nodes, edges, startNode)
  } catch (err) {
    log.push({ node_id: '-', node_type: '-', status: 'error', detail: err instanceof Error ? err.message : String(err) })
    status = 'failed'
  }

  await recordExecution(admin, bot.id, status, log)
}

async function recordExecution(
  admin: ReturnType<typeof supabaseAdmin>,
  botId: string,
  status: 'completed' | 'failed',
  log: LogEntry[],
) {
  await admin.from('bot_executions').insert({ bot_id: botId, status, log })
}

// ─── Flow walker ──────────────────────────────────────────────────────────────

interface ContactRow {
  id: string
  name: string | null
  phone: string
  tags?: string[] | null
}

interface ExecContext {
  admin: ReturnType<typeof supabaseAdmin>
  phoneNumberId: string
  accessToken: string
  to: string
  contact: ContactRow | null
  message: BotMessage
  log: LogEntry[]
}

function interpolate(text: string, ctx: ExecContext): string {
  return text
    .replace(/\{\{contact\.name\}\}/gi, ctx.contact?.name ?? '')
    .replace(/\{\{contact\.phone\}\}/gi, ctx.contact?.phone ?? ctx.to)
}

async function walkFlow(ctx: ExecContext, nodes: BotNode[], edges: BotEdge[], startNode: BotNode) {
  let node: BotNode | undefined = startNode
  const visited = new Set<string>()
  const findNode = (id: string) => nodes.find(n => n.id === id)
  const findEdge = (sourceId: string, handle: string) =>
    edges.find(e => e.source === sourceId && (e.sourceHandle ?? 'output') === handle)

  while (node && !visited.has(node.id)) {
    visited.add(node.id)
    const nodeType = node.data?.node_type ?? node.type ?? 'unknown'
    const cfg = node.data?.config ?? {}

    let nextHandle = 'output'

    if (nodeType === 'trigger') {
      // Skip — advance to the first connected action
    } else if (nodeType === 'send_message') {
      await runSendMessage(ctx, node.id, cfg)
    } else if (nodeType === 'send_template') {
      await runSendTemplate(ctx, node.id, cfg)
    } else if (nodeType === 'send_interactive_list') {
      await runSendInteractiveList(ctx, node.id, cfg)
    } else if (nodeType === 'send_media') {
      await runSendMedia(ctx, node.id, cfg)
    } else if (nodeType === 'delay') {
      const duration = (cfg.duration as number) ?? 1
      const unit = (cfg.unit as string) ?? 'minutes'
      ctx.log.push({ node_id: node.id, node_type: nodeType, status: 'skipped', detail: `Delay of ${duration} ${unit} — execution continues immediately (delays are not yet scheduled)` })
    } else if (nodeType === 'condition') {
      nextHandle = evaluateCondition(ctx, cfg) ? 'true' : 'false'
      ctx.log.push({ node_id: node.id, node_type: nodeType, status: 'ok', detail: `Branch → ${nextHandle}` })
    } else if (nodeType === 'goto') {
      const targetId = cfg.target_node_id as string | undefined
      const target = targetId ? findNode(targetId) : undefined
      if (target) {
        ctx.log.push({ node_id: node.id, node_type: nodeType, status: 'ok', detail: `Jumped to node ${target.id}` })
        node = target
        continue
      }
      ctx.log.push({ node_id: node.id, node_type: nodeType, status: 'error', detail: 'Go To target not found' })
      break
    } else {
      ctx.log.push({ node_id: node.id, node_type: nodeType, status: 'skipped', detail: `Unhandled node type "${nodeType}"` })
    }

    const edge = findEdge(node.id, nextHandle)
    if (!edge) break
    node = findNode(edge.target)
  }
}

function evaluateCondition(ctx: ExecContext, cfg: Record<string, unknown>): boolean {
  const field = (cfg.field as string) ?? 'message_text'
  const operator = (cfg.operator as string) ?? 'contains'
  const rawValue = ((cfg.value as string) ?? '').toLowerCase()

  let subject = ''
  if (field === 'message_text') subject = (ctx.message.text ?? '').toLowerCase()
  else if (field === 'contact_name') subject = (ctx.contact?.name ?? '').toLowerCase()
  else if (field === 'contact_tag') subject = (ctx.contact?.tags ?? []).join(',').toLowerCase()

  switch (operator) {
    case 'equals':      return subject === rawValue
    case 'starts_with': return subject.startsWith(rawValue)
    case 'contains':
    default:            return subject.includes(rawValue)
  }
}

async function runSendMessage(ctx: ExecContext, nodeId: string, cfg: Record<string, unknown>) {
  const text = (cfg.text as string) ?? ''
  if (!text) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_message', status: 'skipped', detail: 'No message text configured' })
    return
  }
  const interpolated = interpolate(text, ctx)
  try {
    await sendTextMessage({ phoneNumberId: ctx.phoneNumberId, accessToken: ctx.accessToken, to: ctx.to, text: interpolated })
    ctx.log.push({ node_id: nodeId, node_type: 'send_message', status: 'ok', detail: interpolated.slice(0, 80) })
  } catch (err) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_message', status: 'error', detail: err instanceof Error ? err.message : String(err) })
  }
}

async function runSendTemplate(ctx: ExecContext, nodeId: string, cfg: Record<string, unknown>) {
  const name = cfg.template_name as string | undefined
  if (!name) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_template', status: 'skipped', detail: 'No template selected' })
    return
  }
  const variables = (cfg.variables ?? {}) as Record<string, string>
  const params = Object.keys(variables)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => interpolate(variables[k] ?? '', ctx))
  try {
    await sendTemplateMessage({
      phoneNumberId: ctx.phoneNumberId, accessToken: ctx.accessToken, to: ctx.to,
      templateName: name, language: (cfg.language as string) ?? 'en_US', params,
    })
    ctx.log.push({ node_id: nodeId, node_type: 'send_template', status: 'ok', detail: name })
  } catch (err) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_template', status: 'error', detail: err instanceof Error ? err.message : String(err) })
  }
}

async function runSendInteractiveList(ctx: ExecContext, nodeId: string, cfg: Record<string, unknown>) {
  const body = (cfg.body as string) ?? ''
  const items = ((cfg.items ?? []) as { id: string; title: string; description?: string }[]).filter(i => i.title?.trim())
  if (!body || items.length === 0) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_interactive_list', status: 'skipped', detail: 'Body or list items missing' })
    return
  }
  try {
    await sendInteractiveListMessage({
      phoneNumberId: ctx.phoneNumberId, accessToken: ctx.accessToken, to: ctx.to,
      body: interpolate(body, ctx), buttonText: (cfg.button_text as string) || 'View options', items,
    })
    ctx.log.push({ node_id: nodeId, node_type: 'send_interactive_list', status: 'ok', detail: `${items.length} item(s)` })
  } catch (err) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_interactive_list', status: 'error', detail: err instanceof Error ? err.message : String(err) })
  }
}

async function runSendMedia(ctx: ExecContext, nodeId: string, cfg: Record<string, unknown>) {
  const url = (cfg.url as string) ?? ''
  const mediaType = ((cfg.media_type as string) ?? 'image') as 'image' | 'video' | 'document'
  if (!url) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_media', status: 'skipped', detail: 'No media URL configured' })
    return
  }
  try {
    await sendMediaMessage({
      phoneNumberId: ctx.phoneNumberId, accessToken: ctx.accessToken, to: ctx.to,
      mediaType, url, caption: cfg.caption ? interpolate(cfg.caption as string, ctx) : undefined,
    })
    ctx.log.push({ node_id: nodeId, node_type: 'send_media', status: 'ok', detail: url.slice(0, 80) })
  } catch (err) {
    ctx.log.push({ node_id: nodeId, node_type: 'send_media', status: 'error', detail: err instanceof Error ? err.message : String(err) })
  }
}

// ─── Inbound message_received dispatch ────────────────────────────────────────

/** Checks active `message_received` bots and runs the first one whose keyword matches. */
export async function runMessageReceivedBots({
  userId,
  phone,
  message,
}: {
  userId: string
  phone: string
  message: BotMessage
}): Promise<void> {
  try {
    const admin = supabaseAdmin()
    const { data: bots, error } = await admin
      .from('bots')
      .select('id, user_id, status, trigger, nodes, edges')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('trigger', 'message_received')

    if (error) {
      console.error('[bot-studio] Failed to fetch bots:', error.message)
      return
    }
    if (!bots || bots.length === 0) return

    for (const bot of bots as BotRow[]) {
      const startNode = (bot.nodes ?? []).find(n => n.id === START_NODE_ID || (n.data?.node_type ?? n.type) === 'trigger')
      const cfg = (startNode?.data?.config ?? {}) as MessageReceivedConfig
      if (!matchesMessageReceivedTrigger(cfg, message)) continue

      console.log(`[bot-studio] Inbound message matched bot ${bot.id.slice(-8)} — executing`)
      await executeBotForPhone({ bot, phone, message })
      return // fire only the first matching bot
    }
  } catch (err) {
    console.error('[bot-studio] runMessageReceivedBots threw:', err instanceof Error ? err.message : err)
  }
}
