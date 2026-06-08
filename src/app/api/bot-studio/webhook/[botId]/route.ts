import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { executeBotForPhone } from '@/lib/bot-studio/runner'

type Params = { params: Promise<{ botId: string }> }

/**
 * External trigger endpoint for bots whose Start node is configured
 * with the "Webhook" trigger. Any system can POST a JSON body here
 * with a `phone` (or `to` / `phone_number`) field to run the bot's
 * action graph for that recipient.
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

  const phone = String(body.phone ?? body.to ?? body.phone_number ?? '').trim()
  if (!phone) {
    return NextResponse.json({ error: 'Request body must include a `phone` field' }, { status: 400 })
  }

  const { data: bot, error } = await admin
    .from('bots')
    .select('id, user_id, status, trigger, nodes, edges')
    .eq('id', botId)
    .maybeSingle()

  if (error || !bot) {
    return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  }
  if (bot.status !== 'active') {
    return NextResponse.json({ error: 'Bot is not active' }, { status: 409 })
  }

  // Run inline — Vercel can kill untracked background work after the response is sent.
  await executeBotForPhone({
    bot,
    phone,
    message: { text: typeof body.message === 'string' ? body.message : undefined, type: 'text' },
  })

  return NextResponse.json({ success: true })
}
