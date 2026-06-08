'use client';

import { useState } from 'react';

export const TRIGGER_ITEMS = [
  { id: 'message_received', label: 'Message Received', icon: '💬', desc: 'Incoming WhatsApp message matches keyword/any' },
  { id: 'webhook',          label: 'Webhook',           icon: '🔗', desc: 'External POST hits the bot webhook URL' },
];

export const ACTION_GROUPS = [
  {
    label: 'MESSAGING',
    items: [
      { id: 'send_message',          label: 'Send Message',           icon: '💬', color: '#3B82F6' },
      { id: 'send_template',         label: 'Send Template',          icon: '📋', color: '#059669' },
      { id: 'send_interactive_list', label: 'Send Interactive List',  icon: '📜', color: '#14B8A6' },
      { id: 'send_media',            label: 'Send Media',             icon: '🖼️', color: '#8B5CF6' },
    ],
  },
  {
    label: 'LOGIC & FLOW',
    items: [
      { id: 'condition', label: 'Condition',  icon: '🔀', color: '#F59E0B' },
      { id: 'delay',     label: 'Time Delay', icon: '⏳', color: '#64748B' },
      { id: 'goto',      label: 'Go To',      icon: '🔄', color: '#6366F1' },
    ],
  },
];

interface PanelItem {
  id: string;
  label: string;
  icon: string;
  color?: string;
  desc?: string;
}

function DraggableItem({ item, isTrigger }: { item: PanelItem; isTrigger: boolean }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/botstudio-type', item.id);
    e.dataTransfer.setData('application/botstudio-is-trigger', String(isTrigger));
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

interface LeftPanelProps {
  onAddItem: (id: string, isTrigger: boolean) => void;
}

export function LeftPanel({ onAddItem }: LeftPanelProps) {
  const [tab, setTab] = useState<'triggers' | 'actions'>('actions');

  return (
    <div className="flex h-full shrink-0 flex-col border-r border-gray-200 bg-white" style={{ width: 260 }}>
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

      <p className="px-3 py-2 text-[10px] text-gray-400">
        {tab === 'triggers' ? 'Click a trigger to set the bot\'s start condition' : 'Drag onto canvas or click to add'}
      </p>

      <div className="flex-1 overflow-y-auto pb-4">
        {tab === 'triggers' ? (
          <div className="mb-1">
            {TRIGGER_ITEMS.map(item => (
              <div key={item.id} onClick={() => onAddItem(item.id, true)}>
                <DraggableItem item={item} isTrigger />
              </div>
            ))}
          </div>
        ) : (
          ACTION_GROUPS.map(g => (
            <div key={g.label} className="mb-1">
              <div className="px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g.label}</p>
              </div>
              {g.items.map(item => (
                <div key={item.id} onClick={() => onAddItem(item.id, false)}>
                  <DraggableItem item={item} isTrigger={false} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
