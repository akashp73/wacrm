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
