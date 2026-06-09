-- Add source tracking to messages and conversations

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_source TEXT;
