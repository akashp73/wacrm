-- ============================================================
-- 017_bots.sql — Bot Studio (visual bot builder)
--
-- Stores the entire flow graph as inline JSONB on the bot row
-- (no normalized node/edge tables — Bot Studio's React Flow
-- canvas saves/loads {nodes, edges} as a single JSON blob).
--
-- Idempotent migration — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Bot',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  trigger TEXT NOT NULL DEFAULT 'message_received' CHECK (trigger IN ('message_received', 'webhook')),
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_bots_active_trigger ON bots(status, trigger);

ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own bots" ON bots;
CREATE POLICY "Users manage own bots" ON bots FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id));

DROP TRIGGER IF EXISTS set_updated_at ON bots;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- BOT_EXECUTIONS
-- One row per run of a bot's action graph (webhook hit or
-- inbound-message trigger match). `log` records each node
-- visited and its outcome for debugging.
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  log JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_bot_executions_bot ON bot_executions(bot_id, triggered_at DESC);

ALTER TABLE bot_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own bot executions" ON bot_executions;
CREATE POLICY "Users manage own bot executions" ON bot_executions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM bots
    WHERE bots.id = bot_executions.bot_id
      AND (bots.user_id = auth.uid() OR is_workspace_member(bots.user_id))
  ));
