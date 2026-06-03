'use client';

import { useState } from 'react';
import { X, Search, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface TriggerConfig {
  trigger_type: string;
  channel?: string;
  keywords?: string;           // for hot_keywords: comma-separated
  condition_groups?: ConditionGroup[]; // for match_keyword: array of OR groups
}

/** One row inside a condition group (joined by AND) */
interface Condition {
  field: string;   // 'message' | 'message_type'
  operator: string;
  value: string;
}

/** Multiple conditions ANDed together; groups are ORed */
interface ConditionGroup {
  conditions: Condition[];
}

const OPERATORS = [
  'Contains',
  "Doesn't contain",
  'Is',
  'Is not',
  'Starts with',
  'Ends with',
  'Match pattern (regex)',
];

const TRIGGERS: { id: string; label: string; desc: string }[] = [
  { id: 'new_message',    label: 'New Message Received',       desc: 'Any inbound message starts the bot' },
  { id: 'match_keyword',  label: 'Match Keyword / Condition',  desc: 'Start only if message matches rules' },
  { id: 'hot_keywords',   label: 'Hot Keywords',               desc: 'Bot starts if any keyword appears' },
  { id: 'webhook',        label: 'Inbound Webhook',            desc: 'External system triggers the bot' },
  { id: 'missed_call',    label: 'Missed Call Received',       desc: 'Contact called but line was missed' },
  { id: 'payment_rcvd',   label: 'Payment Received',           desc: 'After successful payment' },
  { id: 'payment_failed', label: 'Payment Failed',             desc: 'After payment failure' },
  { id: 'new_order',      label: 'New Order Placed',           desc: 'E-commerce: new order created' },
  { id: 'order_updated',  label: 'Order Status Updated',       desc: 'E-commerce: order changed' },
];

interface TriggerPanelProps {
  config: TriggerConfig;
  onChange: (cfg: TriggerConfig) => void;
  onClose: () => void;
  onSave: () => void;
}

function emptyGroup(): ConditionGroup {
  return { conditions: [{ field: 'message', operator: 'Contains', value: '' }] };
}

export function TriggerPanel({ config, onChange, onClose, onSave }: TriggerPanelProps) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'config'>(
    // If a trigger requiring config is already selected, jump straight to config
    config.trigger_type !== 'new_message' ? 'config' : 'list'
  );

  const selected = config.trigger_type;
  const filtered = TRIGGERS.filter(t =>
    t.label.toLowerCase().includes(search.toLowerCase()) ||
    t.desc.toLowerCase().includes(search.toLowerCase())
  );

  /* ── condition group helpers ── */
  const groups = config.condition_groups ?? [emptyGroup()];

  const setGroups = (gs: ConditionGroup[]) => onChange({ ...config, condition_groups: gs });

  const addGroup = () => setGroups([...groups, emptyGroup()]);

  const removeGroup = (gi: number) => setGroups(groups.filter((_, i) => i !== gi));

  const addCondition = (gi: number) => {
    const gs = groups.map((g, i) =>
      i === gi
        ? { ...g, conditions: [...g.conditions, { field: 'message', operator: 'Contains', value: '' }] }
        : g
    );
    setGroups(gs);
  };

  const updateCondition = (gi: number, ci: number, patch: Partial<Condition>) => {
    const gs = groups.map((g, i) =>
      i === gi
        ? { ...g, conditions: g.conditions.map((c, j) => j === ci ? { ...c, ...patch } : c) }
        : g
    );
    setGroups(gs);
  };

  const removeCondition = (gi: number, ci: number) => {
    const gs = groups.map((g, i) =>
      i === gi ? { ...g, conditions: g.conditions.filter((_, j) => j !== ci) } : g
    ).filter(g => g.conditions.length > 0);
    setGroups(gs.length ? gs : [emptyGroup()]);
  };

  /* ── pick a trigger and go to config if needed ── */
  const selectTrigger = (id: string) => {
    const needsConfig = id !== 'new_message' && id !== 'missed_call';
    onChange({
      ...config,
      trigger_type: id,
      // seed one empty group for keyword match
      ...(id === 'match_keyword' && !config.condition_groups ? { condition_groups: [emptyGroup()] } : {}),
    });
    if (needsConfig) setView('config');
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {view === 'config' && (
            <button onClick={() => setView('list')} className="text-[11px] text-gray-400 hover:text-gray-600 mr-1">
              ← Back
            </button>
          )}
          <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: '#25D366' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="h-3.5 w-3.5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-gray-900">
            {view === 'list' ? 'Choose Trigger' : TRIGGERS.find(t => t.id === selected)?.label ?? 'Configure'}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Trigger list ── */}
      {view === 'list' && (
        <>
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search triggers…" className="pl-8 h-8 text-[12px] border-gray-200" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">
              Start chatbot when…
            </p>
            {filtered.map(t => (
              <button key={t.id} onClick={() => selectTrigger(t.id)}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors border ${
                  selected === t.id
                    ? 'bg-green-50 border-green-200'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5" style={{ background: '#25D366' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="h-3.5 w-3.5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-gray-900">{t.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{t.desc}</p>
                </div>
                {selected === t.id && (
                  <div className="h-2 w-2 rounded-full mt-2 shrink-0" style={{ background: '#25D366' }} />
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Config view ── */}
      {view === 'config' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Hot keywords */}
          {selected === 'hot_keywords' && (
            <div className="space-y-3">
              <div>
                <Label className="text-[13px] font-semibold text-gray-900">Keywords</Label>
                <p className="text-[11px] text-gray-400 mt-0.5">Bot starts if any of these appear anywhere in the message (case-insensitive).</p>
              </div>
              <Input
                value={config.keywords ?? ''}
                onChange={e => onChange({ ...config, keywords: e.target.value })}
                placeholder="hello, hi, start, help, menu"
                className="text-[13px]"
              />
              <p className="text-[11px] text-gray-400">Separate multiple keywords with commas.</p>
            </div>
          )}

          {/* Keyword match with AND/OR conditions */}
          {selected === 'match_keyword' && (
            <div className="space-y-4">
              <div>
                <Label className="text-[13px] font-semibold text-gray-900">Keyword Conditions</Label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Conditions within a group are joined by <strong>AND</strong>. Groups are joined by <strong>OR</strong>.
                </p>
              </div>

              {groups.map((group, gi) => (
                <div key={gi}>
                  {/* OR divider between groups */}
                  {gi > 0 && (
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-gray-500">OR</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}

                  {/* Condition group card */}
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Group {gi + 1} {group.conditions.length > 1 ? `(${group.conditions.length} AND conditions)` : ''}
                      </span>
                      {groups.length > 1 && (
                        <button onClick={() => removeGroup(gi)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {group.conditions.map((cond, ci) => (
                      <div key={ci} className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-2.5">
                        {/* AND label between conditions */}
                        {ci > 0 && (
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 h-px bg-gray-100" />
                            <span className="text-[10px] font-bold text-gray-400">AND</span>
                            <div className="flex-1 h-px bg-gray-100" />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-medium text-gray-600">Incoming message</Label>
                          <button onClick={() => removeCondition(gi, ci)} className="text-gray-300 hover:text-red-400">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <select value={cond.operator}
                          onChange={e => updateCondition(gi, ci, { operator: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400">
                          {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                        <Input value={cond.value}
                          onChange={e => updateCondition(gi, ci, { value: e.target.value })}
                          placeholder="Type keyword or pattern…"
                          className="h-8 text-[12px] border-gray-200" />
                      </div>
                    ))}

                    {/* + AND condition */}
                    <button onClick={() => addCondition(gi)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-[11px] font-semibold text-gray-500 hover:bg-white hover:border-gray-400 transition-colors">
                      <Plus className="h-3 w-3" /> AND condition
                    </button>
                  </div>
                </div>
              ))}

              {/* + OR group */}
              <button onClick={addGroup}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-green-300 py-2.5 text-[12px] font-semibold text-green-600 hover:bg-green-50 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add OR group
              </button>

              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-[11px] text-blue-700 space-y-1">
                <p className="font-semibold">How this works:</p>
                <p>Bot triggers if <em>any</em> OR group matches.</p>
                <p>A group matches only if <em>all</em> its AND conditions are true.</p>
              </div>
            </div>
          )}

          {/* Webhook config */}
          {selected === 'webhook' && (
            <div className="space-y-3">
              <Label className="text-[13px] font-semibold text-gray-900">Webhook Endpoint</Label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-[11px] text-gray-400 mb-1">Your webhook URL (POST this to start the bot):</p>
                <p className="text-[12px] font-mono text-gray-700 break-all">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com'}/api/chatbots/execute
                </p>
              </div>
              <p className="text-[11px] text-gray-400">Send <code className="bg-gray-100 px-1 rounded">POST</code> with <code className="bg-gray-100 px-1 rounded">{"{ contactId, message }"}</code> to trigger this bot.</p>
            </div>
          )}

          {/* Simple triggers */}
          {['new_message', 'missed_call', 'payment_rcvd', 'payment_failed', 'new_order', 'order_updated'].includes(selected) && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <div className="text-2xl mb-2">✅</div>
              <p className="text-[13px] font-semibold text-green-800">
                {TRIGGERS.find(t => t.id === selected)?.label}
              </p>
              <p className="text-[11px] text-green-600 mt-1">
                No extra configuration needed. Click Save to apply.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="border-t border-gray-100 p-3">
        {view === 'list' ? (
          <button onClick={() => setView('config')}
            disabled={!selected}
            className="w-full rounded-xl py-2.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: '#25D366' }}>
            Configure →
          </button>
        ) : (
          <button onClick={onSave}
            className="w-full rounded-xl py-2.5 text-[13px] font-semibold text-white transition-colors"
            style={{ background: '#25D366' }}>
            Save Trigger
          </button>
        )}
      </div>
    </div>
  );
}
