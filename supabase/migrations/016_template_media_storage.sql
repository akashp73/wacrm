-- ============================================================
-- 016_template_media_storage.sql
--
-- Creates the `template-media` Supabase Storage bucket and RLS
-- policies that let each user upload/manage sample header media
-- (image/video/document) for WhatsApp template review, while
-- letting everyone read (so Meta and <img>/<video> tags can fetch
-- the public URL without signed URLs).
--
-- File path convention used by the app:
--   template-media/{auth.uid()}/<timestamp>-<filename>
-- The policies rely on the first path segment matching auth.uid()::text.
--
-- Idempotent — safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'template-media',
  'template-media',
  TRUE,
  16777216, -- 16 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/3gpp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Template media is publicly readable" ON storage.objects;
CREATE POLICY "Template media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'template-media');

DROP POLICY IF EXISTS "Users can upload their own template media" ON storage.objects;
CREATE POLICY "Users can upload their own template media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'template-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own template media" ON storage.objects;
CREATE POLICY "Users can update their own template media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'template-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own template media" ON storage.objects;
CREATE POLICY "Users can delete their own template media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'template-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
