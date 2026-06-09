import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { executeBotForPhone } from '@/lib/bot-studio/runner'
import { getByPath, normalizePhone, type PhoneFormatMode } from '@/lib/bot-studio/node-definitions'

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

  console.log(`[bot-studio webhook] bot ${botId} received payload:`, JSON.stringify(body))

  const { data: bot, error } = await admin
    .from('bots')
    .select('id, user_id, status, trigger, nodes, edges, last_webhook_payload, last_webhook_at')
    .eq('id', botId)
    .maybeSingle()

  if (error || !bot) {
    console.log(`[bot-studio webhook] bot ${botId} not found`)
    return NextResponse.json({ received: true, skipped: 'bot_not_found' })
  }

  // Deduplication: skip if same payload arrived within the last 10 seconds
  const nowMs = Date.now()
  const lastMs = bot.last_webhook_at ? new Date(bot.last_webhook_at as string).getTime() : 0
  if (
    nowMs - lastMs < 10_000 &&
    JSON.stringify(body) === JSON.stringify(bot.last_webhook_payload)
  ) {
    console.log(`[bot-studio webhook] bot ${botId} skipped — duplicate payload within 10s`)
    return NextResponse.json({ received: true, skipped: 'duplicate' })
  }

  // Always capture the payload first — even if execution is skipped below.
  await admin.from('bots').update({ last_webhook_payload: body, last_webhook_at: new Date().toISOString() }).eq('id', botId)

  if (bot.status !== 'active') {
    console.log(`[bot-studio webhook] bot ${botId} skipped — status is "${bot.status}"`)
    return NextResponse.json({ received: true, skipped: 'bot_not_active' })
  }

  const nodes = (bot.nodes ?? []) as BotNode[]
  const startNode = nodes.find(n => n.id === START_NODE_ID || (n.data?.node_type ?? n.type) === 'trigger')
  const triggerCfg = (startNode?.data?.config ?? {}) as Record<string, unknown>
  const phoneField = (triggerCfg.phone_field as string) ?? ''

  const fromConfiguredPath = phoneField ? getByPath(body, phoneField) : undefined
  const rawPhone = String(fromConfiguredPath ?? body.phone ?? body.to ?? body.phone_number ?? '').trim()
  const phone = normalizePhone(rawPhone, {
    mode: triggerCfg.phone_format as PhoneFormatMode,
    countryCode: triggerCfg.country_code as string,
  })

  if (!phone) {
    console.log(`[bot-studio webhook] bot ${botId} skipped — no phone number found in payload (phone_field="${phoneField}")`)
    return NextResponse.json({
      received: true,
      skipped: 'no_phone',
      hint: phoneField
        ? `Could not find a value at path "${phoneField}" in the request body`
        : 'Configure the "Phone number field" in the webhook trigger, or include a "phone" key in the body',
    })
  }

  console.log(`[bot-studio webhook] bot ${botId} executing for phone ${phone}`)

  try {
    await executeBotForPhone({
      bot,
      phone,
      message: { text: typeof body.message === 'string' ? body.message : undefined, type: 'text' },
      payload: body,
    })
  } catch (err) {
    console.error(`[bot-studio webhook] bot ${botId} execution threw:`, err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ received: true, phone })
}
