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
