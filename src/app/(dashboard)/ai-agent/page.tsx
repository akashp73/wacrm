'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Eye, EyeOff, Loader2, Send, RefreshCw, ChevronDown, ChevronUp,
  Plus, X, Check,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PROVIDER_MODELS } from '@/lib/ai/agent-models';

// ─── Default config ───────────────────────────────────────────

const DEFAULT: AgentConfig = {
  is_active: false,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  api_key_override: '',
  temperature: 0.7,
  max_tokens: 500,
  response_format: 'balanced',
  business_context: '',
  agent_personality: '',
  agent_name: 'Assistant',
  greeting_message: "Hi {{contact_name}}! 👋 I'm {{agent_name}}, your virtual assistant. How can I help you today?",
  fallback_message: "I'm not sure about that — let me connect you with our team who can help better. Please hold on!",
  escalation_message: "I'm connecting you with one of our team members right now. They'll be with you shortly! 🙏",
  tone: 'friendly',
  formality_level: 3,
  language_mode: 'auto',
  fixed_language: '',
  use_emojis: false,
  use_bullet_points: true,
  always_end_with_question: false,
  use_bold_words: false,
  keep_replies_short: false,
  guardrails: ['Never share internal pricing formulas', 'Never make promises about refunds', 'Never discuss competitor products'],
  never_reveal_ai: true,
  never_share_customer_info: true,
  never_process_payments: true,
  handoff_keyword: 'HUMAN',
  auto_handoff_on_unknown: false,
  send_handoff_message: true,
  notify_team_on_handoff: true,
  business_hours_only: false,
  business_hours: {},
  timezone: 'Asia/Kolkata',
  outside_hours_message: "Thanks for reaching out! We're currently closed. We'll get back to you first thing tomorrow! 🙏",
};

interface AgentConfig {
  is_active: boolean;
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
  model: string;
  api_key_override: string;
  temperature: number;
  max_tokens: number;
  response_format: string;
  business_context: string;
  agent_personality: string;
  agent_name: string;
  greeting_message: string;
  fallback_message: string;
  escalation_message: string;
  tone: string;
  formality_level: number;
  language_mode: string;
  fixed_language: string;
  use_emojis: boolean;
  use_bullet_points: boolean;
  always_end_with_question: boolean;
  use_bold_words: boolean;
  keep_replies_short: boolean;
  guardrails: string[];
  never_reveal_ai: boolean;
  never_share_customer_info: boolean;
  never_process_payments: boolean;
  handoff_keyword: string;
  auto_handoff_on_unknown: boolean;
  send_handoff_message: boolean;
  notify_team_on_handoff: boolean;
  business_hours_only: boolean;
  business_hours: Record<string, unknown>;
  timezone: string;
  outside_hours_message: string;
}

