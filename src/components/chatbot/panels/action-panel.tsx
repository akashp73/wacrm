'use client';

import { useState } from 'react';
import { X, Search, ChevronRight, Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NODE_DEFS, NODE_CATEGORIES, type NodeType } from '@/lib/chatbot/node-definitions';

// ─── Per-type config forms ─────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-gray-700">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function TextMsgForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Message text" hint="Use {{variable_name}} to insert saved values">
        <Textarea value={cfg.text as string ?? ''} onChange={e => set({ text: e.target.value })}
          placeholder="Hi {{contact_name}}, thanks for reaching out! 👋" rows={4} className="text-[12px] resize-none" />
        <p className="text-[10px] text-gray-400 text-right">{(cfg.text as string ?? '').length} chars</p>
      </Field>
    </div>
  );
}

function MediaForm({ cfg, set, type }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void; type: string }) {
  return (
    <div className="space-y-3">
      <Field label={`${type.charAt(0).toUpperCase() + type.slice(1)} URL`}>
        <Input value={cfg.url as string ?? ''} onChange={e => set({ url: e.target.value })}
          placeholder={`https://example.com/file.${type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'pdf'}`}
          className="text-[12px]" />
      </Field>
      {type !== 'audio' && (
        <Field label="Caption (optional)">
          <Input value={cfg.caption as string ?? ''} onChange={e => set({ caption: e.target.value })}
            placeholder="Optional caption text..." className="text-[12px]" />
        </Field>
      )}
      {type === 'document' && (
        <Field label="Filename">
          <Input value={cfg.filename as string ?? ''} onChange={e => set({ filename: e.target.value })}
            placeholder="report.pdf" className="text-[12px]" />
        </Field>
      )}
    </div>
  );
}

function LocationForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitude">
          <Input type="number" value={cfg.lat as string ?? ''} onChange={e => set({ lat: e.target.value })} placeholder="28.6139" className="text-[12px]" />
        </Field>
        <Field label="Longitude">
          <Input type="number" value={cfg.lng as string ?? ''} onChange={e => set({ lng: e.target.value })} placeholder="77.2090" className="text-[12px]" />
        </Field>
      </div>
      <Field label="Place name"><Input value={cfg.name as string ?? ''} onChange={e => set({ name: e.target.value })} placeholder="Our Office" className="text-[12px]" /></Field>
      <Field label="Address"><Input value={cfg.address as string ?? ''} onChange={e => set({ address: e.target.value })} placeholder="123 Main St, City" className="text-[12px]" /></Field>
    </div>
  );
}

function ButtonsForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  const buttons = (cfg.buttons as string[]) ?? [''];
  return (
    <div className="space-y-3">
      <Field label="Message body"><Textarea value={cfg.body as string ?? ''} onChange={e => set({ body: e.target.value })} placeholder="Please choose an option:" rows={3} className="text-[12px] resize-none" /></Field>
      <div className="space-y-2">
        <Label className="text-[12px] font-medium text-gray-700">Buttons (max 3)</Label>
        {buttons.map((btn, i) => (
          <div key={i} className="flex gap-2">
            <Input value={btn} onChange={e => { const arr = [...buttons]; arr[i] = e.target.value; set({ buttons: arr }); }} placeholder={`Button ${i + 1}`} className="text-[12px] flex-1" />
            {buttons.length > 1 && (
              <button onClick={() => set({ buttons: buttons.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {buttons.length < 3 && (
          <button onClick={() => set({ buttons: [...buttons, ''] })} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700">
            <Plus className="h-3 w-3" /> Add button
          </button>
        )}
      </div>
      <Field label="Footer (optional)"><Input value={cfg.footer as string ?? ''} onChange={e => set({ footer: e.target.value })} placeholder="Reply STOP to unsubscribe" className="text-[12px]" /></Field>
    </div>
  );
}

function ListForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  const sections = (cfg.sections as { title: string; items: string[] }[]) ?? [{ title: '', items: [''] }];
  return (
    <div className="space-y-3">
      <Field label="Header text"><Input value={cfg.header as string ?? ''} onChange={e => set({ header: e.target.value })} placeholder="Choose an option" className="text-[12px]" /></Field>
      <Field label="Body text"><Textarea value={cfg.body as string ?? ''} onChange={e => set({ body: e.target.value })} rows={2} placeholder="Select from the list below:" className="text-[12px] resize-none" /></Field>
      <Field label="Button label"><Input value={cfg.button as string ?? 'View options'} onChange={e => set({ button: e.target.value })} className="text-[12px]" /></Field>
      {sections.map((sec, si) => (
        <div key={si} className="rounded-lg border border-gray-200 p-2.5 space-y-2">
          <Input value={sec.title} onChange={e => { const arr = [...sections]; arr[si].title = e.target.value; set({ sections: arr }); }} placeholder={`Section ${si + 1} title`} className="text-[11px] h-7" />
          {sec.items.map((item, ii) => (
            <div key={ii} className="flex gap-1.5">
              <Input value={item} onChange={e => { const arr = [...sections]; arr[si].items[ii] = e.target.value; set({ sections: arr }); }} placeholder={`Option ${ii + 1}`} className="text-[11px] h-7 flex-1" />
              {sec.items.length > 1 && <button onClick={() => { const arr = [...sections]; arr[si].items.splice(ii, 1); set({ sections: arr }); }} className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>}
            </div>
          ))}
          {sec.items.length < 10 && <button onClick={() => { const arr = [...sections]; arr[si].items.push(''); set({ sections: arr }); }} className="text-[10px] text-gray-400 hover:text-gray-600">+ Add option</button>}
        </div>
      ))}
    </div>
  );
}

function AskForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Question to ask"><Textarea value={cfg.question as string ?? ''} onChange={e => set({ question: e.target.value })} placeholder="Please enter your email address:" rows={3} className="text-[12px] resize-none" /></Field>
      <Field label="Save answer to variable"><Input value={cfg.variable as string ?? ''} onChange={e => set({ variable: e.target.value })} placeholder="customer_email" className="text-[12px]" /></Field>
      <Field label="Validation type">
        <select value={cfg.validation as string ?? 'any'} onChange={e => set({ validation: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-900 focus:outline-none">
          {['any', 'text', 'number', 'email', 'phone', 'date'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
        </select>
      </Field>
      <Field label="Invalid answer message"><Input value={cfg.invalid_msg as string ?? ''} onChange={e => set({ invalid_msg: e.target.value })} placeholder="Please enter a valid value." className="text-[12px]" /></Field>
      <Field label="Max retries">
        <Input type="number" value={cfg.max_retries as number ?? 3} onChange={e => set({ max_retries: parseInt(e.target.value) || 3 })} className="text-[12px] w-20" min={1} max={10} />
      </Field>
    </div>
  );
}

function ConditionForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Variable to check"><Input value={cfg.variable as string ?? ''} onChange={e => set({ variable: e.target.value })} placeholder="customer_email" className="text-[12px]" /></Field>
      <Field label="Operator">
        <select value={cfg.operator as string ?? 'equals'} onChange={e => set({ operator: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] focus:outline-none">
          {['equals', 'not equals', 'contains', 'not contains', 'starts with', 'ends with', 'is empty', 'is not empty', 'greater than', 'less than'].map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </Field>
      {!['is empty', 'is not empty'].includes(cfg.operator as string) && (
        <Field label="Value"><Input value={cfg.value as string ?? ''} onChange={e => set({ value: e.target.value })} placeholder="Enter value to compare" className="text-[12px]" /></Field>
      )}
      <div className="rounded-lg bg-gray-50 p-2.5 text-[11px] text-gray-500 space-y-1">
        <p>✅ <strong>Yes</strong> handle: condition is true</p>
        <p>❌ <strong>No</strong> handle: condition is false</p>
      </div>
    </div>
  );
}

function AIRouterForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  const intents = (cfg.intents as string[]) ?? [];
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">AI reads the user's message and routes to the matching intent. Each intent creates an output handle.</p>
      {intents.map((intent, i) => (
        <div key={i} className="flex gap-2">
          <Input value={intent} onChange={e => { const arr = [...intents]; arr[i] = e.target.value; set({ intents: arr }); }} placeholder={`Intent ${i + 1} (e.g. "Price inquiry")`} className="text-[12px] flex-1" />
          <button onClick={() => set({ intents: intents.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button onClick={() => set({ intents: [...intents, ''] })} className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full justify-center">
        <Plus className="h-3.5 w-3.5" /> Add intent
      </button>
    </div>
  );
}

function TagForm({ cfg, set, action }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void; action: string }) {
  return (
    <Field label={`Tag to ${action}`}><Input value={cfg.tag as string ?? ''} onChange={e => set({ tag: e.target.value })} placeholder="e.g. hot_lead, paid_customer" className="text-[12px]" /></Field>
  );
}

function UpdateContactForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Field to update">
        <select value={cfg.field as string ?? 'name'} onChange={e => set({ field: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] focus:outline-none">
          {['name', 'email', 'company', 'custom_field'].map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      {cfg.field === 'custom_field' && <Field label="Custom field name"><Input value={cfg.custom_field as string ?? ''} onChange={e => set({ custom_field: e.target.value })} placeholder="field_name" className="text-[12px]" /></Field>}
      <Field label="New value"><Input value={cfg.value as string ?? ''} onChange={e => set({ value: e.target.value })} placeholder="{{variable}} or static text" className="text-[12px]" /></Field>
    </div>
  );
}

function DelayForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Delay duration">
        <div className="flex gap-2">
          <Input type="number" value={cfg.duration as number ?? 5} onChange={e => set({ duration: parseInt(e.target.value) || 5 })} className="text-[12px] w-24" min={1} />
          <select value={cfg.unit as string ?? 'seconds'} onChange={e => set({ unit: e.target.value })} className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:outline-none">
            {['seconds', 'minutes', 'hours'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </Field>
      <p className="text-[11px] text-gray-400">The bot pauses before executing the next step.</p>
    </div>
  );
}

function WebhookForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="URL"><Input value={cfg.url as string ?? ''} onChange={e => set({ url: e.target.value })} placeholder="https://api.example.com/webhook" className="text-[12px]" /></Field>
      <Field label="Method">
        <select value={cfg.method as string ?? 'POST'} onChange={e => set({ method: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] focus:outline-none">
          {['POST', 'GET', 'PUT', 'PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="JSON Body (optional)" hint="Use {{variable}} to include bot variables">
        <Textarea value={cfg.body as string ?? ''} onChange={e => set({ body: e.target.value })} placeholder={'{"contact": "{{contact_name}}", "phone": "{{contact_phone}}"}'} rows={4} className="text-[12px] resize-none font-mono" />
      </Field>
      <Field label="Save response to variable"><Input value={cfg.response_var as string ?? ''} onChange={e => set({ response_var: e.target.value })} placeholder="api_response" className="text-[12px]" /></Field>
    </div>
  );
}

function TemplateForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Template name"><Input value={cfg.template_name as string ?? ''} onChange={e => set({ template_name: e.target.value })} placeholder="welcome_message" className="text-[12px]" /></Field>
      <Field label="Language"><Input value={cfg.language as string ?? 'en_US'} onChange={e => set({ language: e.target.value })} className="text-[12px]" /></Field>
      <Field label="Variable values" hint="One per line: {{1}}=John, {{2}}=Order123">
        <Textarea value={cfg.variables as string ?? ''} onChange={e => set({ variables: e.target.value })} rows={3} className="text-[12px] resize-none" />
      </Field>
    </div>
  );
}

function AssignForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Assignment mode">
        <select value={cfg.mode as string ?? 'auto'} onChange={e => set({ mode: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] focus:outline-none">
          <option value="auto">Auto-assign (round robin)</option>
          <option value="specific">Specific agent</option>
        </select>
      </Field>
      {cfg.mode === 'specific' && <Field label="Agent email or ID"><Input value={cfg.agent_id as string ?? ''} onChange={e => set({ agent_id: e.target.value })} placeholder="agent@company.com" className="text-[12px]" /></Field>}
      <Field label="Message before handoff (optional)"><Input value={cfg.message as string ?? ''} onChange={e => set({ message: e.target.value })} placeholder="Connecting you to our team..." className="text-[12px]" /></Field>
    </div>
  );
}

function SaveVarForm({ cfg, set }: { cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Variable name"><Input value={cfg.variable as string ?? ''} onChange={e => set({ variable: e.target.value })} placeholder="order_id" className="text-[12px]" /></Field>
      <Field label="Value"><Input value={cfg.value as string ?? ''} onChange={e => set({ value: e.target.value })} placeholder="{{previous_reply}} or static text" className="text-[12px]" /></Field>
    </div>
  );
}

function ConfigForm({ nodeType, cfg, set }: { nodeType: string; cfg: Record<string, unknown>; set: (p: Partial<Record<string, unknown>>) => void }) {
  switch (nodeType) {
    case 'send_text':      return <TextMsgForm cfg={cfg} set={set} />;
    case 'send_image':     return <MediaForm cfg={cfg} set={set} type="image" />;
    case 'send_video':     return <MediaForm cfg={cfg} set={set} type="video" />;
    case 'send_audio':     return <MediaForm cfg={cfg} set={set} type="audio" />;
    case 'send_document':  return <MediaForm cfg={cfg} set={set} type="document" />;
    case 'send_location':  return <LocationForm cfg={cfg} set={set} />;
    case 'send_template':  return <TemplateForm cfg={cfg} set={set} />;
    case 'send_buttons':   return <ButtonsForm cfg={cfg} set={set} />;
    case 'send_list':      return <ListForm cfg={cfg} set={set} />;
    case 'ask_question':   return <AskForm cfg={cfg} set={set} />;
    case 'condition':      return <ConditionForm cfg={cfg} set={set} />;
    case 'ai_router':      return <AIRouterForm cfg={cfg} set={set} />;
    case 'add_tag':        return <TagForm cfg={cfg} set={set} action="add" />;
    case 'remove_tag':     return <TagForm cfg={cfg} set={set} action="remove" />;
    case 'update_contact': return <UpdateContactForm cfg={cfg} set={set} />;
    case 'delay':          return <DelayForm cfg={cfg} set={set} />;
    case 'assign_to_agent':return <AssignForm cfg={cfg} set={set} />;
    case 'webhook':        return <WebhookForm cfg={cfg} set={set} />;
    case 'save_variable':  return <SaveVarForm cfg={cfg} set={set} />;
    case 'end_bot':
      return <div className="rounded-lg bg-red-50 p-3 text-[12px] text-red-600">This node ends the bot session and closes the conversation.</div>;
    default:
      return <div className="rounded-lg bg-gray-50 p-3 text-[12px] text-gray-500">Configuration for <strong>{nodeType}</strong> coming soon.</div>;
  }
}

// ─── Picker panel ─────────────────────────────────────────────

interface ActionPanelProps {
  mode: 'pick' | 'configure';
  nodeType?: string;
  config?: Record<string, unknown>;
  onPickType: (type: NodeType) => void;
  onConfigChange: (cfg: Record<string, unknown>) => void;
  onClose: () => void;
  onSave: () => void;
  onBack: () => void;
}

export function ActionPanel({ mode, nodeType, config = {}, onPickType, onConfigChange, onClose, onSave, onBack }: ActionPanelProps) {
  const [search, setSearch] = useState('');
  const def = nodeType ? NODE_DEFS[nodeType] : null;

  const filteredDefs = Object.values(NODE_DEFS).filter(d =>
    !search || d.label.toLowerCase().includes(search.toLowerCase()) || d.description.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = NODE_CATEGORIES.map(cat => ({
    cat,
    items: filteredDefs.filter(d => d.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {mode === 'configure' && def ? (
            <>
              <span className="text-lg">{def.icon}</span>
              <span className="text-[13px] font-semibold text-gray-900">{def.label}</span>
            </>
          ) : (
            <span className="text-[13px] font-semibold text-gray-900">Add Action</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {mode === 'configure' && (
            <button onClick={onBack} className="text-[11px] text-gray-400 hover:text-gray-600">← Back</button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Search (picker only) */}
      {mode === 'pick' && (
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions…" className="pl-8 h-8 text-[12px] border-gray-200" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'pick' ? (
          <div className="py-2">
            {grouped.map(({ cat, items }) => (
              <div key={cat} className="mb-1">
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">{cat}</p>
                {items.map(d => (
                  <button key={d.type} onClick={() => onPickType(d.type as NodeType)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
                      style={{ background: `${d.color}15` }}>
                      {d.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-gray-900">{d.label}</p>
                      <p className="text-[11px] text-gray-400 truncate">{d.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <ConfigForm
              nodeType={nodeType ?? ''}
              cfg={config}
              set={patch => onConfigChange({ ...config, ...patch })}
            />
          </div>
        )}
      </div>

      {/* Save footer (configure mode) */}
      {mode === 'configure' && (
        <div className="border-t border-gray-100 p-3">
          <button onClick={onSave}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-[13px] font-semibold text-white hover:bg-gray-700 transition-colors">
            Save
          </button>
        </div>
      )}
    </div>
  );
}
