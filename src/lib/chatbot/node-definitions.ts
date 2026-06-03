/**
 * Comprehensive WhatsApp chatbot node definitions.
 * Client-safe — no SDK imports.
 */

export type NodeType =
  | 'trigger'
  // ── Messaging
  | 'send_text' | 'send_image' | 'send_video' | 'send_audio'
  | 'send_document' | 'send_location' | 'send_template'
  | 'send_buttons' | 'send_list'
  // ── Interaction
  | 'ask_question' | 'condition' | 'ai_router'
  // ── Contact & CRM
  | 'add_tag' | 'remove_tag' | 'update_contact' | 'create_deal'
  | 'start_drip'
  // ── Flow control
  | 'delay' | 'goto' | 'webhook' | 'assign_to_agent' | 'end_bot'
  | 'save_variable'

export interface NodeDef {
  type: NodeType
  label: string
  description: string
  icon: string          // emoji fallback
  color: string         // hex accent
  category: string
  handles: HandleDef[]
}

export interface HandleDef {
  id: string
  label: string
  color: string
}

const H = {
  out:     { id: 'output',  label: '',        color: '#6B7280' },
  success: { id: 'success', label: 'Success', color: '#10B981' },
  invalid: { id: 'invalid', label: 'Invalid', color: '#EF4444' },
  timeout: { id: 'timeout', label: 'Timeout', color: '#F59E0B' },
  yes:     { id: 'yes',     label: 'Yes',     color: '#10B981' },
  no:      { id: 'no',      label: 'No',      color: '#EF4444' },
  matched: { id: 'matched', label: 'Matched', color: '#10B981' },
  default: { id: 'default', label: 'Default', color: '#6B7280' },
}

export const NODE_DEFS: Record<string, NodeDef> = {
  // ── Messaging ─────────────────────────────────────────────────
  send_text: {
    type: 'send_text', label: 'Send Text Message', category: 'Messaging',
    description: 'Send a plain text message to the contact',
    icon: '💬', color: '#3B82F6',
    handles: [H.out],
  },
  send_image: {
    type: 'send_image', label: 'Send Image', category: 'Messaging',
    description: 'Send an image with optional caption',
    icon: '🖼️', color: '#8B5CF6',
    handles: [H.out],
  },
  send_video: {
    type: 'send_video', label: 'Send Video', category: 'Messaging',
    description: 'Send a video file with optional caption',
    icon: '🎬', color: '#EC4899',
    handles: [H.out],
  },
  send_audio: {
    type: 'send_audio', label: 'Send Audio', category: 'Messaging',
    description: 'Send an audio file or voice note',
    icon: '🎵', color: '#F97316',
    handles: [H.out],
  },
  send_document: {
    type: 'send_document', label: 'Send Document', category: 'Messaging',
    description: 'Send a PDF, Word doc, or other file',
    icon: '📄', color: '#6366F1',
    handles: [H.out],
  },
  send_location: {
    type: 'send_location', label: 'Send Location', category: 'Messaging',
    description: 'Share a GPS location pin',
    icon: '📍', color: '#EF4444',
    handles: [H.out],
  },
  send_template: {
    type: 'send_template', label: 'Send Template', category: 'Messaging',
    description: 'Send a Meta-approved WhatsApp template',
    icon: '📋', color: '#059669',
    handles: [H.out],
  },
  send_buttons: {
    type: 'send_buttons', label: 'Send Button Message', category: 'Messaging',
    description: 'Interactive message with up to 3 reply buttons',
    icon: '🔘', color: '#0EA5E9',
    handles: [H.out],
  },
  send_list: {
    type: 'send_list', label: 'Send List Menu', category: 'Messaging',
    description: 'Interactive list with sections and options',
    icon: '📋', color: '#14B8A6',
    handles: [H.out],
  },

  // ── Interaction ────────────────────────────────────────────────
  ask_question: {
    type: 'ask_question', label: 'Ask Question', category: 'Interaction',
    description: 'Ask and save user reply to a variable',
    icon: '❓', color: '#F97316',
    handles: [H.success, H.invalid, H.timeout],
  },
  condition: {
    type: 'condition', label: 'Condition / If-Else', category: 'Interaction',
    description: 'Branch flow based on variable value or message',
    icon: '🔀', color: '#8B5CF6',
    handles: [H.yes, H.no],
  },
  ai_router: {
    type: 'ai_router', label: 'AI Intent Router', category: 'Interaction',
    description: 'Use AI to detect intent and route accordingly',
    icon: '🤖', color: '#7C3AED',
    handles: [H.default],
  },

  // ── Contact & CRM ──────────────────────────────────────────────
  add_tag: {
    type: 'add_tag', label: 'Add Tag', category: 'Contact & CRM',
    description: 'Apply a tag to the contact',
    icon: '🏷️', color: '#10B981',
    handles: [H.out],
  },
  remove_tag: {
    type: 'remove_tag', label: 'Remove Tag', category: 'Contact & CRM',
    description: 'Remove a tag from the contact',
    icon: '🗑️', color: '#EF4444',
    handles: [H.out],
  },
  update_contact: {
    type: 'update_contact', label: 'Update Contact', category: 'Contact & CRM',
    description: 'Update contact name, email, or custom field',
    icon: '👤', color: '#0EA5E9',
    handles: [H.out],
  },
  create_deal: {
    type: 'create_deal', label: 'Create Deal', category: 'Contact & CRM',
    description: 'Add contact to a pipeline stage',
    icon: '💼', color: '#F59E0B',
    handles: [H.out],
  },
  start_drip: {
    type: 'start_drip', label: 'Start Drip Campaign', category: 'Contact & CRM',
    description: 'Enroll contact in a drip sequence',
    icon: '💧', color: '#6366F1',
    handles: [H.out],
  },
  save_variable: {
    type: 'save_variable', label: 'Save Variable', category: 'Contact & CRM',
    description: 'Store a value in a bot variable',
    icon: '💾', color: '#8B5CF6',
    handles: [H.out],
  },

  // ── Flow Control ───────────────────────────────────────────────
  delay: {
    type: 'delay', label: 'Delay / Wait', category: 'Flow Control',
    description: 'Pause before sending the next message',
    icon: '⏳', color: '#64748B',
    handles: [H.out],
  },
  assign_to_agent: {
    type: 'assign_to_agent', label: 'Assign to Agent', category: 'Flow Control',
    description: 'Hand off conversation to a human agent',
    icon: '🧑‍💼', color: '#0EA5E9',
    handles: [H.out],
  },
  webhook: {
    type: 'webhook', label: 'HTTP Webhook', category: 'Flow Control',
    description: 'Call an external API with contact data',
    icon: '🌐', color: '#475569',
    handles: [H.success, H.invalid],
  },
  goto: {
    type: 'goto', label: 'Jump to Step', category: 'Flow Control',
    description: 'Redirect flow to another node',
    icon: '🔄', color: '#6366F1',
    handles: [],
  },
  end_bot: {
    type: 'end_bot', label: 'End Bot', category: 'Flow Control',
    description: 'Stop the bot and close the session',
    icon: '🛑', color: '#EF4444',
    handles: [],
  },
}

