import { NextResponse, after } from 'next/server'

// Tell Vercel to allow the maximum duration for this route.
// Free tier: 10 s.  Pro: 60 s.  Change to 60 after upgrading.
export const maxDuration = 10
import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { normalizePhone, phonesMatch } from '@/lib/whatsapp/phone-utils'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { runChatbotsForContact } from '@/lib/chatbot/runner'

// Lazy-initialized to avoid build-time crash when env vars are missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

interface WhatsAppMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; caption?: string }
  video?: { id: string; mime_type: string; caption?: string }
  document?: { id: string; mime_type: string; filename?: string; caption?: string }
  audio?: { id: string; mime_type: string }
  sticker?: { id: string; mime_type: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  reaction?: { message_id: string; emoji: string }
}

interface WhatsAppWebhookEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata: {
        display_phone_number: string
        phone_number_id: string
      }
      contacts?: Array<{
        profile: { name: string }
        wa_id: string
      }>
      messages?: WhatsAppMessage[]
      statuses?: Array<{
        id: string
        status: string
        timestamp: string
        recipient_id: string
      }>
    }
    field: string
  }>
}

// GET - Webhook verification
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const challenge = searchParams.get('hub.challenge')
    const verifyToken = searchParams.get('hub.verify_token')

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 }
      )
    }

    // Fetch all whatsapp configs to check verify tokens
    const { data: configs, error: configError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id, verify_token')

    if (configError || !configs) {
      console.error('Error fetching configs for verification:', configError)
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 403 }
      )
    }

    // Check if any config's verify_token matches. Also collect the
    // matching row so we can opportunistically upgrade its token to
    // GCM if it was still in the legacy CBC format.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchedConfig: any = null
    for (const config of configs) {
      if (!config.verify_token) continue
      try {
        if (decrypt(config.verify_token) === verifyToken) {
          matchedConfig = config
          break
        }
      } catch {
        // Malformed / wrong-key token row — skip it and keep checking.
      }
    }

    if (matchedConfig) {
      // Fire-and-forget GCM upgrade. Safe to run on every subscribe
      // since it's a no-op once the column is already GCM.
      if (isLegacyFormat(matchedConfig.verify_token)) {
        void supabaseAdmin()
          .from('whatsapp_config')
          .update({ verify_token: encrypt(verifyToken) })
          .eq('id', matchedConfig.id)
          .then(({ error }: { error: unknown }) => {
            if (error) {
              console.warn(
                '[webhook] verify_token GCM upgrade failed:',
                (error as { message?: string })?.message ?? error,
              )
            }
          })
      }
      // Return challenge as plain text
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return NextResponse.json(
      { error: 'Verification token mismatch' },
      { status: 403 }
    )
  } catch (error) {
    console.error('Error in webhook GET verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Receive messages
export async function POST(request: Request) {
  // Read raw body first so we can HMAC-verify the exact bytes Meta
  // signed. request.json() would re-encode and break the signature.
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    // 401 (not 200) — we want Meta's delivery dashboard to show failures
    // loudly if a misconfiguration causes signatures to stop matching,
    // rather than silently eating events.
    console.warn('[webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: { entry?: WhatsAppWebhookEntry[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // `after()` registers work with Next.js / Vercel's waitUntil mechanism.
  // Unlike a bare fire-and-forget promise, this guarantees the serverless
  // function stays alive until processWebhook settles — so DB writes are
  // never dropped when Vercel tears down the function after sending the 200.
  after(async () => {
    try {
      await processWebhook(body)
    } catch (error) {
      console.error('Error processing webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processWebhook(body: { entry?: WhatsAppWebhookEntry[] }) {
  if (!body.entry) return

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      const value = change.value

      // Handle status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status)
        }
      }

      // Handle incoming messages
      if (!value.messages || !value.contacts) continue

      const phoneNumberId = value.metadata.phone_number_id

      // Find user's config by phone_number_id
      const { data: config, error: configError } = await supabaseAdmin()
        .from('whatsapp_config')
        .select('*')
        .eq('phone_number_id', phoneNumberId)
        .single()

      if (configError || !config) {
        console.error('[webhook] No config found for phone_number_id:', phoneNumberId, configError?.message)
        continue
      }
      console.log(`[webhook] Config found for phone_number_id: ${phoneNumberId} → userId: ${config.user_id.slice(-8)}`)

      // Decrypt is the most common silent failure point: if ENCRYPTION_KEY
      // is missing or was rotated since the token was saved, decrypt()
      // throws. Without this try/catch the exception would propagate to
      // processWebhook's .catch() handler (which only logs), and the
      // webhook would have already returned 200 — Meta considers the
      // delivery successful while no messages are saved to the DB.
      let decryptedAccessToken: string
      try {
        decryptedAccessToken = decrypt(config.access_token)
      } catch (err) {
        console.error(
          '[webhook] Failed to decrypt access_token for phone_number_id:',
          phoneNumberId,
          err instanceof Error ? err.message : err,
        )
        continue
      }

      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i]
        const contact = value.contacts[i] || value.contacts[0]

        await processMessage(
          message,
          contact,
          config.user_id,
          decryptedAccessToken
        )
      }
    }
  }
}

// The happy-path status ladder — pending → sent → delivered → read →
// replied. Webhook replays must never regress a recipient back down
// this ladder.
//
// `failed` is NOT on this ladder. It's a terminal side branch that is
// only valid from the early states (pending / sent) — once Meta has
// delivered or the user has read or replied, a later "failed" status
// event is a bug in Meta's pipeline or a spoof attempt and must be
// ignored.
const RECIPIENT_STATUS_LADDER = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
] as const

