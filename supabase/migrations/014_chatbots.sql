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
