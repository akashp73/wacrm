import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt, callAI, type AgentConfig, type ChatMessage } from '@/lib/ai/agent-utils'

/**
 * POST /api/ai/agent/test
 * Body: { messages: ChatMessage[] }
 * Builds the full system prompt from saved config + sends to selected provider.
 * Does NOT log to ai_agent_logs.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages }: { messages: ChatMessage[] } = await request.json()

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  // Load agent config
  const { data: agentRow } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!agentRow) {
    return NextResponse.json({ error: 'Agent not configured yet. Save your settings first.' }, { status: 400 })
  }

  const agent = agentRow as AgentConfig

  const systemPrompt = buildSystemPrompt(agent, {
    currentTime: new Date().toLocaleString('en-IN', { timeZone: (agentRow as Record<string, string>).timezone ?? 'Asia/Kolkata' }),
  })

  const start = Date.now()
  try {
    const reply = await callAI(agent, systemPrompt, messages)
    return NextResponse.json({
      reply,
      latency_ms: Date.now() - start,
      system_prompt: systemPrompt,
      provider: agent.provider,
      model: agent.model,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI error' },
      { status: 500 },
    )
  }
}
