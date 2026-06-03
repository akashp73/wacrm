import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/chatbots/setup
 * Creates the chatbot tables if they don't exist.
 * Uses the service role key to run DDL via rpc.
 */
export async function POST() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const sql = `
    CREATE TABLE IF NOT EXISTS chatbots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Untitled Bot',
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      folder TEXT,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chatbot_nodes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
      node_type TEXT NOT NULL,
      label TEXT,
      config JSONB NOT NULL DEFAULT '{}',
      position_x FLOAT NOT NULL DEFAULT 100,
      position_y FLOAT NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chatbot_edges (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
      source_node_id UUID NOT NULL REFERENCES chatbot_nodes(id) ON DELETE CASCADE,
      target_node_id UUID NOT NULL REFERENCES chatbot_nodes(id) ON DELETE CASCADE,
      source_handle TEXT,
      label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chatbot_variables (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      var_type TEXT NOT NULL DEFAULT 'text',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(chatbot_id, name)
    );

    CREATE TABLE IF NOT EXISTS chatbot_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
      contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      current_node_id UUID REFERENCES chatbot_nodes(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      variables JSONB NOT NULL DEFAULT '{}',
      retry_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users manage own chatbots" ON chatbots;
    CREATE POLICY "Users manage own chatbots" ON chatbots FOR ALL USING (auth.uid() = user_id);

    ALTER TABLE chatbot_nodes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users manage own nodes" ON chatbot_nodes;
    CREATE POLICY "Users manage own nodes" ON chatbot_nodes FOR ALL
      USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_nodes.chatbot_id AND chatbots.user_id = auth.uid()));

    ALTER TABLE chatbot_edges ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users manage own edges" ON chatbot_edges;
    CREATE POLICY "Users manage own edges" ON chatbot_edges FOR ALL
      USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_edges.chatbot_id AND chatbots.user_id = auth.uid()));

    ALTER TABLE chatbot_variables ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users manage own variables" ON chatbot_variables;
    CREATE POLICY "Users manage own variables" ON chatbot_variables FOR ALL
      USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_variables.chatbot_id AND chatbots.user_id = auth.uid()));

    ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users manage own sessions" ON chatbot_sessions;
    CREATE POLICY "Users manage own sessions" ON chatbot_sessions FOR ALL
      USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_sessions.chatbot_id AND chatbots.user_id = auth.uid()));
  `

  let error: { message: string } | null = null
  try {
    const result = await admin.rpc('exec_sql', { sql })
    error = result.error as typeof error
  } catch {
    error = { message: 'rpc not available' }
  }

  // If rpc not available, try raw query approach
  if (error) {
    // Tables may already exist or rpc unavailable — check if chatbots table exists
    const { error: checkError } = await admin.from('chatbots').select('id').limit(1)
    if (!checkError) return NextResponse.json({ success: true, already_exists: true })
    return NextResponse.json({ error: 'Tables not created. Please apply migration 014_chatbots.sql in your Supabase dashboard SQL editor.', sql_hint: true }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function GET() {
  // Check if tables exist
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await admin.from('chatbots').select('id').limit(1)
  return NextResponse.json({ tables_exist: !error, error: error?.message })
}
