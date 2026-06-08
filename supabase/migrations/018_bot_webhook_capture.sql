-- Capture the most recent payload received on a bot's webhook trigger URL,
-- so the builder UI can show users a real example to map the phone-number field from.
alter table bots add column if not exists last_webhook_payload jsonb;
alter table bots add column if not exists last_webhook_at timestamptz;