// ─── Re-usable primitives ─────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 space-y-4 ${className}`}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-foreground' : 'bg-border'
        }`}
        aria-checked={checked}
        role="switch"
      >
        <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  );
}

// ─── Tab 1 — Model & Brain ────────────────────────────────────

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', emoji: '🔮', sub: 'Claude', accent: '#7C3AED' },
  { id: 'openai',    name: 'OpenAI',    emoji: '🟢', sub: 'GPT',    accent: '#10B981' },
  { id: 'gemini',    name: 'Gemini',    emoji: '🔵', sub: 'Google', accent: '#3B82F6' },
  { id: 'groq',      name: 'Groq',      emoji: '⚡', sub: 'Fast',   accent: '#F59E0B' },
] as const;

function ModelTab({ cfg, set }: { cfg: AgentConfig; set: (patch: Partial<AgentConfig>) => void }) {
  const [showKey, setShowKey] = useState(false);
  const [useOwnKey, setUseOwnKey] = useState(!!cfg.api_key_override);
  const models = PROVIDER_MODELS[cfg.provider] ?? [];

  const TOKEN_PRESETS = [
    { label: 'Short',  value: 150 },
    { label: 'Medium', value: 500 },
    { label: 'Long',   value: 1000 },
    { label: 'Custom', value: -1 },
  ];
  const presetMatch = TOKEN_PRESETS.find(p => p.value === cfg.max_tokens)?.label ?? 'Custom';

  return (
    <div className="space-y-6">
      {/* Provider selection */}
      <div>
        <SectionLabel>AI Model</SectionLabel>
        <SectionCard>
          <div>
            <p className="text-[13px] font-semibold text-foreground">Choose your AI provider</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Select which AI powers your agent.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROVIDERS.map((p) => {
              const active = cfg.provider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const first = PROVIDER_MODELS[p.id]?.[0]?.id ?? '';
                    set({ provider: p.id as AgentConfig['provider'], model: first });
                  }}
                  className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all ${
                    active ? 'bg-card' : 'bg-card hover:bg-muted border-border'
                  }`}
                  style={{ borderColor: active ? p.accent : undefined }}
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <p className="text-[13px] font-semibold text-foreground">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{p.sub}</p>
                  {active && <Check className="h-3.5 w-3.5 mt-0.5" style={{ color: p.accent }} />}
                </button>
              );
            })}
          </div>

          {/* Model selector */}
          <div className="space-y-1.5">
            <Label className="text-[13px]">Model</Label>
            <select
              value={cfg.model}
              onChange={(e) => set({ model: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tag} · {m.context} ctx
                </option>
              ))}
            </select>
          </div>
        </SectionCard>
      </div>

      {/* API Key */}
      <div>
        <SectionLabel>API Key</SectionLabel>
        <SectionCard>
          <Toggle
            checked={useOwnKey}
            onChange={(v) => { setUseOwnKey(v); if (!v) set({ api_key_override: '' }); }}
            label="Use my own API key"
            hint="Override the platform key with your personal key"
          />
          {useOwnKey && (
            <div className="space-y-1.5">
              <Label className="text-[13px]">Your API key</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={cfg.api_key_override}
                  onChange={(e) => set({ api_key_override: e.target.value })}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Your key is encrypted and never logged.</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Parameters */}
      <div>
        <SectionLabel>Model Parameters</SectionLabel>
        <SectionCard>
          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[13px]">Temperature</Label>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {cfg.temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range" min={0} max={1} step={0.1}
              value={cfg.temperature}
              onChange={(e) => set({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>🎯 Precise</span><span>🎲 Creative</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Lower = more consistent. Higher = more varied and creative.</p>
          </div>

          {/* Max tokens */}
          <div className="space-y-2">
            <Label className="text-[13px]">Max Response Length</Label>
            <div className="flex flex-wrap gap-2">
              {TOKEN_PRESETS.map((p) => {
                const active = p.value === -1 ? presetMatch === 'Custom' : cfg.max_tokens === p.value;
                return (
                  <button
                    key={p.label}
                    onClick={() => { if (p.value !== -1) set({ max_tokens: p.value }); }}
                    className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      active ? 'bg-foreground text-background border-foreground' : 'bg-card text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {p.label}{p.value !== -1 ? ` (${p.value})` : ''}
                  </button>
                );
              })}
              {presetMatch === 'Custom' && (
                <Input
                  type="number" min={50} max={4000}
                  value={cfg.max_tokens}
                  onChange={(e) => set({ max_tokens: parseInt(e.target.value) || 500 })}
                  className="w-24 h-8 text-[12px]"
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">WhatsApp messages read better when short. Recommended: Medium (500).</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Tab 2 — Business Context ──────────────────────────────────

function ContextTab({ cfg, set }: { cfg: AgentConfig; set: (patch: Partial<AgentConfig>) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>About Your Business</SectionLabel>
        <SectionCard>
          <div>
            <p className="text-[13px] font-semibold text-foreground">Business Context</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Describe your business in detail. The more context you give, the smarter your agent becomes.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-[13px]">Business description</Label>
              <span className="text-[11px] text-muted-foreground">{(cfg.business_context || '').length} / 2000</span>
            </div>
            <Textarea
              value={cfg.business_context}
              onChange={(e) => set({ business_context: e.target.value.slice(0, 2000) })}
              rows={10}
              placeholder={`Describe your business here. Include:
- What your business does
- Your products or services (with prices if applicable)
- Your target customers
- Your location / service areas
- Business hours
- Return / refund policy
- Frequently asked questions

Example:
We are GrowthPrint, a custom merchandise printing company based in Ahmedabad, Gujarat. We print t-shirts, hoodies, mugs, phone cases, and banners. T-shirts start at ₹299 each for 10+ pieces. Delivery in 5-7 business days across India.`}
              className="min-h-[200px] resize-y text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground">💡 Tip: Paste your website's About page or FAQ section here directly.</p>
          </div>
        </SectionCard>
      </div>

      <div>
        <SectionLabel>Agent Instructions</SectionLabel>
        <SectionCard>
          <div>
            <p className="text-[13px] font-semibold text-foreground">How should the agent behave?</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Write specific instructions for handling conversations.</p>
          </div>
          <Textarea
            value={cfg.agent_personality}
            onChange={(e) => set({ agent_personality: e.target.value })}
            rows={8}
            placeholder={`Write operating instructions. Examples:

- Always greet customers by their first name if available
- Never promise delivery dates — always say 'approximately 5-7 days'
- If bulk pricing over 500 pieces, ask them to email sales@company.com
- Do not discuss competitor products
- Always end every reply with a question to keep the conversation going
- If customer seems angry, immediately offer to connect with support team
- For orders above ₹5000, offer discount code: BULK5`}
            className="min-h-[160px] resize-y text-[13px]"
          />
        </SectionCard>
      </div>

      <div>
        <SectionLabel>Greeting & Fallback Messages</SectionLabel>
        <div className="space-y-4">
          {[
            {
              key: 'greeting_message' as keyof AgentConfig,
              label: 'Welcome message',
              hint: 'Sent when agent starts a new conversation',
              vars: '{{contact_name}}, {{agent_name}}, {{business_name}}, {{current_time}}',
            },
            {
              key: 'fallback_message' as keyof AgentConfig,
              label: 'Fallback message',
              hint: "When agent doesn't know the answer",
              vars: null,
            },
            {
              key: 'escalation_message' as keyof AgentConfig,
              label: 'Handoff message',
              hint: 'When handing off to a human agent',
              vars: null,
            },
          ].map(({ key, label, hint, vars }) => (
            <SectionCard key={key}>
              <div>
                <p className="text-[13px] font-semibold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
              </div>
              <Textarea
                value={(cfg[key] as string) || ''}
                onChange={(e) => set({ [key]: e.target.value })}
                rows={3}
                className="resize-none text-[13px]"
              />
              {vars && <p className="text-[11px] text-muted-foreground">Variables: {vars}</p>}
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3 — Personality & Tone ────────────────────────────────

const TONES = [
  { id: 'friendly', emoji: '🤝', label: 'Friendly',  desc: 'Warm and approachable' },
  { id: 'formal',   emoji: '👔', label: 'Formal',    desc: 'Business professional' },
  { id: 'casual',   emoji: '😊', label: 'Casual',    desc: 'Like a friend' },
  { id: 'direct',   emoji: '⚡', label: 'Direct',    desc: 'Short and to the point' },
  { id: 'expert',   emoji: '🎓', label: 'Expert',    desc: 'Knowledgeable advisor' },
];

const LANGUAGES = [
  'English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil',
  'Telugu', 'Kannada', 'Bengali', 'Punjabi', 'Urdu',
];

function PersonalityTab({ cfg, set }: { cfg: AgentConfig; set: (patch: Partial<AgentConfig>) => void }) {
  const [newGuardrail, setNewGuardrail] = useState('');

  const addGuardrail = () => {
    const g = newGuardrail.trim();
    if (!g) return;
    set({ guardrails: [...cfg.guardrails, g] });
    setNewGuardrail('');
  };

  const removeGuardrail = (i: number) => {
    set({ guardrails: cfg.guardrails.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-6">
      {/* Agent Name */}
      <div>
        <SectionLabel>Persona</SectionLabel>
        <SectionCard>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Agent's name</Label>
            <Input
              value={cfg.agent_name}
              onChange={(e) => set({ agent_name: e.target.value })}
              placeholder="e.g. Priya, Alex, Support Bot"
              className="max-w-xs"
            />
            <p className="text-[11px] text-muted-foreground">Used in greetings and when the agent refers to itself.</p>
          </div>
        </SectionCard>
      </div>

      {/* Tone cards */}
      <div>
        <SectionLabel>Conversation Style</SectionLabel>
        <SectionCard>
          <div>
            <p className="text-[13px] font-semibold text-foreground">Tone</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Define how your agent communicates.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TONES.map((t) => {
              const active = cfg.tone === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => set({ tone: t.id })}
                  className={`flex flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition-all ${
                    active ? 'border-foreground bg-card' : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  <p className="text-[12px] font-semibold text-foreground">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t.desc}</p>
                  {active && <Check className="h-3 w-3 text-foreground" />}
                </button>
              );
            })}
          </div>

          {/* Formality slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[13px]">Formality level</Label>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {cfg.formality_level}/5
              </span>
            </div>
            <input
              type="range" min={1} max={5} step={1}
              value={cfg.formality_level}
              onChange={(e) => set({ formality_level: parseInt(e.target.value) })}
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Very Casual</span><span>Very Formal</span>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-3">
            <Toggle
              checked={cfg.language_mode === 'auto'}
              onChange={(v) => set({ language_mode: v ? 'auto' : 'fixed' })}
              label="Auto-detect language"
              hint="Reply in the same language the customer uses"
            />
            {cfg.language_mode === 'fixed' && (
              <div className="space-y-1.5">
                <Label className="text-[13px]">Reply language</Label>
                <select
                  value={cfg.fixed_language}
                  onChange={(e) => set({ fixed_language: e.target.value })}
                  className="w-48 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Communication prefs */}
      <div>
        <SectionLabel>Communication Preferences</SectionLabel>
        <SectionCard className="space-y-4">
          {[
            { key: 'use_emojis',               label: 'Use emojis in replies 😊' },
            { key: 'use_bullet_points',         label: 'Use bullet points for lists' },
            { key: 'always_end_with_question',  label: 'Always end reply with a question', hint: 'Keeps the conversation going' },
            { key: 'use_bold_words',            label: 'Bold important words using *asterisks*' },
            { key: 'keep_replies_short',        label: 'Keep replies under 3 sentences when possible' },
          ].map(({ key, label, hint }) => (
            <Toggle
              key={key}
              checked={cfg[key as keyof AgentConfig] as boolean}
              onChange={(v) => set({ [key]: v })}
              label={label}
              hint={hint}
            />
          ))}
        </SectionCard>
      </div>

      {/* Guardrails */}
      <div>
        <SectionLabel>Guardrails</SectionLabel>
        <SectionCard>
          <div>
            <p className="text-[13px] font-semibold text-foreground">What the agent should NEVER do</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Hard rules the agent will never break, regardless of what customers ask.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {cfg.guardrails.map((g, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[12px] text-foreground">
                {g}
                <button onClick={() => removeGuardrail(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={newGuardrail}
              onChange={(e) => setNewGuardrail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addGuardrail(); }}
              placeholder="Type a rule and press Enter..."
              className="flex-1 text-[13px]"
            />
            <Button variant="outline" onClick={addGuardrail} className="shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-2 pt-1">
            {[
              { key: 'never_reveal_ai',           label: 'Never confirm being an AI unless directly asked' },
              { key: 'never_share_customer_info',  label: "Never share other customers' information" },
              { key: 'never_process_payments',     label: 'Never accept payments or process orders directly' },
            ].map(({ key, label }) => (
              <Toggle
                key={key}
                checked={cfg[key as keyof AgentConfig] as boolean}
                onChange={(v) => set({ [key]: v })}
                label={label}
              />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Tab 4 — Handoff & Availability ───────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function HandoffTab({ cfg, set }: { cfg: AgentConfig; set: (patch: Partial<AgentConfig>) => void }) {
  const bh = cfg.business_hours as Record<string, { open: string; close: string; active: boolean }>;

  const setDay = (day: string, patch: Partial<{ open: string; close: string; active: boolean }>) => {
    set({
      business_hours: {
        ...bh,
        [day]: { ...{ open: '10:00', close: '19:00', active: true }, ...(bh[day] ?? {}), ...patch },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Handoff settings */}
      <div>
        <SectionLabel>Human Handoff</SectionLabel>
        <SectionCard className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Handoff keyword</Label>
              <Input
                value={cfg.handoff_keyword}
                onChange={(e) => set({ handoff_keyword: e.target.value.toUpperCase() })}
                placeholder="HUMAN"
                className="uppercase"
              />
              <p className="text-[11px] text-muted-foreground">When customer types this, agent stops responding.</p>
            </div>
          </div>
          <Toggle checked={cfg.auto_handoff_on_unknown} onChange={(v) => set({ auto_handoff_on_unknown: v })}
            label="Auto-handoff if no knowledge found"
            hint="Agent hands off when it can't answer a question" />
          <Toggle checked={cfg.send_handoff_message} onChange={(v) => set({ send_handoff_message: v })}
            label="Send handoff message to customer" />
          <Toggle checked={cfg.notify_team_on_handoff} onChange={(v) => set({ notify_team_on_handoff: v })}
            label="Notify team in inbox"
            hint="Creates an internal note when handoff occurs" />
        </SectionCard>
      </div>

      {/* Business hours */}
      <div>
        <SectionLabel>Business Hours</SectionLabel>
        <SectionCard className="space-y-4">
          <Toggle checked={cfg.business_hours_only} onChange={(v) => set({ business_hours_only: v })}
            label="Only reply during business hours"
            hint="Agent will send the outside-hours message when closed" />

          {cfg.business_hours_only && (
            <>
              <div className="space-y-2">
                {DAYS.map((day) => {
                  const d = bh[day] ?? { open: '10:00', close: '19:00', active: day !== 'Sunday' };
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={d.active}
                        onChange={(e) => setDay(day, { active: e.target.checked })}
                        className="accent-foreground"
                      />
                      <span className="w-24 text-[13px] text-foreground">{day.slice(0, 3)}</span>
                      <input
                        type="time" value={d.open}
                        onChange={(e) => setDay(day, { open: e.target.value })}
                        disabled={!d.active}
                        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground disabled:opacity-40"
                      />
                      <span className="text-[12px] text-muted-foreground">–</span>
                      <input
                        type="time" value={d.close}
                        onChange={(e) => setDay(day, { close: e.target.value })}
                        disabled={!d.active}
                        className="rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground disabled:opacity-40"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px]">Timezone</Label>
                <select
                  value={cfg.timezone}
                  onChange={(e) => set({ timezone: e.target.value })}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                >
                  {['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'America/New_York', 'Europe/London', 'UTC'].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[13px]">Outside hours message</Label>
                <Textarea
                  value={cfg.outside_hours_message}
                  onChange={(e) => set({ outside_hours_message: e.target.value })}
                  rows={3}
                  className="resize-none text-[13px]"
                />
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Tab 5 — Test Your Agent ───────────────────────────────────

interface ChatMsg { role: 'user' | 'assistant'; content: string; ts: string }

function TestTab() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ system_prompt?: string; provider?: string; model?: string; latency_ms?: number } | null>(null);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const now = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setError('');
    const newMsg: ChatMsg = { role: 'user', content: text, ts: now() };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/agent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI error');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: now() }]);
      setDebugInfo({
        system_prompt: data.system_prompt,
        provider: data.provider,
        model: data.model,
        latency_ms: data.latency_ms,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [input, loading, messages]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Chat simulator</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">Test your agent before going live. Uses the exact same settings.</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setDebugInfo(null); }}
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Clear chat
          </button>
        )}
      </div>

      {/* Chat window */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* WA-style header */}
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: '#075E54' }}>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white text-xs font-bold">A</div>
          <p className="text-[13px] font-medium text-white">AI Agent · Test Mode</p>
        </div>

        {/* Messages */}
        <div className="min-h-[320px] max-h-[400px] overflow-y-auto p-4 space-y-3" style={{ background: '#E5DDD5' }}>
          {messages.length === 0 && (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[12px] text-gray-500">Send a message to start testing your agent…</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
                m.role === 'user'
                  ? 'rounded-br-sm bg-[#DCF8C6]'
                  : 'rounded-bl-sm bg-white'
              }`}>
                <p className="text-[13px] text-gray-900 whitespace-pre-wrap">{m.content}</p>
                <p className="text-[10px] text-gray-400 text-right mt-0.5">{m.ts}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
                <div className="flex gap-1 items-center h-5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-[12px] text-red-600">
              ⚠ {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex gap-2 border-t border-border bg-card p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a test message…"
            className="flex-1 text-[13px]"
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || loading} className="h-9 w-9 p-0 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Debug panel */}
      {debugInfo && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="flex w-full items-center justify-between px-4 py-3 text-[12px] font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <span>🔍 Debug: View full prompt sent to AI ({debugInfo.provider} / {debugInfo.model} · {debugInfo.latency_ms}ms)</span>
            {showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDebug && (
            <div className="border-t border-border p-4">
              <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto leading-relaxed">
                {debugInfo.system_prompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 6 — Logs ─────────────────────────────────────────────

function LogsTab() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <p className="text-[14px] font-semibold text-foreground">Logs & Analytics</p>
      <p className="text-[13px] text-muted-foreground mt-1">
        Conversation logs will appear here once your agent is active and handling real messages.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function AIAgentPage() {
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('model');

  // Patch helper
  const set = useCallback((patch: Partial<AgentConfig>) => {
    setCfg(prev => ({ ...prev, ...patch }));
  }, []);

  // Load config on mount
  useEffect(() => {
    fetch('/api/ai/agent/config')
      .then(r => r.json())
      .then(({ agent }) => {
        if (agent) {
          setCfg({
            ...DEFAULT,
            ...agent,
            guardrails: Array.isArray(agent.guardrails) ? agent.guardrails : DEFAULT.guardrails,
            business_hours: agent.business_hours ?? {},
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/agent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      toast.success('Agent settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-foreground">AI Agent</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure your autonomous WhatsApp agent — define its brain, personality, and how it talks.
          </p>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          <div>
            <p className="text-[13px] font-semibold text-foreground leading-none">
              {cfg.is_active ? 'Agent is active' : 'Agent is inactive'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {cfg.is_active ? 'Responding to new messages' : 'Not responding automatically'}
            </p>
          </div>
          <button
            onClick={() => set({ is_active: !cfg.is_active })}
            className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              cfg.is_active ? 'bg-foreground' : 'bg-border'
            }`}
          >
            <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${
              cfg.is_active ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap rounded-xl border border-border bg-card">
          {[
            { value: 'model',       label: 'Model & Brain' },
            { value: 'context',     label: 'Business Context' },
            { value: 'personality', label: 'Personality & Tone' },
            { value: 'handoff',     label: 'Handoff & Hours' },
            { value: 'test',        label: '▶ Test Agent' },
            { value: 'logs',        label: 'Logs' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="text-[12px] text-muted-foreground data-active:bg-muted data-active:text-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="model"       className="mt-4"><ModelTab       cfg={cfg} set={set} /></TabsContent>
        <TabsContent value="context"     className="mt-4"><ContextTab     cfg={cfg} set={set} /></TabsContent>
        <TabsContent value="personality" className="mt-4"><PersonalityTab cfg={cfg} set={set} /></TabsContent>
        <TabsContent value="handoff"     className="mt-4"><HandoffTab     cfg={cfg} set={set} /></TabsContent>
        <TabsContent value="test"        className="mt-4"><TestTab /></TabsContent>
        <TabsContent value="logs"        className="mt-4"><LogsTab /></TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-card/95 backdrop-blur px-6 py-3 lg:left-[180px]">
        <p className="flex-1 text-[12px] text-muted-foreground hidden sm:block">
          Changes are not saved automatically.
        </p>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