function ladderLevel(s: string): number {
  const idx = (RECIPIENT_STATUS_LADDER as readonly string[]).indexOf(s)
  return idx < 0 ? -1 : idx
}

/**
 * Can a recipient transition from `current` to `incoming`?
 *   - Along the ladder, only forward moves are allowed.
 *   - `failed` is accepted only from `pending` or `sent`; it's refused
 *     once the recipient has reached any of the success states.
 */
function isValidStatusTransition(current: string, incoming: string): boolean {
  if (incoming === 'failed') {
    return current === 'pending' || current === 'sent'
  }
  if (current === 'failed') {
    return false // failed is terminal
  }
  const ci = ladderLevel(current)
  const ii = ladderLevel(incoming)
  if (ii < 0) return false // unknown incoming status
  if (ci < 0) return true // unknown current — accept anything on the ladder
  return ii > ci
}

async function handleStatusUpdate(status: {
  id: string
  status: string
  timestamp: string
  recipient_id: string
}) {
  // 1) Mirror onto messages (legacy behavior) — Meta's status values
  //    already match the CHECK constraint on messages.status.
  const { error: msgErr } = await supabaseAdmin()
    .from('messages')
    .update({ status: status.status })
    .eq('message_id', status.id)

  if (msgErr) {
    console.error('Error updating message status:', msgErr)
  }

  // 2) Mirror onto broadcast_recipients via whatsapp_message_id
  //    (added in migration 003). The aggregate trigger on
  //    broadcast_recipients re-derives the parent broadcast's
  //    sent/delivered/read/failed counts automatically.
  const tsIso = new Date(parseInt(status.timestamp) * 1000).toISOString()

  const { data: recipient, error: recFetchErr } = await supabaseAdmin()
    .from('broadcast_recipients')
    .select('id, status')
    .eq('whatsapp_message_id', status.id)
    .maybeSingle()

  if (recFetchErr) {
    console.error('Error fetching broadcast recipient:', recFetchErr)
    return
  }
  if (!recipient) return // message wasn't part of a broadcast — fine

  // Guard transitions — forward-only on the success ladder, and
  // `failed` only from pre-delivered states.
  if (!isValidStatusTransition(recipient.status, status.status)) return

  const update: Record<string, unknown> = { status: status.status }
  if (status.status === 'sent' && !('sent_at' in update)) update.sent_at = tsIso
  if (status.status === 'delivered') update.delivered_at = tsIso
  if (status.status === 'read') update.read_at = tsIso

  const { error: recUpdateErr } = await supabaseAdmin()
    .from('broadcast_recipients')
    .update(update)
    .eq('id', recipient.id)

  if (recUpdateErr) {
    console.error('Error updating broadcast recipient status:', recUpdateErr)
  }
}

/**
 * If an inbound message's sender is on a still-unreplied
 * broadcast_recipients row, flip it to `replied` so the reply count
 * advances on the parent broadcast.
 *
 * Runs on a best-effort basis — failures here must not break the
 * main inbound-message flow, so errors are swallowed with a log.
 */
async function flagBroadcastReplyIfAny(userId: string, contactId: string) {
  try {
    // Most recent outbound broadcast that hasn't been replied to yet.
    const { data: recs, error } = await supabaseAdmin()
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(user_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.user_id', userId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    const { error: updErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updErr) {
      console.error('Error marking broadcast recipient replied:', updErr)
    }
  } catch (err) {
    console.error('flagBroadcastReplyIfAny failed:', err)
  }
}

