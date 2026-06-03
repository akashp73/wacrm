-- ============================================================
-- 006_automations.sql — Automations feature
--
-- Idempotent migration — safe to run multiple times.
-- Follows the same conventions as 001_initial_schema.sql:
--   IF NOT EXISTS on tables/indexes, DROP IF EXISTS before
--   re-creating policies/triggers (Postgres has no
--   CREATE POLICY IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- AUTOMATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);
-- Partial index tuned for the engine's hot path: find active automations
-- whose trigger_type matches the fired event. RLS then narrows by user_id.
CREATE INDEX IF NOT EXISTS idx_automations_active_trigger
  ON automations(trigger_type) WHERE is_active = TRUE;

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
CREATE POLICY "Users can manage own automations" ON automations FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON automations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AUTOMATION_STEPS
--
-- `position`       — order within parent scope (root scope or a branch).
-- `parent_step_id` — NULL for root-level steps; set to the Condition
--                    step's id for steps that live inside one of its
--                    branches.
-- `branch`         — NULL for root steps. For children of a Condition,
--                    'yes' or 'no' identifying which path.
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  step_type TEXT NOT NULL,
  step_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id
  ON automation_steps(automation_id, position);
CREATE INDEX IF NOT EXISTS idx_automation_steps_parent
  ON automation_steps(parent_step_id) WHERE parent_step_id IS NOT NULL;

ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage steps of own automations" ON automation_steps;
CREATE POLICY "Users can manage steps of own automations" ON automation_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND a.user_id = auth.uid()
    )
  );

-- ============================================================
-- AUTOMATION_LOGS
--
-- user_id is denormalized for simple RLS; contact_id is nullable so
-- history survives contact deletion (mirrors migration 004's pattern
-- on broadcast_recipients / deals).
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  trigger_event TEXT NOT NULL,
  steps_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
  ON automation_logs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_logs(user_id);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own automation logs" ON automation_logs;
