'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface BotVariable {
  id?: string;
  name: string;
  var_type: string;
}

const VAR_TYPES = ['text', 'number', 'email', 'phone', 'date', 'boolean'];

const TYPE_COLOR: Record<string, string> = {
  text:    'bg-blue-50 text-blue-700',
  number:  'bg-purple-50 text-purple-700',
  email:   'bg-amber-50 text-amber-700',
  phone:   'bg-green-50 text-green-700',
  date:    'bg-pink-50 text-pink-700',
  boolean: 'bg-gray-100 text-gray-700',
};

interface VariablePanelProps {
  variables: BotVariable[];
  onAdd: (v: BotVariable) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

export function VariablePanel({ variables, onAdd, onDelete, onClose }: VariablePanelProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('text');

  const handleAdd = () => {
    if (!name.trim()) return;
    const sanitized = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!sanitized) return;
    onAdd({ name: sanitized, var_type: type });
    setName('');
    setType('text');
    setAdding(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[13px] font-semibold text-foreground">Bot Fields / Variables</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Reference variables in messages as <code className="bg-muted px-1 rounded text-[10px]">{'{{variable_name}}'}</code>
        </p>

        {variables.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <p className="text-[12px] text-muted-foreground">No variables yet.</p>
          </div>
        ) : (
          variables.map((v) => (
            <div key={v.name} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <code className="text-[12px] font-medium text-foreground">{'{{' + v.name + '}}'}</code>
                <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ${TYPE_COLOR[v.var_type] ?? ''}`}>
                  {v.var_type}
                </span>
              </div>
              <button onClick={() => onDelete(v.name)}
                className="text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {adding && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Field name (no spaces)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s/g, '_'))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                placeholder="customer_email"
                className="h-7 text-[12px]"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Type</Label>
              <div className="flex flex-wrap gap-1.5">
                {VAR_TYPES.map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      type === t ? 'bg-foreground text-background' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
                    }`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd}
                className="flex-1 rounded-lg bg-foreground py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90 transition-colors">
                Add field
              </button>
              <button onClick={() => setAdding(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <div className="border-t border-border p-3">
          <button onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[12px] font-medium text-foreground hover:bg-muted transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Field
          </button>
        </div>
      )}
    </div>
  );
}
