/**
 * Resolves a template's stored `header_content` into something an
 * <img>/<video> tag can load.
 *
 * - Locally-created templates store a public Supabase Storage URL.
 * - Templates synced from Meta store an opaque media handle (e.g.
 *   "4:abc123…") which must be fetched through our authenticated
 *   `/api/whatsapp/media/[mediaId]` proxy.
 */
export function getHeaderMediaSrc(headerContent?: string | null): string | null {
  if (!headerContent) return null
  if (/^https?:\/\//.test(headerContent)) return headerContent
  return `/api/whatsapp/media/${encodeURIComponent(headerContent)}`
}
