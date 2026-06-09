import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'

/**
 * Drain drip_enrollments whose next_send_at <= now and status = 'active'.
 * Requires x-cron-secret header matching DRIP_CRON_SECRET env var.
 *
 * For each due enrollment:
 *   1. Loads the current step from drip_steps.
 *   2. Sends the message via WhatsApp.
 *   3. Advances to the next step, or marks completed if no more steps.
 *   4. Sets next_send_at = now + next step's delay.
 */
export async function GET(request: Request) {
  const expected = process.env.DRIP_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  if (request.headers.get('x-cron-secret') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()

  // Find due enrollments (up to 50 per invocation)
  const { data: due, error } = await admin
    .from('drip_enrollments')
    .select('*, drip_campaigns(user_id, is_active), contacts(phone, name)')
    .eq('status', 'active')
    .lte('next_send_at', new Date().toISOString())
    .order('next_send_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const enrollment of due) {
    const campaign = enrollment.drip_campaigns as { user_id: string; is_active: boolean } | null
    const contact = enrollment.contacts as { phone: string; name: string | null } | null

    // Skip if campaign deactivated or contact deleted
    if (!campaign?.is_active || !contact?.phone) {
      await admin.from('drip_enrollments').update({ status: 'stopped' }).eq('id', enrollment.id)
      continue
    }

    const phone = sanitizePhoneForMeta(contact.phone)
    if (!isValidE164(phone)) {
      await admin.from('drip_enrollments').update({ status: 'stopped' }).eq('id', enrollment.id)
      continue
    }

    // Load the current step
    const { data: step } = await admin
      .from('drip_steps')
      .select('*')
      .eq('drip_campaign_id', enrollment.drip_campaign_id)
      .eq('step_order', enrollment.current_step)
      .maybeSingle()

    if (!step) {
      // No step found — mark completed
      await admin.from('drip_enrollments').update({ status: 'completed' }).eq('id', enrollment.id)
      continue
    }

    // Load WhatsApp config for the workspace owner
    const { data: config } = await admin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('user_id', campaign.user_id)
      .maybeSingle()

    if (!config) {
      await admin.from('drip_enrollments').update({ status: 'stopped' }).eq('id', enrollment.id)
      continue
    }

    const accessToken = decrypt(config.access_token)

    // Interpolate {{name}} / {{phone}} into text messages
    const interpolate = (text: string) =>
      text
        .replace(/\{\{name\}\}/gi, contact.name ?? '')
        .replace(/\{\{phone\}\}/gi, contact.phone)

    try {
      let waResult: { messageId: string } | null = null
      let sentText: string | null = null
      let sentTemplate: string | null = null

      if (step.message_type === 'text' && step.content) {
        sentText = interpolate(step.content)
        waResult = await sendTextMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          text: sentText,
        })
      } else if (step.message_type === 'template' && step.template_name) {
        sentTemplate = step.template_name as string
        const vars = step.template_variables as Record<string, string> | null
        const params = vars ? Object.values(vars).map(interpolate) : []
        waResult = await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: phone,
          templateName: sentTemplate,
          language: step.template_language ?? 'en_US',
          params,
        })
      }

      if (waResult) {
        // Look up the conversation for this contact so the message appears in the inbox
        const { data: conv } = await admin
          .from('conversations')
          .select('id')
          .eq('contact_id', enrollment.contact_id as string)
          .eq('user_id', campaign.user_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (conv?.id) {
          const lastText = sentTemplate ? `[template:${sentTemplate}]` : sentText
          await admin.from('messages').insert({
            conversation_id: conv.id,
            sender_type: 'bot',
            content_type: sentTemplate ? 'template' : 'text',
            content_text: sentText,
            template_name: sentTemplate,
            message_id: waResult.messageId,
            status: 'sent',
            source: 'drip',
          })
          await admin.from('conversations').update({
            last_message_text: lastText,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message_source: 'drip',
          }).eq('id', conv.id)
        }
      }
    } catch {
      // Sending failed — still advance to avoid getting stuck; log and continue
      console.error(`[drip-cron] Failed to send step ${step.step_order} to ${phone}`)
    }

    // Advance to next step
    const { data: nextStep } = await admin
      .from('drip_steps')
      .select('step_order, delay_value, delay_unit')
      .eq('drip_campaign_id', enrollment.drip_campaign_id)
      .eq('step_order', enrollment.current_step + 1)
      .maybeSingle()

    if (nextStep) {
      const delayMs =
        nextStep.delay_unit === 'minutes' ? nextStep.delay_value * 60_000
        : nextStep.delay_unit === 'hours' ? nextStep.delay_value * 3_600_000
        : nextStep.delay_value * 86_400_000

      await admin.from('drip_enrollments').update({
        current_step: nextStep.step_order,
        next_send_at: new Date(Date.now() + delayMs).toISOString(),
      }).eq('id', enrollment.id)
    } else {
      await admin.from('drip_enrollments').update({ status: 'completed' }).eq('id', enrollment.id)
    }

    processed++
  }

  return NextResponse.json({ processed })
}
