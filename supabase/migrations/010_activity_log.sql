-- ============================================================
-- 010_activity_log.sql — Activity / Reports feature
--
-- Idempotent migration — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'contact', 'conversation', 'deal', 'broadcast', 'automation', 'tag', 'message'
  )),
  entity_id UUID,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'updated', 'deleted',
    'message_sent', 'message_received',
    'deal_moved', 'deal_closed',
    'tag_added', 'tag_removed',
    'campaign_sent', 'automation_triggered',
    'conversation_assigned', 'conversation_closed'
  )),
  metadata JSONB DEFAULT '{}',
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activity" ON activity_log;
CREATE POLICY "Users can view own activity" ON activity_log FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

-- Service role inserts; no user INSERT policy (all logging is server-side).
