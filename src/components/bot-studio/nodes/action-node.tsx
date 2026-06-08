'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Pencil, X, Copy } from 'lucide-react';
import { NODE_DEFS, getPreview, type ActionType, type NodeDef } from '@/lib/bot-studio/node-definitions';

export const ActionNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>;
  const nodeType = (d.node_type as ActionType) ?? 'send_message';
  const cfg = (d.config ?? {}) as Record<string, unknown>;
  const def: NodeDef | undefined = NODE_DEFS[nodeType];
  const onEdit   = d.onEdit   as (() => void) | undefined;
  const onDelete = d.onDelete as (() => void) | undefined;
  const onClone  = d.onClone  as (() => void) | undefined;

  const preview = getPreview(nodeType, cfg);
  const handles = def?.handles ?? [{ id: 'output', label: '', color: '#9CA3AF' }];
  const color   = def?.color ?? '#6B7280';
  const icon    = def?.icon  ?? '📦';
  const label   = def?.label ?? nodeType;

  return (
    <div className="relative group" style={{ minWidth: 220, maxWidth: 260 }}>
      {/* Hover action bar */}
      <div className="absolute -top-9 right-0 hidden group-hover:flex items-center gap-1 z-20">
        <button onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 shadow-sm">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onClone}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 shadow-sm">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-red-200 text-red-400 hover:text-red-600 shadow-sm">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Card */}
      <div className={`rounded-xl border-2 bg-white overflow-hidden shadow-sm transition-all ${
        selected ? 'border-gray-900 shadow-md' : 'border-gray-200 hover:border-gray-300'
      }`}>
        <div className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: `${color}15`, borderBottom: `1px solid ${color}30` }}>
          <span className="text-lg leading-none">{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-gray-900 leading-snug">{label}</p>
          </div>
        </div>

        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500 line-clamp-2 leading-snug min-h-[2em]">
            {preview || <span className="italic text-gray-300">Not configured</span>}
          </p>
        </div>
      </div>

      {/* Input handle */}
      <Handle type="target" position={Position.Left} id="input"
        className="!w-3 !h-3 !bg-white !border-2 !border-gray-400 !rounded-full" />

      {/* Output handle(s) */}
      {handles.length === 0 ? null : handles.length === 1 ? (
        <Handle type="source" position={Position.Right} id={handles[0].id}
          className="!w-3 !h-3 !bg-white !border-2 !rounded-full"
          style={{ borderColor: handles[0].color }} />
      ) : (
        handles.map((h, i) => (
          <div key={h.id}>
            <Handle type="source" position={Position.Right} id={h.id}
              style={{
                top: `${((i + 1) / (handles.length + 1)) * 100}%`,
                borderColor: h.color,
              }}
              className="!w-3 !h-3 !bg-white !border-2 !rounded-full" />
            <div className="absolute text-[9px] font-medium whitespace-nowrap"
              style={{ right: -38, top: `${((i + 1) / (handles.length + 1)) * 100}%`, transform: 'translateY(-50%)', color: h.color }}>
              {h.label}
            </div>
          </div>
        ))
      )}
    </div>
  );
});
ActionNode.displayName = 'ActionNode';
