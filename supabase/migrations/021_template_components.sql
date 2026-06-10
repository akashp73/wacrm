-- Store the raw Meta `components` array alongside each template.
--
-- Why: media headers (IMAGE/VIDEO/DOCUMENT) don't carry their preview in
-- header_content the way text headers do — Meta returns an opaque
-- `example.header_handle` for them. Keeping the full components array
-- lets the UI (and future features) introspect the original Meta
-- payload without re-syncing.

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS components JSONB;