CREATE POLICY "Users can view own automation logs" ON automation_logs FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- AUTOMATION_PENDING_EXECUTIONS
--
-- Queue row created when a running automation hits a `wait` step.
-- The cron endpoint drains rows where run_at <= now() and status =
-- 'pending', flips them to 'running', and resumes the automation
-- from `next_step_position` with the saved `context` jsonb.
--
-- Service-role only — writes never originate from the browser, and
-- the engine uses the service-role client. No user policy exposed.
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_pending_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  log_id UUID REFERENCES automation_logs(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  next_step_position INTEGER NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_pending_due
  ON automation_pending_executions(run_at) WHERE status = 'pending';

ALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy for authenticated users — all
-- access is server-side via the service-role key.
-- ============================================================
-- 007_automations_increment_counter.sql
--
-- Atomic increment of automations.execution_count + refresh of
-- last_executed_at. Called via PostgREST RPC from the engine.
--
-- Before this, the engine did a read-modify-write:
--   UPDATE automations SET execution_count = <cached + 1> WHERE id = ...
-- so two concurrent dispatches (e.g. the same automation firing for
-- two different contacts in the same second) could both read N and
-- both write N+1, permanently losing one count.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_automation_execution_count(p_automation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE automations
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_automation_id;
$$;

-- Only the service role needs to call this (engine uses the
-- service-role client). Explicitly lock anon / authenticated out so
-- an authenticated user can't juice someone else's counter via RPC.
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_automation_execution_count(UUID) TO service_role;
-- ============================================================
-- 009_team_members.sql — Team Members feature
--
-- Idempotent migration — safe to run multiple times.
-- Follows the same conventions as prior migrations:
--   IF NOT EXISTS on tables/indexes, DROP IF EXISTS before
--   re-creating policies/functions/triggers.
-- ============================================================

-- ============================================================
-- TEAM_MEMBERS
-- owner_user_id  — workspace owner (auth.users)
-- member_user_id — filled on first login after invite accepted
-- role           — admin | agent | viewer
-- status         — pending (invited) | active (accepted)
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email TEXT NOT NULL,
  member_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'agent', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(owner_user_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(member_email);
CREATE INDEX IF NOT EXISTS idx_team_members_member_uid ON team_members(member_user_id)
  WHERE member_user_id IS NOT NULL;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their team
DROP POLICY IF EXISTS "Owners can manage team" ON team_members;
CREATE POLICY "Owners can manage team" ON team_members FOR ALL
  USING (auth.uid() = owner_user_id);

-- Members can view their own membership record (for auto-accept on login)
DROP POLICY IF EXISTS "Members can view own membership" ON team_members;
CREATE POLICY "Members can view own membership" ON team_members FOR SELECT
  USING (auth.uid() = member_user_id);

-- Members can update their own row to accept the invite
DROP POLICY IF EXISTS "Members can accept invite" ON team_members;
CREATE POLICY "Members can accept invite" ON team_members FOR UPDATE
  USING (auth.email() = member_email AND status = 'pending')
  WITH CHECK (auth.email() = member_email);

-- ============================================================
-- WORKSPACE ACCESS HELPER FUNCTIONS
-- Both are SECURITY DEFINER so they can read team_members
-- without exposing the table to arbitrary callers.
-- ============================================================

-- Returns TRUE if the current session user is an active member of
-- the workspace owned by `workspace_user_id`.
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE owner_user_id = workspace_user_id
      AND member_user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Returns TRUE if the current user can write to the workspace
-- (owner, admin, or agent — not viewer).
CREATE OR REPLACE FUNCTION workspace_writable(workspace_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    auth.uid() = workspace_user_id
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE owner_user_id = workspace_user_id
        AND member_user_id = auth.uid()
        AND status = 'active'
        AND role IN ('admin', 'agent')
    )
  );
$$;

-- Returns the role of the current user in a given workspace,
-- or NULL if they have no membership.
CREATE OR REPLACE FUNCTION workspace_role(workspace_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT CASE
    WHEN auth.uid() = workspace_user_id THEN 'owner'
    ELSE (
      SELECT role FROM team_members
      WHERE owner_user_id = workspace_user_id
        AND member_user_id = auth.uid()
        AND status = 'active'
      LIMIT 1
    )
  END;
$$;

-- ============================================================
-- UPDATE RLS ON EXISTING WORKSPACE TABLES
-- Pattern: SELECT open to all workspace members,
--          INSERT/UPDATE/DELETE restricted to write-capable roles.
-- ============================================================

-- CONTACTS
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
DROP POLICY IF EXISTS "Team members can read contacts" ON contacts;
DROP POLICY IF EXISTS "Team members can write contacts" ON contacts;

CREATE POLICY "Team members can read contacts" ON contacts FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Team members can write contacts" ON contacts
  FOR INSERT WITH CHECK (workspace_writable(user_id));

CREATE POLICY "Users can manage own contacts" ON contacts
  FOR UPDATE USING (workspace_writable(user_id));

DROP POLICY IF EXISTS "Users can delete own contacts" ON contacts;
CREATE POLICY "Users can delete own contacts" ON contacts
  FOR DELETE USING (workspace_writable(user_id));

-- TAGS
DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
DROP POLICY IF EXISTS "Team members can read tags" ON tags;
DROP POLICY IF EXISTS "Team members can write tags" ON tags;

CREATE POLICY "Team members can read tags" ON tags FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Team members can write tags" ON tags
  FOR INSERT WITH CHECK (workspace_writable(user_id));

CREATE POLICY "Users can manage own tags" ON tags
  FOR UPDATE USING (workspace_writable(user_id));

DROP POLICY IF EXISTS "Users can delete own tags" ON tags;
CREATE POLICY "Users can delete own tags" ON tags
  FOR DELETE USING (workspace_writable(user_id));

-- CONTACT_TAGS
DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
DROP POLICY IF EXISTS "Team members can read contact_tags" ON contact_tags;
DROP POLICY IF EXISTS "Team members can write contact_tags" ON contact_tags;

CREATE POLICY "Team members can read contact_tags" ON contact_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_tags.contact_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

CREATE POLICY "Team members can write contact_tags" ON contact_tags
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_tags.contact_id AND workspace_writable(c.user_id)
  ));

DROP POLICY IF EXISTS "Users can delete contact_tags" ON contact_tags;
CREATE POLICY "Users can delete contact_tags" ON contact_tags
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_tags.contact_id AND workspace_writable(c.user_id)
  ));

-- CUSTOM_FIELDS
DROP POLICY IF EXISTS "Users can manage own custom fields" ON custom_fields;
DROP POLICY IF EXISTS "Team members can read custom_fields" ON custom_fields;

CREATE POLICY "Team members can read custom_fields" ON custom_fields FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Users can manage own custom fields" ON custom_fields
  FOR ALL USING (workspace_writable(user_id));

-- CONTACT_CUSTOM_VALUES
DROP POLICY IF EXISTS "Users can manage custom values" ON contact_custom_values;
DROP POLICY IF EXISTS "Team members can read contact_custom_values" ON contact_custom_values;

CREATE POLICY "Team members can read contact_custom_values" ON contact_custom_values FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_custom_values.contact_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

CREATE POLICY "Users can manage custom values" ON contact_custom_values
  FOR ALL USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_custom_values.contact_id AND workspace_writable(c.user_id)
  ));

