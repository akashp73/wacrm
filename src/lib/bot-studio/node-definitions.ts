/**
 * Bot Studio node definitions.
 * Client-safe — no SDK imports.
 */

export type TriggerType = 'message_received' | 'webhook'

export type ActionType =
  | 'send_message' | 'send_template' | 'send_interactive_list' | 'send_media'
  | 'condition' | 'delay' | 'goto'

export type BotNodeType = 'trigger' | ActionType

export interface HandleDef {
  id: string
  label: string
  color: string
}

export interface NodeDef {
  type: ActionType
  label: string
  description: string
  icon: string
  color: string
  category: string
  handles: HandleDef[]
}

const H = {
  out:  { id: 'output', label: '',      color: '#9CA3AF' },
  true: { id: 'true',   label: 'True',  color: '#10B981' },
  false:{ id: 'false',  label: 'False', color: '#EF4444' },
}

export const NODE_DEFS: Record<ActionType, NodeDef> = {
  send_message: {
    type: 'send_message', label: 'Send Message', category: 'Messaging',
    description: 'Send a plain text message to the contact',
    icon: '💬', color: '#3B82F6',
    handles: [H.out],
  },
  send_template: {
    type: 'send_template', label: 'Send Template', category: 'Messaging',
    description: 'Send a Meta-approved WhatsApp template',
    icon: '📋', color: '#059669',
    handles: [H.out],
  },
  send_interactive_list: {
    type: 'send_interactive_list', label: 'Send Interactive List', category: 'Messaging',
    description: 'Interactive message with a button list',
    icon: '📜', color: '#14B8A6',
    handles: [H.out],
  },
  send_media: {
    type: 'send_media', label: 'Send Media', category: 'Messaging',
    description: 'Send an image, video, or document by URL',
    icon: '🖼️', color: '#8B5CF6',
    handles: [H.out],
  },
  condition: {
    type: 'condition', label: 'Condition', category: 'Logic & Flow',
    description: 'Branch the flow based on message content or contact field',
    icon: '🔀', color: '#F59E0B',
    handles: [H.true, H.false],
  },
  delay: {
    type: 'delay', label: 'Time Delay', category: 'Logic & Flow',
    description: 'Wait before running the next action',
    icon: '⏳', color: '#64748B',
    handles: [H.out],
  },
  goto: {
    type: 'goto', label: 'Go To', category: 'Logic & Flow',
    description: 'Jump to another node in the flow',
    icon: '🔄', color: '#6366F1',
    handles: [],
  },
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  message_received: 'Message Received',
  webhook: 'On Webhook',
}

/** Reads a dot-path (e.g. "data.phone" or "contact.number") out of an arbitrary JSON object. */
export function getByPath(obj: unknown, path: string): unknown {
  const trimmed = path.trim()
  if (!trimmed) return undefined
  return trimmed.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

export type PhoneFormatMode = 'as_is' | 'prepend_country_code'

/**
 * Normalizes a phone number for the WhatsApp Cloud API, which requires the full
 * number with country code and no leading "+" (e.g. "919876543210").
 *
 * In "prepend_country_code" mode, a configured country code is added to numbers
 * that look like bare local numbers (10 digits or fewer) and don't already start
 * with it — leaving numbers that already include a country code untouched.
 */
export function normalizePhone(raw: string, opts: { mode?: PhoneFormatMode; countryCode?: string } = {}): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits || opts.mode !== 'prepend_country_code') return digits
  const cc = (opts.countryCode ?? '').replace(/\D/g, '')
  if (!cc || digits.startsWith(cc) || digits.length > 10) return digits
  return cc + digits
}

export function getPreview(type: string, cfg: Record<string, unknown>): string {
  switch (type) {
    case 'send_message':          return (cfg.text as string)?.slice(0, 60) || 'No message yet'
    case 'send_template':         return (cfg.template_name as string) || 'Select template'
    case 'send_interactive_list': return (cfg.body as string)?.slice(0, 60) || 'List message'
    case 'send_media':            return (cfg.url as string)?.slice(0, 50) || 'No media URL set'
    case 'condition': {
      const field = (cfg.field as string) || 'message_text'
      const fieldLabel = field === 'webhook_field' ? ((cfg.field_path as string) || 'webhook field') : field
      const op = (cfg.operator as string) || 'contains'
      const value = (cfg.value as string) || '?'
      return `If ${fieldLabel} ${op} "${value}"`
    }
    case 'delay':                 return `Wait ${cfg.duration ?? 1} ${cfg.unit ?? 'minutes'}`
    case 'goto':                  return (cfg.target_label as string) ? `→ ${cfg.target_label}` : 'Select a step'
    default:                      return ''
  }
}

export function getTriggerPreview(cfg: Record<string, unknown>): string {
  const triggerType = (cfg.trigger_type as TriggerType) ?? 'message_received'
  if (triggerType === 'message_received') {
    const keyword = cfg.keyword as string | undefined
    return keyword ? `"${keyword}"` : 'Any message'
  }
  const phoneField = cfg.phone_field as string | undefined
  return phoneField ? `Phone field: ${phoneField}` : 'POST /api/bot-studio/webhook/…'
}
