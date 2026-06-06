import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
} from '@/lib/whatsapp/phone-utils'

/**
 * Drain broadcasts whose scheduled_at <= now and status = 'scheduled'.
 * Meant to be hit on a schedule (e.g. every minute via Vercel Cron or
 * an external pinger). Requires x-cron-secret header matching
 * BROADCAST_CRON_SECRET env var.
 *
 * For each due broadcast:
 *   1. Claims it (status → 'sending') to prevent double-processing.
 *   2. Loads recipients + WhatsApp config for the workspace owner.
 *   3. Sends each pending recipient via the Meta API.
 *   4. Updates per-recipient status and broadcast aggregate counts.
 *   5. Marks the broadcast 'sent' (or 'failed' on fatal errors).
 */
export async function GET(request: Request) {
  const expected = process.env.BROADCAST_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret')
  if (supplied !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()

  // Find all broadcasts due to send
  const { data: due, error } = await admin
    .from('broadcasts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10) // process 10 per invocation to avoid timeouts

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const broadcast of due) {
    // Claim the broadcast (optimistic lock — skip if already claimed)
    const { data: claimed } = await admin
      .from('broadcasts')
      .update({ status: 'sending' })
      .eq('id', broadcast.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()

    if (!claimed) continue // another invocation claimed it

    try {
      // Load WhatsApp config for the workspace owner
      const { data: config } = await admin
        .from('whatsapp_config')
        .select('phone_number_id, access_token')
        .eq('user_id', broadcast.user_id)
        .maybeSingle()

      if (!config) {
        await admin
          .from('broadcasts')
          .update({ status: 'failed' })
          .eq('id', broadcast.id)
        continue
      }

      const accessToken = decrypt(config.access_token)

      // Load pending recipients
      const { data: recipients } = await admin
        .from('broadcast_recipients')
        .select('id, contact_id, contacts(phone)')
        .eq('broadcast_id', broadcast.id)
        .eq('status', 'pending')

      if (!recipients || recipients.length === 0) {
        await admin
          .from('broadcasts')
          .update({ status: 'sent' })
          .eq('id', broadcast.id)
        processed++
        continue
      }

      let sentCount = 0
      let failedCount = 0

      for (const recipient of recipients) {
        const contact = (recipient.contacts as unknown) as { phone: string } | null
        if (!contact?.phone) {
          await admin
            .from('broadcast_recipients')
            .update({ status: 'failed' })
            .eq('id', recipient.id)
          failedCount++
          continue
        }

        const phone = sanitizePhoneForMeta(contact.phone)
        if (!isValidE164(phone)) {
          await admin
            .from('broadcast_recipients')
            .update({ status: 'failed' })
            .eq('id', recipient.id)
          failedCount++
          continue
        }

        // Build template params from broadcast.template_variables if present
        const vars = broadcast.template_variables as Record<string, string> | null
        const params = vars ? Object.values(vars) : []

        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            templateName: broadcast.template_name,
            language: broadcast.template_language ?? 'en_US',
            params,
          })

          await admin
            .from('broadcast_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              whatsapp_message_id: result.messageId,
            })
            .eq('id', recipient.id)

          sentCount++

          // Save to inbox so the conversation shows the sent message
          const { data: conv } = await admin
            .from('conversations')
            .select('id')
            .eq('contact_id', recipient.contact_id)
            .eq('user_id', broadcast.user_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (conv?.id) {
            const lastText = `[template:${broadcast.template_name}]`
            await admin.from('messages').insert({
              conversation_id: conv.id,
              sender_type: 'bot',
              content_type: 'template',
              template_name: broadcast.template_name,
              message_id: result.messageId,
              status: 'sent',
            }).catch(() => {})
            await admin.from('conversations').update({
              last_message_text: lastText,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', conv.id)
          }
        } catch {
          await admin
            .from('broadcast_recipients')
            .update({ status: 'failed' })
            .eq('id', recipient.id)
          failedCount++
        }
      }

      // Update broadcast aggregate counts and mark sent
      await admin
        .from('broadcasts')
        .update({
          status: 'sent',
          sent_count: sentCount,
          failed_count: failedCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', broadcast.id)

      processed++
    } catch {
      // Non-fatal — mark failed and continue to next broadcast
      await admin
        .from('broadcasts')
        .update({ status: 'failed' })
        .eq('id', broadcast.id)
    }
  }

  return NextResponse.json({ processed })
}
