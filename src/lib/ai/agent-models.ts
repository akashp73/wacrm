/**
 * Client-safe AI model catalogue — no SDK imports, no Node built-ins.
 * Import this in client components. Import agent-utils.ts only in
 * server components / API routes.
 */

export const PROVIDER_MODELS: Record<string, { id: string; label: string; tag: string; context: string }[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', tag: 'Recommended · Smart + Fast', context: '200K' },
    { id: 'claude-opus-4-7',           label: 'Claude Opus 4.7',   tag: 'Most Capable · Slower',     context: '200K' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  tag: 'Fastest · Basic tasks',     context: '200K' },
  ],
  openai: [
    { id: 'gpt-4o',        label: 'GPT-4o',        tag: 'Recommended',  context: '128K' },
    { id: 'gpt-4o-mini',   label: 'GPT-4o mini',   tag: 'Fast + Cheap', context: '128K' },
    { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo',   tag: 'Powerful',     context: '128K' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', tag: 'Cheapest',     context: '16K'  },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tag: 'Recommended · Fast', context: '1M' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   tag: 'Most Capable',       context: '2M' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash',  tag: 'Fast',              context: '1M' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tag: 'Recommended',     context: '128K' },
    { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B',  tag: 'Fastest',         context: '128K' },
    { id: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B',  tag: 'Good for coding', context: '32K'  },
  ],
}