-- CONTACT_NOTES
DROP POLICY IF EXISTS "Users can manage own notes" ON contact_notes;
DROP POLICY IF EXISTS "Team members can read notes" ON contact_notes;

CREATE POLICY "Team members can read notes" ON contact_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_notes.contact_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

CREATE POLICY "Users can manage own notes" ON contact_notes
  FOR ALL USING (EXISTS (
    SELECT 1 FROM contacts c
    WHERE c.id = contact_notes.contact_id AND workspace_writable(c.user_id)
  ));

-- CONVERSATIONS
DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
DROP POLICY IF EXISTS "Team members can read conversations" ON conversations;
DROP POLICY IF EXISTS "Team members can write conversations" ON conversations;

CREATE POLICY "Team members can read conversations" ON conversations FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Team members can write conversations" ON conversations
  FOR INSERT WITH CHECK (workspace_writable(user_id));

CREATE POLICY "Users can manage own conversations" ON conversations
  FOR UPDATE USING (workspace_writable(user_id));

DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;
CREATE POLICY "Users can delete own conversations" ON conversations
  FOR DELETE USING (workspace_writable(user_id));

-- MESSAGES
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Service role can insert messages" ON messages;
DROP POLICY IF EXISTS "Team members can read messages" ON messages;

CREATE POLICY "Team members can read messages" ON messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

CREATE POLICY "Service role can insert messages" ON messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view own messages" ON messages
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id AND workspace_writable(c.user_id)
  ));

-- WHATSAPP_CONFIG
DROP POLICY IF EXISTS "Users can manage own config" ON whatsapp_config;
DROP POLICY IF EXISTS "Team members can read config" ON whatsapp_config;

CREATE POLICY "Team members can read config" ON whatsapp_config FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Users can manage own config" ON whatsapp_config
  FOR ALL USING (workspace_writable(user_id));

-- MESSAGE_TEMPLATES
DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
DROP POLICY IF EXISTS "Team members can read templates" ON message_templates;

CREATE POLICY "Team members can read templates" ON message_templates FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Users can manage own templates" ON message_templates
  FOR ALL USING (workspace_writable(user_id));

-- PIPELINES
DROP POLICY IF EXISTS "Users can manage own pipelines" ON pipelines;
DROP POLICY IF EXISTS "Team members can read pipelines" ON pipelines;
DROP POLICY IF EXISTS "Team members can write pipelines" ON pipelines;

CREATE POLICY "Team members can read pipelines" ON pipelines FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Team members can write pipelines" ON pipelines
  FOR INSERT WITH CHECK (workspace_writable(user_id));

CREATE POLICY "Users can manage own pipelines" ON pipelines
  FOR UPDATE USING (workspace_writable(user_id));

DROP POLICY IF EXISTS "Users can delete own pipelines" ON pipelines;
CREATE POLICY "Users can delete own pipelines" ON pipelines
  FOR DELETE USING (workspace_writable(user_id));

-- PIPELINE_STAGES
DROP POLICY IF EXISTS "Users can manage pipeline stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Team members can read pipeline_stages" ON pipeline_stages;

CREATE POLICY "Team members can read pipeline_stages" ON pipeline_stages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND (p.user_id = auth.uid() OR is_workspace_member(p.user_id))
  ));

CREATE POLICY "Users can manage pipeline stages" ON pipeline_stages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM pipelines p
    WHERE p.id = pipeline_stages.pipeline_id AND workspace_writable(p.user_id)
  ));

-- DEALS
DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
DROP POLICY IF EXISTS "Team members can read deals" ON deals;
DROP POLICY IF EXISTS "Team members can write deals" ON deals;

CREATE POLICY "Team members can read deals" ON deals FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Team members can write deals" ON deals
  FOR INSERT WITH CHECK (workspace_writable(user_id));

CREATE POLICY "Users can manage own deals" ON deals
  FOR UPDATE USING (workspace_writable(user_id));

DROP POLICY IF EXISTS "Users can delete own deals" ON deals;
CREATE POLICY "Users can delete own deals" ON deals
  FOR DELETE USING (workspace_writable(user_id));

-- BROADCASTS
DROP POLICY IF EXISTS "Users can manage own broadcasts" ON broadcasts;
DROP POLICY IF EXISTS "Team members can read broadcasts" ON broadcasts;

CREATE POLICY "Team members can read broadcasts" ON broadcasts FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Users can manage own broadcasts" ON broadcasts
  FOR ALL USING (workspace_writable(user_id));

