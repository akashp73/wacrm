'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { NODE_DEFS, TRIGGER_LABELS, getByPath, normalizePhone, type ActionType, type TriggerType, type PhoneFormatMode } from '@/lib/bot-studio/node-definitions';

export interface MessageTemplateOption {
  id: string;
  name: string;
  body_text: string;
  language: string | null;
}

export interface GotoTarget {
  id: string;
  label: string;
}

interface ConfigPanelProps {
  kind: 'trigger' | 'action';
  nodeType: TriggerType | ActionType;
  config: Record<string, unknown>;
  botId: string;
  templates: MessageTemplateOption[];
  gotoTargets: GotoTarget[];
  onChange: (cfg: Record<string, unknown>) => void;
  onSave: () => void;
  onClose: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-800 outline-none focus:ring-2 focus:ring-gray-300";
const selectCls = inputCls + " bg-white";

export function ConfigPanel({
  kind, nodeType, config, botId, templates, gotoTargets, onChange, onSave, onClose,
}: ConfigPanelProps) {
  const [copied, setCopied] = useState(false);
  const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch });

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/bot-studio/webhook/${botId}`
    : `/api/bot-studio/webhook/${botId}`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // ── Capture Response (webhook trigger) ──
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capture, setCapture] = useState<{ payload: unknown; at: string | null } | null>(null);
  const [captureLoading, setCaptureLoading] = useState(false);

  const loadCapture = () => {
    setCaptureLoading(true);
    fetch(`/api/bot-studio/${botId}`)
      .then(res => res.json())
      .then(data => {
        const bot = (data?.bot ?? {}) as Record<string, unknown>;
        setCapture({ payload: bot.last_webhook_payload ?? null, at: (bot.last_webhook_at as string) ?? null });
      })
      .catch(() => setCapture(null))
      .finally(() => setCaptureLoading(false));
  };

  const openCapture = () => {
    setCaptureOpen(true);
    loadCapture();
  };

  const title = kind === 'trigger'
    ? TRIGGER_LABELS[nodeType as TriggerType] ?? 'Trigger'
    : NODE_DEFS[nodeType as ActionType]?.label ?? nodeType;
  const icon = kind === 'trigger' ? '⚡' : NODE_DEFS[nodeType as ActionType]?.icon ?? '📦';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <span className="text-lg leading-none">{icon}</span>
        <p className="flex-1 text-[13px] font-semibold text-gray-900">{title}</p>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {kind === 'trigger' && nodeType === 'message_received' && (
          <>
            <Field label="Keyword" hint="Leave blank to match any message">
              <input
                value={(config.keyword as string) ?? ''}
                onChange={e => set({ keyword: e.target.value })}
                placeholder="e.g. hello, pricing, support"
                className={inputCls}
              />
            </Field>
            <Field label="Match type">
              <select
                value={(config.match_type as string) ?? 'contains'}
                onChange={e => set({ match_type: e.target.value })}
                className={selectCls}
              >
                <option value="exact">Exact match</option>
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
              </select>
            </Field>
          </>
        )}

        {kind === 'trigger' && nodeType === 'webhook' && (
          <>
            <Field label="Webhook URL" hint="POST a JSON body to this URL to trigger the bot.">
              <div className="flex items-center gap-1.5">
                <input readOnly value={webhookUrl} className={inputCls + " font-mono text-[11px]"} />
                <button onClick={copyWebhookUrl}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Field>

            <Field label="Select phone number field" hint='Dot-path to the phone number inside the webhook JSON body, e.g. "data.phone" or "contact.number"'>
              <input
                value={(config.phone_field as string) ?? ''}
                onChange={e => set({ phone_field: e.target.value })}
                placeholder="e.g. data.phone"
                className={inputCls + " font-mono"}
              />
              {Boolean((config.phone_field as string)?.trim()) && capture?.payload != null && (
                <p className="text-[10px] text-gray-400">
                  Extracted from last payload:{' '}
                  <span className="font-mono text-gray-600">
                    {String(getByPath(capture.payload, config.phone_field as string) ?? '— not found —')}
                  </span>
                </p>
              )}
            </Field>

            <Field label="Country code handling" hint="WhatsApp requires the full number with country code and no + sign (e.g. 919876543210)">
              <select
                value={(config.phone_format as string) ?? 'as_is'}
                onChange={e => set({ phone_format: e.target.value })}
                className={selectCls}
              >
                <option value="as_is">Use number exactly as received</option>
                <option value="prepend_country_code">Add country code if missing</option>
              </select>
            </Field>

            {(config.phone_format as string) === 'prepend_country_code' && (
              <Field label="Country code" hint='Digits only, no + sign — e.g. "91" for India, "1" for US'>
                <input
                  value={(config.country_code as string) ?? ''}
                  onChange={e => set({ country_code: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 91"
                  className={inputCls + " font-mono"}
                />
              </Field>
            )}

            {Boolean((config.phone_field as string)?.trim()) && capture?.payload != null && (
              <p className="text-[10px] text-gray-400">
                Number that will be sent to WhatsApp:{' '}
                <span className="font-mono text-gray-600">
                  {normalizePhone(String(getByPath(capture.payload, config.phone_field as string) ?? ''), {
                    mode: (config.phone_format as PhoneFormatMode) ?? 'as_is',
                    countryCode: config.country_code as string,
                  }) || '— not found —'}
                </span>
              </p>
            )}

            <div>
              <button onClick={openCapture}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Capture Response
              </button>
              <p className="mt-1 text-[10px] text-gray-400">Send a test POST request to the webhook URL above, then click here to inspect the last payload received.</p>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] font-medium text-gray-600 mb-1">Example request</p>
              <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap leading-relaxed">{`POST ${webhookUrl}
