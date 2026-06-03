/**
 * Shared AI agent utilities: system prompt builder + multi-provider chat.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

// ─── Types ────────────────────────────────────────────────────

export interface AgentConfig {
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq'
  model: string
  api_key_override?: string | null
  temperature: number
  max_tokens: number
  business_context?: string | null
  agent_personality?: string | null
  agent_name: string
  greeting_message: string
  fallback_message: string
  escalation_message: string
  tone: string
  formality_level: number
  language_mode: string
  fixed_language?: string | null
  use_emojis: boolean
  use_bullet_points: boolean
  always_end_with_question: boolean
  use_bold_words: boolean
  keep_replies_short: boolean
  guardrails: string[]
  never_reveal_ai: boolean
  never_share_customer_info: boolean
  never_process_payments: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── System prompt builder ────────────────────────────────────

export function buildSystemPrompt(
  agent: AgentConfig,
  context?: {
    contactName?: string
    businessHoursOpen?: boolean
    currentTime?: string
    knowledgeBase?: string
  },
): string {
  const parts: string[] = []

  // Identity
  parts.push(`You are ${agent.agent_name}, an AI-powered WhatsApp assistant.`)

  // Business context
  if (agent.business_context?.trim()) {
    parts.push(`\n## About This Business\n${agent.business_context.trim()}`)
  }

  // Operating instructions
  if (agent.agent_personality?.trim()) {
    parts.push(`\n## Operating Instructions\n${agent.agent_personality.trim()}`)
  }

  // Tone & style
  const toneMap: Record<string, string> = {
    friendly: 'warm, approachable, and helpful',
    formal:   'professional and business-like',
    casual:   'relaxed and conversational, like talking to a friend',
    direct:   'concise and straight to the point — no fluff',
    expert:   'knowledgeable and authoritative, like a trusted advisor',
  }
  parts.push(`\n## Communication Style\n- Tone: ${toneMap[agent.tone] ?? agent.tone}`)
  parts.push(`- Formality level: ${agent.formality_level}/5 (1=very casual, 5=very formal)`)

  if (agent.language_mode === 'auto') {
    parts.push('- Language: Auto-detect. Reply in the same language the customer uses.')
  } else if (agent.fixed_language) {
    parts.push(`- Language: Always reply in ${agent.fixed_language} only.`)
  }

  if (agent.use_emojis)             parts.push('- Use emojis naturally in your replies.')
  if (!agent.use_emojis)            parts.push('- Do NOT use emojis.')
  if (agent.use_bullet_points)      parts.push('- Use bullet points when listing multiple items.')
  if (agent.always_end_with_question) parts.push('- Always end your reply with a relevant question to keep the conversation going.')
  if (agent.use_bold_words)         parts.push('- Bold important words using *asterisks* for emphasis.')
  if (agent.keep_replies_short)     parts.push('- Keep replies under 3 sentences when possible.')

  // Guardrails
  const allGuardrails = [...(agent.guardrails ?? [])]
  if (agent.never_reveal_ai)            allGuardrails.push("Never confirm or deny that you're an AI unless the customer directly and explicitly asks")
  if (agent.never_share_customer_info)  allGuardrails.push("Never share other customers' information")
  if (agent.never_process_payments)     allGuardrails.push('Never accept payments or process orders directly')

  if (allGuardrails.length > 0) {
    parts.push('\n## Hard Rules (Never Break These)\n' + allGuardrails.map(g => `- ${g}`).join('\n'))
  }

  // Knowledge base
  if (context?.knowledgeBase?.trim()) {
    parts.push(`\n## Reference Knowledge\n${context.knowledgeBase.trim()}`)
  }

  // Contact context
  if (context?.contactName) {
    parts.push(`\n## Current Customer\nName: ${context.contactName}`)
  }

  // Time context
  if (context?.currentTime) {
    parts.push(`\nCurrent time: ${context.currentTime}`)
  }

  parts.push('\n## Response Guidelines\nBe helpful, accurate, and concise. If you don\'t know something, say so honestly and offer to connect the customer with the team.')

  return parts.join('\n')
}

// ─── Multi-provider chat ──────────────────────────────────────

export async function callAI(
  agent: AgentConfig,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const apiKey = (key: string) => agent.api_key_override || process.env[key] || ''

  if (agent.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: apiKey('ANTHROPIC_API_KEY') })
    const res = await client.messages.create({
      model:      agent.model,
      max_tokens: agent.max_tokens,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
      temperature: agent.temperature,
    } as Parameters<typeof client.messages.create>[0])
    const msg = res as unknown as { content: { type: string; text: string }[] }
    return (msg.content[0] as { type: string; text: string }).text ?? ''

  } else if (agent.provider === 'openai') {
    const client = new OpenAI({ apiKey: apiKey('OPENAI_API_KEY') })
    const res = await client.chat.completions.create({
      model: agent.model,
      max_tokens: agent.max_tokens,
      temperature: agent.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
    })
    return res.choices[0]?.message?.content ?? ''

  } else if (agent.provider === 'gemini') {
    const client = new GoogleGenerativeAI(apiKey('GOOGLE_AI_API_KEY'))
    const model = client.getGenerativeModel({
      model: agent.model,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: agent.max_tokens,
        temperature: agent.temperature,
      },
    })
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const chat = model.startChat({ history })
    const last = messages[messages.length - 1]
    const res = await chat.sendMessage(last?.content ?? '')
    return res.response.text()

  } else if (agent.provider === 'groq') {
    const client = new Groq({ apiKey: apiKey('GROQ_API_KEY') })
    const res = await client.chat.completions.create({
      model: agent.model,
      max_tokens: agent.max_tokens,
      temperature: agent.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  }

  throw new Error(`Unknown provider: ${agent.provider}`)
}

// Re-export from the client-safe module so server code can import from one place
export { PROVIDER_MODELS } from './agent-models'
