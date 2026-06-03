-- ============================================================
-- 011_drip_campaigns.sql — Drip Campaign / Sequence feature
--
-- Idempotent migration — safe to run multiple times.
-- ============================================================

-- ============================================================
-- DRIP_CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS drip_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('new_contact', 'tag_added', 'manual')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_campaigns_user ON drip_campaigns(user_id);

ALTER TABLE drip_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own drip campaigns" ON drip_campaigns;
CREATE POLICY "Users can manage own drip campaigns" ON drip_campaigns FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

DROP TRIGGER IF EXISTS set_updated_at ON drip_campaigns;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON drip_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DRIP_STEPS
-- step_order — 1-based position in the sequence
-- delay_value / delay_unit — how long to wait before sending this step
--   (delay is relative to the PREVIOUS step's send time, or enrollment
--    for step 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS drip_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drip_campaign_id UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'template')),
  content TEXT,
  template_name TEXT,
  template_language TEXT DEFAULT 'en_US',
  template_variables JSONB DEFAULT '{}',
  delay_value INTEGER NOT NULL DEFAULT 0,
  delay_unit TEXT NOT NULL DEFAULT 'minutes' CHECK (delay_unit IN ('minutes', 'hours', 'days')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(drip_campaign_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_drip_steps_campaign ON drip_steps(drip_campaign_id, step_order);

ALTER TABLE drip_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage drip steps" ON drip_steps;
CREATE POLICY "Users can manage drip steps" ON drip_steps FOR ALL
  USING (EXISTS (
    SELECT 1 FROM drip_campaigns dc
    WHERE dc.id = drip_steps.drip_campaign_id
      AND (dc.user_id = auth.uid() OR is_workspace_member(dc.user_id))
  ));

-- ============================================================
-- DRIP_ENROLLMENTS
-- current_step — the step_order of the NEXT step to execute
--   (starts at 1 on enrollment)
-- next_send_at — when to execute current_step
-- ============================================================
CREATE TABLE IF NOT EXISTS drip_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drip_campaign_id UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_send_at TIMESTAMPTZ NOT NULL,
  UNIQUE(drip_campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_drip_enrollments_campaign ON drip_enrollments(drip_campaign_id);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_due
  ON drip_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_contact ON drip_enrollments(contact_id);

ALTER TABLE drip_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage drip enrollments" ON drip_enrollments;
CREATE POLICY "Users can manage drip enrollments" ON drip_enrollments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM drip_campaigns dc
    WHERE dc.id = drip_enrollments.drip_campaign_id
      AND (dc.user_id = auth.uid() OR is_workspace_member(dc.user_id))
  ));