Content-Type: application/json

{ "data": { "phone": "15551234567" } }`}</pre>
            </div>

            {captureOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6" onClick={() => setCaptureOpen(false)}>
                <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <p className="text-[13px] font-semibold text-gray-900">Last captured payload</p>
                    <button onClick={() => setCaptureOpen(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto px-4 py-3 space-y-2">
                    {captureLoading && <p className="text-[12px] text-gray-400">Loading…</p>}
                    {!captureLoading && capture?.payload == null && (
                      <p className="text-[12px] text-gray-400">No payload captured yet. Send a test POST request to the webhook URL, then click Refresh.</p>
                    )}
                    {!captureLoading && capture?.payload != null && (
                      <>
                        {capture.at && <p className="text-[10px] text-gray-400">Received {new Date(capture.at).toLocaleString()}</p>}
                        <pre className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-[11px] text-gray-700 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                          {JSON.stringify(capture.payload, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
                    <button onClick={loadCapture} disabled={captureLoading}
                      className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                      Refresh
                    </button>
                    <button onClick={() => setCaptureOpen(false)}
                      className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-gray-700 transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {kind === 'action' && nodeType === 'send_message' && (
          <Field label="Message text" hint="Use {{contact.name}} or {{contact.phone}} to insert variables">
            <textarea
              value={(config.text as string) ?? ''}
              onChange={e => set({ text: e.target.value })}
              placeholder="Hi {{contact.name}}, thanks for reaching out!"
              rows={6}
              className={inputCls + " resize-none"}
            />
          </Field>
        )}

        {kind === 'action' && nodeType === 'send_template' && (
          <>
            <Field label="Template" hint={templates.length === 0 ? 'No approved templates found — create one in Templates.' : undefined}>
              <select
                value={(config.template_name as string) ?? ''}
                onChange={e => {
                  const tpl = templates.find(t => t.name === e.target.value);
                  set({ template_name: e.target.value, language: tpl?.language ?? 'en_US' });
                }}
                className={selectCls}
              >
                <option value="">Select a template…</option>
                {templates.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </Field>
            {(() => {
              const tpl = templates.find(t => t.name === config.template_name);
              const varCount = tpl ? (tpl.body_text.match(/\{\{\d+\}\}/g) ?? []).length : 0;
              if (!tpl || varCount === 0) return null;
              const vars = (config.variables ?? {}) as Record<string, string>;
              return (
                <Field label="Template variables" hint="Type the exact key from your webhook payload">
                  <div className="space-y-2">
                    {Array.from({ length: varCount }, (_, i) => String(i + 1)).map(n => (
                      <div key={n} className="flex items-center gap-2">
                        <span className="shrink-0 text-[11px] font-mono text-gray-400 w-12">{`{{${n}}}`}</span>
                        <input
                          value={vars[n] ?? ''}
                          onChange={e => set({ variables: { ...vars, [n]: e.target.value } })}
                          placeholder="payload key (e.g. name, number, link)"
                          className={inputCls}
                        />
                      </div>
                    ))}
                  </div>
                </Field>
              );
            })()}
          </>
        )}

        {kind === 'action' && nodeType === 'send_interactive_list' && (
          <>
            <Field label="Body text">
              <textarea
                value={(config.body as string) ?? ''}
                onChange={e => set({ body: e.target.value })}
                placeholder="Choose an option below"
                rows={3}
                className={inputCls + " resize-none"}
              />
            </Field>
            <Field label="Button text">
              <input
                value={(config.button_text as string) ?? ''}
                onChange={e => set({ button_text: e.target.value })}
                placeholder="View options"
                className={inputCls}
              />
            </Field>
            <Field label="List items">
              <div className="space-y-2">
                {((config.items ?? []) as { id: string; title: string }[]).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      value={item.title ?? ''}
                      onChange={e => {
                        const items = [...((config.items ?? []) as { id: string; title: string }[])];
                        items[idx] = { ...items[idx], title: e.target.value };
                        set({ items });
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className={inputCls}
                    />
                    <button
                      onClick={() => {
                        const items = ((config.items ?? []) as unknown[]).filter((_, i) => i !== idx);
                        set({ items });
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const items = [...((config.items ?? []) as { id: string; title: string }[])];
                    items.push({ id: `item_${items.length + 1}`, title: '' });
                    set({ items });
                  }}
                  className="text-[11px] font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  + Add item
                </button>
              </div>
            </Field>
          </>
        )}

        {kind === 'action' && nodeType === 'send_media' && (
          <>
            <Field label="Media type">
              <select
                value={(config.media_type as string) ?? 'image'}
                onChange={e => set({ media_type: e.target.value })}
                className={selectCls}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="document">Document</option>
              </select>
            </Field>
            <Field label="Media URL">
              <input
                value={(config.url as string) ?? ''}
                onChange={e => set({ url: e.target.value })}
                placeholder="https://example.com/file.jpg"
                className={inputCls}
              />
            </Field>
            <Field label="Caption (optional)">
              <textarea
                value={(config.caption as string) ?? ''}
                onChange={e => set({ caption: e.target.value })}
                rows={2}
                className={inputCls + " resize-none"}
              />
            </Field>
          </>
        )}

        {kind === 'action' && nodeType === 'condition' && (
          <>
            <Field label="Field">
              <select
                value={(config.field as string) ?? 'message_text'}
                onChange={e => set({ field: e.target.value })}
                className={selectCls}
              >
                <option value="message_text">Message text</option>
                <option value="contact_tag">Contact tag</option>
                <option value="contact_name">Contact name</option>
                <option value="webhook_field">Webhook payload field</option>
              </select>
            </Field>
            {(config.field as string) === 'webhook_field' && (
              <Field label="Field path" hint='Dot-path into the webhook JSON body, e.g. "data.status" or "order.total"'>
                <input
                  value={(config.field_path as string) ?? ''}
                  onChange={e => set({ field_path: e.target.value })}
                  placeholder="e.g. data.status"
                  className={inputCls + " font-mono"}
                />
              </Field>
            )}
            <Field label="Operator">
              <select
                value={(config.operator as string) ?? 'contains'}
                onChange={e => set({ operator: e.target.value })}
                className={selectCls}
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="starts_with">Starts with</option>
              </select>
            </Field>
            <Field label="Value">
              <input
                value={(config.value as string) ?? ''}
                onChange={e => set({ value: e.target.value })}
                placeholder="e.g. yes"
                className={inputCls}
              />
            </Field>
            <p className="text-[10px] text-gray-400">
              Connect the <span className="font-medium text-emerald-600">True</span> and{' '}
              <span className="font-medium text-red-500">False</span> handles on the right side of this node to branch the flow.
            </p>
          </>
        )}

        {kind === 'action' && nodeType === 'delay' && (
          <Field label="Wait for">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={(config.duration as number) ?? 1}
                onChange={e => set({ duration: Number(e.target.value) })}
                className={inputCls + " w-24"}
              />
              <select
                value={(config.unit as string) ?? 'minutes'}
                onChange={e => set({ unit: e.target.value })}
                className={selectCls}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </Field>
        )}

        {kind === 'action' && nodeType === 'goto' && (
          <Field label="Jump to" hint="Continue the flow from the selected node">
            <select
              value={(config.target_node_id as string) ?? ''}
              onChange={e => {
                const target = gotoTargets.find(t => t.id === e.target.value);
                set({ target_node_id: e.target.value, target_label: target?.label ?? '' });
              }}
              className={selectCls}
            >
              <option value="">Select a step…</option>
              {gotoTargets.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
        <button onClick={onClose}
          className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onSave}
          className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-gray-700 transition-colors">
          Save
        </button>
      </div>
    </div>
  );
}
