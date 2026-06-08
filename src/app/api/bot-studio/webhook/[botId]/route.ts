import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { executeBotForPhone } from '@/lib/bot-studio/runner'
import { getByPath } from '@/lib/bot-studio/node-definitions'

type Params = { params: Promise<{ botId: string }> }

const START_NODE_ID = 'start'

interface BotNode {
  id: string
  type?: string
  data?: { node_type?: string; config?: Record<string, unknown>; label?: string }
}

/**
 * External trigger endpoint for bots whose Start node is configured with
 * the "On Webhook" trigger. Any system can POST an arbitrary JSON body
 * here to run the bot's action graph. The phone number is read out of the
 * body using the dot-path the user configured on the trigger node (e.g.
 * "data.phone"), falling back to common conventions when not configured.
 *
 * Every request's body is also stored as `bots.last_webhook_payload` so
 * the builder's "Capture Response" panel can show users a real example.
 */
export async function POST(request: Request, { params }: Params) {
  const { botId } = await params
  const admin = supabaseAdmin()

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // empty/non-JSON body — fall through, phone will be missing
  }

  const { data: bot, error } = await admin
    .from('bots')
    .select('id, user_id, status, trigger, nodes, edges')
    .eq('id', botId)
    .maybeSingle()

  if (error || !bot) {
    return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  }

  // Capture every payload (even on inactive bots / extraction failures) so the
  // builder's "Capture Response" UI always has a real example to map fields from.
  await admin.from('bots').update({ last_webhook_payload: body, last_webhook_at: new Date().toISOString() }).eq('id', botId)

  const nodes = (bot.nodes ?? []) as BotNode[]
  const startNode = nodes.find(n => n.id === START_NODE_ID || (n.data?.node_type ?? n.type) === 'trigger')
  const triggerCfg = (startNode?.data?.config ?? {}) as Record<string, unknown>
  const phoneField = (triggerCfg.phone_field as string) ?? ''

  const fromConfiguredPath = phoneField ? getByPath(body, phoneField) : undefined
  const phone = String(fromConfiguredPath ?? body.phone ?? body.to ?? body.phone_number ?? '').trim()

  if (!phone) {
    return NextResponse.json({
      error: phoneField
        ? `Could not find a phone number at "${phoneField}" in the request body`
        : 'Request body must include a `phone` field, or the trigger must have a phone number field configured',
    }, { status: 400 })
  }
  if (bot.status !== 'active') {
    return NextResponse.json({ error: 'Bot is not active' }, { status: 409 })
  }

  // Run inline — Vercel can kill untracked background work after the response is sent.
  await executeBotForPhone({
    bot,
    phone,
    message: { text: typeof body.message === 'string' ? body.message : undefined, type: 'text' },
    payload: body,
  })

  return NextResponse.json({ success: true })
}