async function processMessage(
  message: WhatsAppMessage,
  contact: { profile: { name: string }; wa_id: string },
  userId: string,
  accessToken: string
) {
  const senderPhone = normalizePhone(message.from)
  const contactName = contact.profile.name
  const inboundText = message.text?.body ?? ''

  console.log(`[webhook] Received message: "${inboundText.slice(0, 80)}" type=${message.type} from=...${senderPhone.slice(-4)}`)

  // ── 1. Parse message content ─────────────────────────────────────────────
  const { contentText, mediaUrl, mediaType } = await parseMessageContent(message, accessToken)
  void mediaType

  // ── 2. Resolve contact ───────────────────────────────────────────────────
  const contactOutcome = await findOrCreateContact(userId, senderPhone, contactName)
  if (!contactOutcome) {
    console.error('[webhook] findOrCreateContact returned null — aborting')
    return
  }
  const contactRecord = contactOutcome.contact
  console.log(`[webhook] Contact resolved: id=${contactRecord.id.slice(-8)} wasCreated=${contactOutcome.wasCreated}`)

  // ── 3. Resolve conversation ──────────────────────────────────────────────
  const conversation = await findOrCreateConversation(userId, contactRecord.id)
  if (!conversation) {
    console.error('[webhook] findOrCreateConversation returned null — aborting')
    return
  }
  console.log(`[webhook] Conversation resolved: id=${conversation.id.slice(-8)}`)

  // ── 4. Map content type to allowed DB values ─────────────────────────────
  const ALLOWED_CONTENT_TYPES = new Set([
    'text', 'image', 'document', 'audio', 'video', 'location', 'template',
  ])
  const contentType = ALLOWED_CONTENT_TYPES.has(message.type)
    ? message.type
    : message.type === 'sticker' ? 'image' : 'text'

  // ── 5. Determine if this is the contact's first ever inbound message ─────
  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  // ── 6. Deduplicate (Meta replays on timeout) ─────────────────────────────
  if (message.id) {
    const { data: dup } = await supabaseAdmin()
      .from('messages')
      .select('id')
      .eq('message_id', message.id)
      .maybeSingle()
    if (dup) {
      console.log(`[webhook] Duplicate message_id=${message.id} — skipping`)
      return
    }
  }

  // ── 7. Save message to DB ────────────────────────────────────────────────
  const { error: msgError } = await supabaseAdmin().from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: message.id,
    status: 'delivered',
    created_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
  })

  if (msgError) {
    console.error('[webhook] DB insert failed:', msgError.message, msgError.details)
    return
  }
  console.log('[webhook] Message saved to DB ✓')

  // ── 8. Update conversation preview ──────────────────────────────────────
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: contentText || `[${message.type}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  // ── 9. Broadcast reply tracking ──────────────────────────────────────────
  await flagBroadcastReplyIfAny(userId, contactRecord.id)

  // ── 10. Chatbot engine ───────────────────────────────────────────────────
  // MUST be awaited — fire-and-forget is not tracked by after() so Vercel
  // can kill the promise before it completes.
  console.log(`[chatbot] Checking bots for user: ${userId.slice(-8)}`)
  try {
    await runChatbotsForContact({
      userId,
      contactId: contactRecord.id,
      conversationId: conversation.id,
      message: { text: contentText ?? inboundText ?? undefined, type: message.type },
    })
    console.log('[chatbot] Bot check complete ✓')
  } catch (err) {
    console.error('[chatbot] Runner threw:', err instanceof Error ? err.message : err)
  }

  // ── 11. Automation engine ────────────────────────────────────────────────
  const msgText = contentText ?? inboundText
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  )[] = ['new_message_received', 'keyword_match']
  if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')

  console.log(`[automation] Firing triggers for user: ${userId.slice(-8)} triggers=${automationTriggers.join(',')}`)
  try {
    await Promise.allSettled(
      automationTriggers.map((triggerType) =>
        runAutomationsForTrigger({
          userId,
          triggerType,
          contactId: contactRecord.id,
          context: { message_text: msgText, conversation_id: conversation.id },
        }),
      ),
    )
    console.log('[automation] All triggers dispatched ✓')
  } catch (err) {
    console.error('[automation] Dispatch threw:', err instanceof Error ? err.message : err)
  }

  // ── 12. AI agent ─────────────────────────────────────────────────────────
  console.log(`[ai-agent] Checking for active AI agent for user: ${userId.slice(-8)}`)
  try {
    await runAIAgentIfActive({
      userId,
      contactId: contactRecord.id,
      conversationId: conversation.id,
      inboundText: msgText,
      phoneNumberId: '', // resolved inside the function from DB config
      accessToken,
      contactPhone: senderPhone,
    })
  } catch (err) {
    console.error('[ai-agent] Agent threw:', err instanceof Error ? err.message : err)
  }
}

// ─── AI agent runner ─────────────────────────────────────────────────────────

async function runAIAgentIfActive({
  userId,
  contactId,
  conversationId,
  inboundText,
  accessToken,
  contactPhone,
}: {
  userId: string
  contactId: string
  conversationId: string
  inboundText: string
  phoneNumberId: string
  accessToken: string
  contactPhone: string
}) {
  if (!inboundText.trim()) return // no text (image/audio) — skip

  // 1. Fetch active AI agent config
  const { data: agentRow } = await supabaseAdmin()
    .from('ai_agents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!agentRow) {
    console.log('[ai-agent] No active AI agent — skipping')
    return
  }
  console.log(`[ai-agent] Active agent found: "${agentRow.agent_name}"`)

  // 2. Get WhatsApp config for sending
  const { data: waConfig } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('user_id', userId)
    .maybeSingle()
  if (!waConfig) return

  let decryptedToken: string
  try {
    decryptedToken = decrypt(waConfig.access_token)
  } catch {
    console.error('[ai-agent] Failed to decrypt access_token')
    return
  }

  // 3. Fetch recent conversation history for context (last 10 messages)
  const { data: recentMsgs } = await supabaseAdmin()
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .in('sender_type', ['customer', 'bot', 'agent'])
    .order('created_at', { ascending: false })
    .limit(10)

  // Build message history for AI (oldest first, exclude current message — it's already at top)
  const history = (recentMsgs ?? [])
    .reverse()
    .filter((m) => m.content_text)
    .map((m) => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content_text as string,
    })) as { role: 'user' | 'assistant'; content: string }[]

  // 4. Call AI
  let reply: string
  try {
    const { buildSystemPrompt, callAI } = await import('@/lib/ai/agent-utils')
    const systemPrompt = buildSystemPrompt(agentRow, {
      currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    })
    reply = await callAI(agentRow, systemPrompt, history)
    console.log(`[ai-agent] Reply generated: "${reply.slice(0, 80)}"`)
  } catch (err) {
    console.error('[ai-agent] callAI failed:', err instanceof Error ? err.message : err)
    return
  }

  if (!reply?.trim()) return

  // 5. Send the reply via WhatsApp
  try {
    await (await import('@/lib/whatsapp/meta-api')).sendTextMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken: decryptedToken,
      to: contactPhone,
      text: reply,
    })
    console.log('[ai-agent] Reply sent via WhatsApp ✓')
  } catch (err) {
    console.error('[ai-agent] Send failed:', err instanceof Error ? err.message : err)
    return
  }

  // 6. Save bot message to DB so it appears in inbox
  await supabaseAdmin().from('messages').insert({
    conversation_id: conversationId,
    sender_type: 'bot',
    content_type: 'text',
    content_text: reply,
    status: 'sent',
  })

  // 7. Log to ai_agent_logs
  await supabaseAdmin().from('ai_agent_logs').insert({
    agent_id: agentRow.id,
    user_id: userId,
    contact_id: contactId,
    conversation_id: conversationId,
    user_message: inboundText,
    agent_response: reply,
    provider: agentRow.provider,
    model: agentRow.model,
    status: 'success',
  }).catch(() => {}) // non-critical
}

async function parseMessageContent(
  message: WhatsAppMessage,
  accessToken: string
): Promise<{
  contentText: string | null
  mediaUrl: string | null
  mediaType: string | null
}> {
  // getMediaUrl signature is (mediaId, accessToken) — earlier code had
  // the args swapped, so every verification hit an invalid Meta URL and
  // fell through to the catch block, leaving mediaUrl as null. That's
  // why images showed up as empty bubbles in the inbox.
  const verifyAndBuildUrl = async (
    mediaId: string
  ): Promise<string | null> => {
    try {
      await getMediaUrl({ mediaId, accessToken })
      return `/api/whatsapp/media/${mediaId}`
    } catch (error) {
      console.error(
        `Failed to verify media ${mediaId} with Meta:`,
        error instanceof Error ? error.message : error
      )
      return null
    }
  }

  switch (message.type) {
    case 'text':
      return {
        contentText: message.text?.body || null,
        mediaUrl: null,
        mediaType: null,
      }

    case 'image':
      if (message.image?.id) {
        return {
          contentText: message.image.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.image.id),
          mediaType: message.image.mime_type,
        }
      }
      return { contentText: null, mediaUrl: null, mediaType: null }

    case 'video':
      if (message.video?.id) {
        return {
          contentText: message.video.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.video.id),
          mediaType: message.video.mime_type,
        }
      }
      return { contentText: null, mediaUrl: null, mediaType: null }

    case 'document':
      if (message.document?.id) {
        return {
          contentText:
            message.document.caption || message.document.filename || null,
          mediaUrl: await verifyAndBuildUrl(message.document.id),
          mediaType: message.document.mime_type,
        }
      }
      return { contentText: null, mediaUrl: null, mediaType: null }

    case 'audio':
      if (message.audio?.id) {
        return {
          contentText: null,
          mediaUrl: await verifyAndBuildUrl(message.audio.id),
          mediaType: message.audio.mime_type,
        }
      }
      return { contentText: null, mediaUrl: null, mediaType: null }

    case 'sticker':
      // Stickers are images under the hood. Treat them as such so the
      // MessageBubble renders the <img>. The caller maps the DB
      // content_type to 'image' for the CHECK constraint.
      if (message.sticker?.id) {
        return {
          contentText: null,
          mediaUrl: await verifyAndBuildUrl(message.sticker.id),
          mediaType: message.sticker.mime_type,
        }
      }
      return { contentText: null, mediaUrl: null, mediaType: null }

    case 'location':
      if (message.location) {
        const loc = message.location
        const locationText = [loc.name, loc.address, `${loc.latitude},${loc.longitude}`]
          .filter(Boolean)
          .join(' - ')
        return {
          contentText: locationText,
          mediaUrl: null,
          mediaType: null,
        }
      }
      return { contentText: null, mediaUrl: null, mediaType: null }

    case 'reaction':
      return {
        contentText: message.reaction?.emoji || null,
        mediaUrl: null,
        mediaType: null,
      }

    default:
      return {
        contentText: `[Unsupported message type: ${message.type}]`,
        mediaUrl: null,
        mediaType: null,
      }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any

interface ContactOutcome {
  contact: ContactRow
  /** True when this call created the row; drives new_contact_created
   *  automation dispatch in processMessage. */
  wasCreated: boolean
}

async function findOrCreateContact(
  userId: string,
  phone: string,
  name: string
): Promise<ContactOutcome | null> {
  // 1. Fast path: exact phone match (uses the idx_contacts_phone index).
  const { data: exact, error: exactErr } = await supabaseAdmin()
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .eq('phone', phone)
    .maybeSingle()

  if (exactErr) {
    console.error('Error fetching contact (exact):', exactErr)
    return null
  }

  if (exact) {
    if (name && name !== exact.name) {
      await supabaseAdmin()
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', exact.id)
    }
    return { contact: exact, wasCreated: false }
  }

  // 2. Trunk-0 fallback: match by the last 8 digits so numbers stored
  //    with/without a country-code trunk prefix still deduplicate.
  //    We scope to a small candidate set via LIKE rather than loading
  //    all contacts into JS.
  if (phone.length >= 8) {
    const suffix = phone.slice(-8)
    const { data: candidates } = await supabaseAdmin()
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .like('phone', `%${suffix}`)
      .limit(5)

    const match = candidates?.find((c: ContactRow) => phonesMatch(c.phone, phone))
    if (match) {
      if (name && name !== match.name) {
        await supabaseAdmin()
          .from('contacts')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', match.id)
      }
      return { contact: match, wasCreated: false }
    }
  }

  // 3. New contact
  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({ user_id: userId, phone, name: name || phone })
    .select()
    .single()

  if (createError) {
    console.error('Error creating contact:', createError)
    return null
  }

  return { contact: newContact, wasCreated: true }
}

async function findOrCreateConversation(userId: string, contactId: string) {
  // Use array + limit(1) instead of .single() so that if duplicate
  // conversation rows somehow exist (race condition from a prior bug),
  // we return the most-recent one rather than erroring and creating yet
  // another orphan conversation.
  const { data: rows, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (findError) {
    console.error('Error fetching conversation:', findError)
    return null
  }

  if (rows && rows.length > 0) {
    return rows[0]
  }

  // Create new conversation
  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      user_id: userId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    console.error('Error creating conversation:', createError)
    return null
  }

  return newConv
}