-- BROADCAST_RECIPIENTS
DROP POLICY IF EXISTS "Users can manage broadcast recipients" ON broadcast_recipients;
DROP POLICY IF EXISTS "Team members can read broadcast_recipients" ON broadcast_recipients;

CREATE POLICY "Team members can read broadcast_recipients" ON broadcast_recipients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.id = broadcast_recipients.broadcast_id
      AND (b.user_id = auth.uid() OR is_workspace_member(b.user_id))
  ));

CREATE POLICY "Users can manage broadcast recipients" ON broadcast_recipients
  FOR ALL USING (EXISTS (
    SELECT 1 FROM broadcasts b
    WHERE b.id = broadcast_recipients.broadcast_id AND workspace_writable(b.user_id)
  ));

-- AUTOMATIONS
DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
DROP POLICY IF EXISTS "Team members can read automations" ON automations;

CREATE POLICY "Team members can read automations" ON automations FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Users can manage own automations" ON automations
  FOR ALL USING (workspace_writable(user_id));

-- AUTOMATION_STEPS
DROP POLICY IF EXISTS "Users can manage steps of own automations" ON automation_steps;
DROP POLICY IF EXISTS "Team members can read automation_steps" ON automation_steps;

CREATE POLICY "Team members can read automation_steps" ON automation_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = automation_steps.automation_id
      AND (a.user_id = auth.uid() OR is_workspace_member(a.user_id))
  ));

CREATE POLICY "Users can manage steps of own automations" ON automation_steps
  FOR ALL USING (EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = automation_steps.automation_id AND workspace_writable(a.user_id)
  ));

-- AUTOMATION_LOGS
DROP POLICY IF EXISTS "Users can view own automation logs" ON automation_logs;
DROP POLICY IF EXISTS "Team members can read automation_logs" ON automation_logs;

CREATE POLICY "Team members can read automation_logs" ON automation_logs FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "Users can view own automation logs" ON automation_logs
  FOR ALL USING (workspace_writable(user_id));
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
-- ============================================================
-- 013_ai_agents.sql — AI Agent configuration table
-- Idempotent migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_agents (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Activation
  is_active              BOOLEAN NOT NULL DEFAULT FALSE,

  -- Model config
  provider               TEXT NOT NULL DEFAULT 'anthropic'
                           CHECK (provider IN ('anthropic','openai','gemini','groq')),
  model                  TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  api_key_override       TEXT,          -- encrypted; user-supplied key
  temperature            FLOAT NOT NULL DEFAULT 0.7,
  max_tokens             INTEGER NOT NULL DEFAULT 500,
  response_format        TEXT NOT NULL DEFAULT 'balanced'
                           CHECK (response_format IN ('concise','balanced','detailed')),

  -- Business brain
  business_context       TEXT,
  agent_personality      TEXT,          -- "How should the agent behave?" instructions
  agent_name             TEXT NOT NULL DEFAULT 'Assistant',

  -- Greeting / fallback / escalation messages
  greeting_message       TEXT NOT NULL DEFAULT 'Hi {{contact_name}}! 👋 I''m {{agent_name}}, your virtual assistant. How can I help you today?',
  fallback_message       TEXT NOT NULL DEFAULT 'I''m not sure about that — let me connect you with our team who can help better. Please hold on!',
  escalation_message     TEXT NOT NULL DEFAULT 'I''m connecting you with one of our team members right now. They''ll be with you shortly! 🙏',

  -- Personality & tone
  tone                   TEXT NOT NULL DEFAULT 'friendly'
                           CHECK (tone IN ('friendly','formal','casual','direct','expert')),
  formality_level        INTEGER NOT NULL DEFAULT 3 CHECK (formality_level BETWEEN 1 AND 5),
  language_mode          TEXT NOT NULL DEFAULT 'auto'
                           CHECK (language_mode IN ('auto','fixed')),
  fixed_language         TEXT,
  use_emojis             BOOLEAN NOT NULL DEFAULT FALSE,
  use_bullet_points      BOOLEAN NOT NULL DEFAULT TRUE,
  always_end_with_question BOOLEAN NOT NULL DEFAULT FALSE,
  use_bold_words         BOOLEAN NOT NULL DEFAULT FALSE,
  keep_replies_short     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Guardrails (stored as text array / jsonb)
  guardrails             JSONB NOT NULL DEFAULT '["Never share internal pricing formulas","Never make promises about refunds","Never discuss competitor products"]'::jsonb,
  never_reveal_ai        BOOLEAN NOT NULL DEFAULT TRUE,
  never_share_customer_info BOOLEAN NOT NULL DEFAULT TRUE,
  never_process_payments BOOLEAN NOT NULL DEFAULT TRUE,

  -- Handoff settings
  handoff_keyword        TEXT NOT NULL DEFAULT 'HUMAN',
  auto_handoff_on_unknown BOOLEAN NOT NULL DEFAULT FALSE,
  send_handoff_message   BOOLEAN NOT NULL DEFAULT TRUE,
  notify_team_on_handoff BOOLEAN NOT NULL DEFAULT TRUE,
  handoff_assign_to      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Business hours
  business_hours_only    BOOLEAN NOT NULL DEFAULT FALSE,
  business_hours         JSONB NOT NULL DEFAULT '{}'::jsonb,
  timezone               TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  outside_hours_message  TEXT NOT NULL DEFAULT 'Thanks for reaching out! We''re currently closed. We''ll get back to you first thing tomorrow! 🙏',

  -- Conversation style (misc jsonb overflow)
  conversation_style     JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_user ON ai_agents(user_id);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own agent" ON ai_agents;
CREATE POLICY "Users can manage own agent" ON ai_agents FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

DROP TRIGGER IF EXISTS set_updated_at ON ai_agents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AI Agent Logs (lightweight — for Tab 6)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  input_text      TEXT,
  output_text     TEXT,
  provider        TEXT,
  model           TEXT,
  tokens_used     INTEGER,
  latency_ms      INTEGER,
  was_handoff     BOOLEAN NOT NULL DEFAULT FALSE,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_user ON ai_agent_logs(user_id, created_at DESC);

ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own logs" ON ai_agent_logs;
CREATE POLICY "Users can view own logs" ON ai_agent_logs FOR SELECT
  USING (auth.uid() = user_id OR is_workspace_member(user_id));
-- ============================================================
-- 014_chatbots.sql — Visual Chatbot Flow Builder
-- Idempotent migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS chatbots (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Untitled Bot',
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  folder     TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbots_user ON chatbots(user_id);
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own chatbots" ON chatbots;
CREATE POLICY "Users manage own chatbots" ON chatbots FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id));
DROP TRIGGER IF EXISTS set_updated_at ON chatbots;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chatbots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- Nodes
-- node_type: trigger | send_message | ask_question | smart_wait
--            | goto | assign_to_agent | save_variable
--            | stay_in_session | add_automation | ai_router
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_nodes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id  UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  node_type   TEXT NOT NULL,
  label       TEXT,
  config      JSONB NOT NULL DEFAULT '{}',
  position_x  FLOAT NOT NULL DEFAULT 100,
  position_y  FLOAT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_nodes_bot ON chatbot_nodes(chatbot_id);
