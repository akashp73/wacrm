import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

const META_API_VERSION = 'v21.0'
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`
const META_UPLOAD_BASE = 'https://graph.facebook.com/v25.0'

/**
 * Uploads a media file to Meta's Resumable Upload API and returns the
 * opaque handle (e.g. "4:abc123…") required by media header components.
 *
 * Three-step process documented at:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#resumable-upload-api
 */
async function uploadMediaToMeta(fileUrl: string, headerType: string, accessToken: string, wabaId: string): Promise<string> {
  // Download file from Supabase Storage (or any public URL)
  const fileRes = await fetch(fileUrl)
  if (!fileRes.ok) throw new Error(`Could not download media file (${fileRes.status})`)
  const fileBuffer = await fileRes.arrayBuffer()
  const contentType = fileRes.headers.get('content-type') || fallbackMime(headerType)
  const fileName = decodeURIComponent(fileUrl.split('/').pop()?.split('?')[0] ?? `header.${extFor(headerType)}`)

  // Step A — create upload session against the WhatsApp Business Account.
  // ("/app/uploads" is not a valid Graph object — uploads must be created
  // under the WABA id, e.g. POST /{WABA_ID}/uploads.)
  const sessionUrl = new URL(`${META_UPLOAD_BASE}/${wabaId}/uploads`)
  sessionUrl.searchParams.set('file_length', String(fileBuffer.byteLength))
  sessionUrl.searchParams.set('file_type', contentType)
  sessionUrl.searchParams.set('file_name', fileName)

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const sessionData = await sessionRes.json() as Record<string, unknown>
  if (!sessionRes.ok || !sessionData.id) {
    console.error('[template-submit] Meta upload session error:', sessionRes.status, JSON.stringify(sessionData))
    throw new Error((sessionData?.error as Record<string, unknown>)?.message as string ?? 'Failed to create Meta upload session')
  }

  // Step B — upload raw bytes to the session
  const uploadRes = await fetch(`${META_UPLOAD_BASE}/${sessionData.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${accessToken}`,
      'file_offset': '0',
      'Content-Type': contentType,
    },
    body: fileBuffer,
  })
  const uploadData = await uploadRes.json() as Record<string, unknown>
  if (!uploadRes.ok || !uploadData.h) {
    console.error('[template-submit] Meta file upload error:', uploadRes.status, JSON.stringify(uploadData))
    throw new Error((uploadData?.error as Record<string, unknown>)?.message as string ?? 'Failed to upload media to Meta')
  }

  // Step C — caller uses uploadData.h as header_handle
  return uploadData.h as string
}

function fallbackMime(headerType: string): string {
  if (headerType === 'image')    return 'image/jpeg'
  if (headerType === 'video')    return 'video/mp4'
  if (headerType === 'document') return 'application/pdf'
  return 'application/octet-stream'
}

function extFor(headerType: string): string {
  if (headerType === 'image')    return 'jpg'
  if (headerType === 'video')    return 'mp4'
  if (headerType === 'document') return 'pdf'
  return 'bin'
}

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
    } else if (header_type === 'location') {
      components.push({ type: 'HEADER', format: 'LOCATION' })
    } else if (['image', 'video', 'document'].includes(header_type)) {
      const headerComponent: Record<string, unknown> = {
        type: 'HEADER',
        format: header_type.toUpperCase(),
      }
      if (header_media_url) {
        // Meta requires the file handle from its Resumable Upload API —
        // passing a URL or base64 directly is rejected with "Invalid parameter".
        try {
          const handle = await uploadMediaToMeta(header_media_url, header_type, accessToken, config.waba_id)
          headerComponent.example = { header_handle: [handle] }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to upload header media to Meta'
          console.error('[template-submit] Header media upload failed:', message)
          return NextResponse.json({ error: message }, { status: 400 })
        }
      }
      components.push(headerComponent)
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
    console.error('[template-submit] Meta template creation error:', metaRes.status, JSON.stringify(metaData))
    const msg = (metaData?.error as Record<string, unknown>)?.message as string ?? `Meta error ${metaRes.status}`
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
