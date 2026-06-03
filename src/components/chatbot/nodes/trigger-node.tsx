'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Pencil, X, Plus } from 'lucide-react';

const TRIGGER_LABELS: Record<string, string> = {
  new_message:    'New Message Received',
  match_keyword:  'Keyword Match',
  hot_keywords:   'Hot Keywords',
  webhook:        'Inbound Webhook',
  missed_call:    'Missed Call',
  payment_rcvd:   'Payment Received',
  payment_failed: 'Payment Failed',
  new_order:      'New Order',
  order_updated:  'Order Updated',
};

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>;
  const cfg = (d.config ?? {}) as Record<string, string>;
  const triggerType = cfg.trigger_type ?? 'new_message';
  const label = TRIGGER_LABELS[triggerType] ?? 'Trigger';
  const onEdit   = d.onEdit   as (() => void) | undefined;
  const onDelete = d.onDelete as (() => void) | undefined;
  const onAddNext= d.onAddNext as (() => void) | undefined;

  return (
    <div className="relative group">
      {/* Hover actions */}
      <div className="absolute -top-9 right-0 hidden group-hover:flex items-center gap-1 z-20">
        <button onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 shadow-sm">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-red-200 text-red-400 hover:text-red-600 shadow-sm">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Node visual */}
      <div className={`flex flex-col items-center gap-2 ${selected ? 'opacity-100' : ''}`}>
        <div className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform ${selected ? 'scale-105' : 'group-hover:scale-105'}`}
          style={{ background: '#25D366' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="h-8 w-8">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>

        <div className={`rounded-xl border-2 bg-white px-4 py-2 shadow-sm text-center min-w-[160px] transition-all ${
          selected ? 'border-gray-900' : 'border-gray-200 hover:border-gray-400'
        }`}>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">TRIGGER</p>
          <p className="text-[13px] font-bold text-gray-900 leading-snug">{label}</p>
          {cfg.keywords && (
            <p className="text-[10px] text-gray-400 mt-0.5 max-w-[140px] truncate">"{cfg.keywords}"</p>
          )}
        </div>
      </div>

      {/* Output handle + Add next step button */}
      <div className="absolute right-0 top-[calc(50%-8px)] translate-x-full flex items-center gap-2 pl-2">
        <Handle type="source" position={Position.Right} id="output"
          className="!static !transform-none !w-3.5 !h-3.5 !bg-white !border-2 !border-gray-400 !rounded-full relative" />
        {onAddNext && (
          <button onClick={onAddNext}
            className="flex h-8 w-8 items-center justify-center rounded-full shadow-md text-white transition-all hover:scale-110"
            style={{ background: '#25D366' }}
            title="Add next step">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});
TriggerNode.displayName = 'TriggerNode';
