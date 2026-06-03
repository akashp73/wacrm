import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, contactName, messages } = await request.json()

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  // Build conversation transcript for Claude
  const transcript = messages
    .slice(-10) // last 10 messages
    .map((m: { sender_type: string; content_text: string; created_at: string }) =>
      `[${m.sender_type === 'customer' ? contactName || 'Customer' : 'Agent'}]: ${m.content_text ?? '(media)'}`
    )
    .join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You are a helpful WhatsApp business assistant. Read the conversation below and suggest 3 short, natural reply options for the business agent. Each reply must be under 100 words, conversational, and appropriate for a professional business context. Be direct, friendly, and helpful. Return ONLY valid JSON with this exact structure: {"suggestions": ["reply 1", "reply 2", "reply 3"]}`,
      messages: [
        {
          role: 'user',
          content: `Conversation:\n${transcript}\n\nSuggest 3 reply options for the agent.`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Invalid response format from Claude')

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length < 1) {
      throw new Error('No suggestions returned')
    }

    return NextResponse.json({ suggestions: parsed.suggestions.slice(0, 3) })
  } catch (err) {
    console.error('[AI suggest-reply] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI service error' },
      { status: 500 }
    )
  }
}
