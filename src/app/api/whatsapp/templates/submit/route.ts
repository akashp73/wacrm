import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

const META_API_VERSION = 'v21.0'
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * POST /api/whatsapp/templates/submit
 *
 * Submits a template to Meta for review, then saves/updates the local
 * Supabase row. Body fields mirror the message_templates table plus an
 * optional `id` for updates.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    id,           // present for edits
    name, category, language,
    header_type, header_text, header_media_url,
    body_text, footer_text, buttons = [],
    sample_values = [],  // array of strings for body variables
  } = body

  if (!name || !category || !body_text) {
    return NextResponse.json({ error: 'name, category and body_text are required' }, { status: 400 })
  }

  // Load WhatsApp config
  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('waba_id, access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!config?.waba_id || !config?.access_token) {
    return NextResponse.json({ error: 'WhatsApp not configured — set WABA ID in settings first' }, { status: 400 })
  }

  const accessToken = decrypt(config.access_token)

  // Build Meta API payload
  const components: Record<string, unknown>[] = []

  // Header component
  if (header_type && header_type !== 'none') {
    if (header_type === 'text' && header_text) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: header_text,
        example: header_text.includes('{{1}}') ? { header_text: [header_text] } : undefined,
      })
    } else if (['image', 'video', 'document', 'location'].includes(header_type)) {
      components.push({ type: 'HEADER', format: header_type.toUpperCase() })
    }
  }

  // Body component
  const bodyComponent: Record<string, unknown> = {
    type: 'BODY',
    text: body_text,
  }
  if (sample_values.length > 0) {
    bodyComponent.example = { body_text: [sample_values] }
  }
  components.push(bodyComponent)

  // Footer component
  if (footer_text) {
    components.push({ type: 'FOOTER', text: footer_text })
  }

  // Buttons component
  if (buttons.length > 0) {
    const metaButtons = buttons.map((btn: Record<string, string>) => {
      if (btn.type === 'quick_reply')   return { type: 'QUICK_REPLY', text: btn.text }
      if (btn.type === 'url')           return { type: 'URL', text: btn.text, url: btn.url }
      if (btn.type === 'phone_number')  return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number }
      if (btn.type === 'copy_code')     return { type: 'COPY_CODE', example: btn.copy_code }
      return btn
    })
    components.push({ type: 'BUTTONS', buttons: metaButtons })
  }

  const metaPayload = {
    name,
    language,
    category: category.toUpperCase(),
    components,
  }

  // Submit to Meta
  const metaRes = await fetch(`${META_BASE}/${config.waba_id}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metaPayload),
  })

  const metaData = await metaRes.json()

  if (!metaRes.ok) {
    const msg = metaData?.error?.message ?? `Meta error ${metaRes.status}`
    return NextResponse.json({ error: msg, meta: metaData }, { status: 400 })
  }

  // Upsert local record
  const templateRow = {
    user_id: user.id,
    name,
    category,
    language,
    header_type: header_type === 'none' ? null : header_type,
    header_content: header_type === 'text' ? header_text : header_media_url ?? null,
    body_text,
    footer_text: footer_text ?? null,
    buttons: buttons.length ? buttons : null,
    status: 'Pending',
  }

  let dbError
  if (id) {
    const { error } = await supabase.from('message_templates').update(templateRow).eq('id', id).eq('user_id', user.id)
    dbError = error
  } else {
    const { error } = await supabase.from('message_templates').insert(templateRow)
    dbError = error
  }

  if (dbError) {
    console.error('DB upsert error:', dbError)
    return NextResponse.json({ error: 'Saved to Meta but failed to update local DB', meta: metaData }, { status: 207 })
  }

  return NextResponse.json({ success: true, meta_id: metaData.id, status: 'Pending' })
}
