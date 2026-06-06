import { NextResponse } from 'next/server'
import { runChatbotsForContact } from '@/lib/chatbot/runner'

/**
 * POST /api/chatbots/execute
 *
 * HTTP entry-point for external webhook triggers and manual test calls.
 * The same logic runs inline from the WhatsApp webhook handler
 * (src/app/api/whatsapp/webhook/route.ts) without an HTTP round-trip.
 *
 * Body: { userId, contactId, conversationId?, message: { text?, type? } }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { userId, contactId, conversationId, message } = body

  if (!userId || !contactId) {
    return NextResponse.json(
      { error: 'userId and contactId required' },
      { status: 400 },
    )
  }

  await runChatbotsForContact({ userId, contactId, conversationId, message })
  return NextResponse.json({ ok: true })
}