ALTER TABLE chatbot_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own nodes" ON chatbot_nodes;
CREATE POLICY "Users manage own nodes" ON chatbot_nodes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM chatbots c
    WHERE c.id = chatbot_nodes.chatbot_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

-- ─────────────────────────────────────────────────────────────
-- Edges
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_edges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id     UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES chatbot_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES chatbot_nodes(id) ON DELETE CASCADE,
  source_handle  TEXT,       -- 'success' | 'invalid' | 'timeout' | 'yes' | 'no' etc.
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_edges_bot ON chatbot_edges(chatbot_id);
ALTER TABLE chatbot_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own edges" ON chatbot_edges;
CREATE POLICY "Users manage own edges" ON chatbot_edges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM chatbots c
    WHERE c.id = chatbot_edges.chatbot_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

-- ─────────────────────────────────────────────────────────────
-- Variables / Custom Fields
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_variables (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  var_type   TEXT NOT NULL DEFAULT 'text'
               CHECK (var_type IN ('text','number','email','phone','date','boolean')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chatbot_id, name)
);

ALTER TABLE chatbot_variables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own variables" ON chatbot_variables;
CREATE POLICY "Users manage own variables" ON chatbot_variables FOR ALL
  USING (EXISTS (
    SELECT 1 FROM chatbots c
    WHERE c.id = chatbot_variables.chatbot_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));

-- ─────────────────────────────────────────────────────────────
-- Sessions (runtime state per contact)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id      UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  current_node_id UUID REFERENCES chatbot_nodes(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','failed','waiting')),
  variables       JSONB NOT NULL DEFAULT '{}',
  retry_count     INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_bot  ON chatbot_sessions(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_contact ON chatbot_sessions(contact_id, status);
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sessions" ON chatbot_sessions;
CREATE POLICY "Users manage own sessions" ON chatbot_sessions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM chatbots c
    WHERE c.id = chatbot_sessions.chatbot_id
      AND (c.user_id = auth.uid() OR is_workspace_member(c.user_id))
  ));
DROP TRIGGER IF EXISTS set_updated_at ON chatbot_sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON chatbot_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