export const NODE_CATEGORIES = [
  'Messaging', 'Interaction', 'Contact & CRM', 'Flow Control',
]

export function getPreview(type: string, cfg: Record<string, unknown>): string {
  switch (type) {
    case 'send_text':    return (cfg.text as string)?.slice(0, 60) || 'No message yet'
    case 'send_image':   return (cfg.caption as string) || 'Image message'
    case 'send_video':   return (cfg.caption as string) || 'Video message'
    case 'send_audio':   return 'Audio message'
    case 'send_document':return (cfg.filename as string) || 'Document'
    case 'send_location':return (cfg.name as string) || 'Location pin'
    case 'send_template':return (cfg.template_name as string) || 'Select template'
    case 'send_buttons': return (cfg.body as string)?.slice(0, 60) || 'Button message'
    case 'send_list':    return (cfg.body as string)?.slice(0, 60) || 'List message'
    case 'ask_question': return (cfg.question as string)?.slice(0, 60) || 'No question yet'
    case 'condition':    return `If {{${cfg.variable || '?'}}} ${cfg.operator || '='} "${cfg.value || '?'}"`
    case 'ai_router':    return `${Array.isArray(cfg.intents) ? (cfg.intents as string[]).length : 0} intent routes`
    case 'add_tag':      return (cfg.tag as string) || 'Select tag'
    case 'remove_tag':   return (cfg.tag as string) || 'Select tag'
    case 'update_contact':return `Set ${cfg.field || '?'} = ${cfg.value || '?'}`
    case 'create_deal':  return (cfg.pipeline_name as string) || 'Select pipeline'
    case 'start_drip':   return (cfg.drip_name as string) || 'Select drip'
    case 'save_variable':return `${cfg.variable || '?'} = ${cfg.value || '?'}`
    case 'delay':        return `Wait ${cfg.duration || 1} ${cfg.unit || 'seconds'}`
    case 'assign_to_agent':return (cfg.agent_name as string) || 'Auto-assign'
    case 'webhook':      return (cfg.url as string)?.slice(0, 40) || 'No URL set'
    case 'goto':         return `→ ${cfg.target_label || 'Select step'}`
    case 'end_bot':      return 'End conversation'
    default:             return ''
  }
}
