'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

// ─── Trigger definitions ──────────────────────────────────────

export const TRIGGER_GROUPS = [
  {
    label: 'MESSAGE & CONVERSATION',
    items: [
      { id: 'new_message',       label: 'On Message',              icon: '💬', desc: 'Any inbound message' },
      { id: 'first_inbound',     label: 'On First Daily Message',  icon: '🌅', desc: 'First message of the day' },
      { id: 'match_keyword',     label: 'On Keyword Match',        icon: '🔑', desc: 'Message matches keywords' },
      { id: 'no_keyword_match',  label: 'On No Keyword Match',     icon: '🚫', desc: 'Message matches nothing' },
      { id: 'conversation_open', label: 'On Open Conversation',    icon: '📂', desc: 'Conversation opened' },
      { id: 'conversation_close',label: 'On Close Conversation',   icon: '✅', desc: 'Conversation closed' },
    ],
  },
  {
    label: 'LEADS & CONTACTS',
    items: [
      { id: 'new_contact',   label: 'On New Contact',        icon: '👤', desc: 'New contact created' },
      { id: 'tag_added',     label: 'On Tag Added',          icon: '🏷️', desc: 'Tag applied to contact' },
      { id: 'agent_assign',  label: 'On Agent Assign',       icon: '🧑‍💼', desc: 'Conversation assigned' },
    ],
  },
  {
    label: 'SCHEDULING',
    items: [
      { id: 'time_based',    label: 'Time-based (Cron)',     icon: '⏰', desc: 'Run on a schedule' },
      { id: 'webhook',       label: 'On Webhook',            icon: '🔗', desc: 'External webhook call' },
    ],
  },
]

// ─── Action definitions ───────────────────────────────────────

export const ACTION_GROUPS = [
  {
    label: 'MESSAGING',
    items: [
      { id: 'send_text',     label: 'Send Message',          icon: '💬', color: '#3B82F6' },
      { id: 'send_image',    label: 'Send Image',            icon: '🖼️', color: '#8B5CF6' },
      { id: 'send_video',    label: 'Send Video',            icon: '🎬', color: '#EC4899' },
      { id: 'send_audio',    label: 'Send Audio',            icon: '🎵', color: '#F97316' },
      { id: 'send_document', label: 'Send Document',         icon: '📄', color: '#6366F1' },
      { id: 'send_template', label: 'Send Template',         icon: '📋', color: '#059669' },
      { id: 'send_buttons',  label: 'Send Interactive Message',icon: '🔘', color: '#0EA5E9' },
      { id: 'send_list',     label: 'Send Interactive List', icon: '📋', color: '#14B8A6' },
      { id: 'send_location', label: 'Send Location',         icon: '📍', color: '#EF4444' },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'ai_router',     label: 'Generate AI Response',  icon: '🤖', color: '#7C3AED' },
    ],
  },
  {
    label: 'LOGIC & FLOW',
    items: [
      { id: 'condition',     label: 'Condition',             icon: '🔀', color: '#8B5CF6' },
      { id: 'delay',         label: 'Time Delay',            icon: '⏳', color: '#64748B' },
      { id: 'ask_question',  label: 'Wait Till (Ask Input)', icon: '❓', color: '#F97316' },
      { id: 'end_bot',       label: 'End Bot',               icon: '🛑', color: '#EF4444' },
    ],
  },
  {
    label: 'CUSTOMER MANAGEMENT',
    items: [
      { id: 'add_tag',           label: 'Add / Remove Tags',     icon: '🏷️', color: '#10B981' },
      { id: 'assign_to_agent',   label: 'Assign Agent',          icon: '🧑‍💼', color: '#0EA5E9' },
      { id: 'update_contact',    label: 'Set / Remove Attributes',icon: '👤', color: '#6366F1' },
      { id: 'save_variable',     label: 'Save Variable',         icon: '💾', color: '#8B5CF6' },
      { id: 'start_drip',        label: 'Add to Drip Campaign',  icon: '💧', color: '#6366F1' },
      { id: 'create_deal',       label: 'Create Deal',           icon: '💼', color: '#F59E0B' },
    ],
  },
  {
    label: 'DATA & APIS',
    items: [
      { id: 'webhook',       label: 'Call API / Webhook',    icon: '🌐', color: '#475569' },
    ],
  },
]

interface LeftPanelItem {
  id: string;
  label: string;
  icon: string;
  color?: string;
  desc?: string;
}

interface LeftPanelProps {
  onAddItem: (id: string, isTrigger: boolean) => void;
}

function DraggableItem({ item, isTrigger }: { item: LeftPanelItem; isTrigger: boolean }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow-type', item.id);
    e.dataTransfer.setData('application/reactflow-is-trigger', String(isTrigger));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-grab hover:bg-gray-50 active:cursor-grabbing transition-colors group select-none"
    >
      <span className="text-base leading-none shrink-0">{item.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-gray-800 group-hover:text-gray-900 leading-snug">{item.label}</p>
        {item.desc && <p className="text-[10px] text-gray-400 leading-snug">{item.desc}</p>}
      </div>
    </div>
  );
}

export function LeftPanel({ onAddItem }: LeftPanelProps) {
  const [tab, setTab] = useState<'triggers' | 'actions'>('triggers');
  const [search, setSearch] = useState('');

  const q = search.toLowerCase();

  const filteredTriggers = TRIGGER_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => !q || i.label.toLowerCase().includes(q) || i.desc?.toLowerCase().includes(q)),
  })).filter(g => g.items.length > 0);

  const filteredActions = ACTION_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => !q || i.label.toLowerCase().includes(q)),
  })).filter(g => g.items.length > 0);

  const groups = tab === 'triggers' ? filteredTriggers : filteredActions;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['triggers', 'actions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-[13px] font-semibold transition-colors border-b-2 ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="flex-1 bg-transparent text-[12px] text-gray-700 placeholder:text-gray-400 outline-none"
          />
        </div>
      </div>

      {/* Hint */}
      <p className="px-3 py-1.5 text-[10px] text-gray-400">
        Drag onto canvas or click to add
      </p>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto pb-4">
        {groups.map(g => (
          <div key={g.label} className="mb-1">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g.label}</p>
              <button className="text-gray-300 hover:text-gray-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            </div>
            {g.items.map(item => (
              <div
                key={item.id}
                onClick={() => onAddItem(item.id, tab === 'triggers')}
              >
                <DraggableItem item={item} isTrigger={tab === 'triggers'} />
              </div>
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-3 py-8 text-center text-[12px] text-gray-400">No results</div>
        )}
      </div>
    </div>
  );
}
