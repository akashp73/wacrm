'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, X, ExternalLink, Phone, Copy,
  MessageSquare, CheckCheck, Image as ImageIcon, MapPin,
  FileText, Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { MessageTemplate } from '@/types';

// Accept filters + size limits per header media type — mirrors the
// `template-media` storage bucket config in migration 016.
const HEADER_MEDIA_ACCEPT: Record<string, string> = {
  image: 'image/png,image/jpeg,image/webp',
  video: 'video/mp4,video/3gpp',
  document: 'application/pdf',
};
const HEADER_MEDIA_MAX_BYTES = 16 * 1024 * 1024; // 16 MB

// ─── Types ───────────────────────────────────────────────────

type HeaderType = 'none' | 'text' | 'image' | 'video' | 'document' | 'location';
type ButtonType = 'quick_reply' | 'url' | 'phone_number' | 'copy_code';

interface TemplateButton {
  id: string;
  type: ButtonType;
  text?: string;
  url?: string;
  urlType?: 'static' | 'dynamic';
  phone_number?: string;
  copy_code?: string;
}

interface TemplateFormState {
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language: string;
  headerType: HeaderType;
  headerText: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  sampleValues: Record<number, string>;
}

const LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi_IN', label: 'Hindi' },
  { code: 'gu_IN', label: 'Gujarati' },
  { code: 'mr_IN', label: 'Marathi' },
  { code: 'ar',    label: 'Arabic' },
  { code: 'es',    label: 'Spanish' },
  { code: 'pt_BR', label: 'Portuguese (BR)' },
  { code: 'id',    label: 'Indonesian' },
];

const HEADER_OPTIONS: { value: HeaderType; label: string }[] = [
  { value: 'none',     label: 'None' },
  { value: 'text',     label: 'Text' },
  { value: 'image',    label: 'Image' },
  { value: 'video',    label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'location', label: 'Location' },
];

// Extract {{n}} variables from body text
function extractVariables(text: string): number[] {
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  const indices = new Set<number>();
  for (const m of matches) indices.add(Number(m[1]));
  return Array.from(indices).sort((a, b) => a - b);
}

// ─── WhatsApp Preview ─────────────────────────────────────────

function WhatsAppPreview({ form }: { form: TemplateFormState }) {
  const { headerType, headerText, body, footer, buttons } = form;

  const BUTTON_ICON: Record<ButtonType, React.ElementType> = {
    quick_reply:   MessageSquare,
    url:           ExternalLink,
    phone_number:  Phone,
    copy_code:     Copy,
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border flex flex-col" style={{ minHeight: 420 }}>
      {/* WA header bar */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: '#075E54' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white text-xs font-bold">
          W
        </div>
        <div>
          <p className="text-[12px] font-semibold text-white leading-none">WhatsApp Business</p>
          <p className="text-[10px] text-white/70 mt-0.5">template preview</p>
        </div>
      </div>

      {/* Chat background */}
      <div className="flex-1 p-3 overflow-y-auto" style={{ background: '#E5DDD5' }}>
        {/* Bubble */}
        <div className="max-w-[90%] flex flex-col gap-1">
          <div className="rounded-[0_10px_10px_10px] bg-white overflow-hidden shadow-sm">
            {/* Header */}
            {headerType === 'text' && headerText && (
              <div className="px-3 pt-2.5 pb-1">
                <p className="text-[13px] font-bold text-gray-900 leading-snug">{headerText}</p>
              </div>
            )}
            {headerType === 'image' && (
              <div className="flex h-28 items-center justify-center bg-gray-100">
                <ImageIcon className="h-8 w-8 text-gray-400" />
              </div>
            )}
            {headerType === 'video' && (
              <div className="flex h-28 items-center justify-center bg-gray-800">
                <Video className="h-8 w-8 text-gray-400" />
              </div>
            )}
            {headerType === 'document' && (
              <div className="flex h-16 items-center gap-2 bg-gray-50 px-3">
                <FileText className="h-6 w-6 text-gray-500" />
                <span className="text-[11px] text-gray-600">document.pdf</span>
              </div>
            )}
            {headerType === 'location' && (
              <div className="flex h-20 items-center justify-center bg-blue-50">
                <MapPin className="h-7 w-7 text-blue-500" />
              </div>
            )}

            {/* Body */}
            <div className={`px-3 ${headerType !== 'none' ? 'pt-1.5' : 'pt-2.5'} pb-1`}>
              <p className="text-[13px] text-gray-900 whitespace-pre-wrap break-words leading-relaxed">
                {body || <span className="text-gray-400 italic">Your message body…</span>}
              </p>
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-3 pb-1.5">
                <p className="text-[11px] text-gray-500">{footer}</p>
              </div>
            )}

            {/* Timestamp */}
            <div className="flex justify-end px-3 pb-2">
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                2:34 PM
                <CheckCheck className="h-3 w-3 text-blue-400" />
              </span>
            </div>
          </div>

          {/* Buttons */}
          {buttons.length > 0 && (
            <div className="bg-white rounded-[10px] overflow-hidden shadow-sm divide-y divide-gray-100">
              {buttons.map((btn, i) => {
                const Icon = BUTTON_ICON[btn.type];
                const label = btn.type === 'copy_code'
                  ? 'Copy code'
                  : btn.text || `Button ${i + 1}`;
                return (
                  <div
                    key={btn.id}
                    className="flex items-center justify-center gap-1.5 px-3 py-2"
                    style={{ color: '#128C7E' }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-[12px] font-medium">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

// ─── TemplateBuilder ─────────────────────────────────────────

interface TemplateBuilderProps {
  initialTemplate?: MessageTemplate;
  backHref?: string;
}

const EMPTY: TemplateFormState = {
  name: '', category: 'Marketing', language: 'en_US',
  headerType: 'none', headerText: '', body: '', footer: '',
  buttons: [], sampleValues: {},
};

export function TemplateBuilder({ initialTemplate, backHref = '/templates' }: TemplateBuilderProps) {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [headerSampleFile, setHeaderSampleFile] = useState<File | null>(null);

  const [form, setForm] = useState<TemplateFormState>(() => {
    if (!initialTemplate) return EMPTY;
    const btns: TemplateButton[] = ((initialTemplate.buttons ?? []) as Record<string, string>[]).map((b, i) => ({
      id: String(i),
      type: (b.type as ButtonType) ?? 'quick_reply',
      text: b.text,
      url: b.url,
      urlType: b.url_type === 'dynamic' ? 'dynamic' : 'static',
      phone_number: b.phone_number,
      copy_code: b.copy_code,
    }));
    return {
      name: initialTemplate.name,
      category: initialTemplate.category,
      language: initialTemplate.language ?? 'en_US',
      headerType: (initialTemplate.header_type as HeaderType) ?? 'none',
      headerText: initialTemplate.header_type === 'text' ? (initialTemplate.header_content ?? '') : '',
      body: initialTemplate.body_text,
      footer: initialTemplate.footer_text ?? '',
      buttons: btns,
      sampleValues: {},
    };
  });

  const set = useCallback(<K extends keyof TemplateFormState>(key: K, val: TemplateFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Insert {{n}} variable at cursor
  const insertVariable = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const existing = extractVariables(form.body);
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    const varText = `{{${next}}}`;
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? start;
    const newBody = form.body.slice(0, start) + varText + form.body.slice(end);
    set('body', newBody);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + varText.length, start + varText.length);
    }, 0);
  }, [form.body, set]);

  // Buttons management
  const addButton = (type: ButtonType) => {
    if (form.buttons.length >= 3) { toast.error('Max 3 buttons'); return; }
    setForm((prev) => ({
      ...prev,
      buttons: [...prev.buttons, { id: crypto.randomUUID(), type, urlType: 'static' }],
    }));
  };

  const updateButton = (id: string, patch: Partial<TemplateButton>) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.map((b) => b.id === id ? { ...b, ...patch } : b),
    }));
  };

  const removeButton = (id: string) => {
    setForm((prev) => ({ ...prev, buttons: prev.buttons.filter((b) => b.id !== id) }));
  };

  // Sample media for header (image/video/document)
  const onPickHeaderSample = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > HEADER_MEDIA_MAX_BYTES) {
      toast.error('File is too large — max 16 MB');
      return;
    }
    setHeaderSampleFile(file);
  };

  const removeHeaderSample = () => setHeaderSampleFile(null);

  // Uploads the staged sample file to the `template-media` bucket and
  // returns its public URL, or null if nothing is staged.
  const uploadHeaderSample = useCallback(async (): Promise<string | null> => {
    if (!headerSampleFile || !user) return null;
    const ext = headerSampleFile.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${user.id}/${Date.now()}-sample.${ext}`;
    const { error } = await supabase.storage
      .from('template-media')
      .upload(path, headerSampleFile, {
        cacheControl: '3600',
        upsert: true,
        contentType: headerSampleFile.type,
      });
    if (error) throw new Error(`Sample upload failed: ${error.message}`);
    const { data: { publicUrl } } = supabase.storage.from('template-media').getPublicUrl(path);
    return publicUrl;
  }, [headerSampleFile, user, supabase]);

  // Submit
  const handleSubmit = async () => {
    if (!form.name.trim())   { toast.error('Template name is required'); return; }
    if (!form.body.trim())   { toast.error('Body text is required'); return; }
    if (!/^[a-z0-9_]+$/.test(form.name)) {
      toast.error('Name must be lowercase letters, numbers and underscores only');
      return;
    }
    setSaving(true);
    try {
      let headerMediaUrl: string | undefined;
      if (['image', 'video', 'document'].includes(form.headerType) && headerSampleFile) {
        headerMediaUrl = (await uploadHeaderSample()) ?? undefined;
      }

      const payload = {
        id: initialTemplate?.id,
        name: form.name.trim(),
        category: form.category,
        language: form.language,
        header_type: form.headerType,
        header_text: form.headerType === 'text' ? form.headerText : undefined,
        header_media_url: headerMediaUrl,
        body_text: form.body.trim(),
        footer_text: form.footer.trim() || undefined,
        buttons: form.buttons.map(({ id: _id, ...rest }) => rest),
        sample_values: Object.values(form.sampleValues).filter(Boolean),
      };
      const res = await fetch('/api/whatsapp/templates/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Submission failed');
        return;
      }
      toast.success('Template submitted to Meta for review');
      router.push(backHref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const variables = extractVariables(form.body);

  const BUTTON_TYPE_OPTIONS: { type: ButtonType; label: string }[] = [
    { type: 'quick_reply',  label: 'Quick reply' },
    { type: 'url',          label: 'URL' },
    { type: 'phone_number', label: 'Phone' },
    { type: 'copy_code',    label: 'Copy code' },
  ];

  return (
    <div className="flex h-full gap-6">
      {/* ── Left column — form ─────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto pb-24">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.push(backHref)}
              className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to list
            </button>
            <h1 className="text-[26px] font-semibold text-foreground leading-tight">
              {initialTemplate ? 'Edit template' : 'New template'}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Build top-to-bottom — header, body, footer, then buttons. Preview updates as you type.
            </p>
          </div>
        </div>

        {/* ── Section 1: Identity ── */}
        <section className="mb-8">
          <SectionLabel>Identity</SectionLabel>
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Template name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g. order_confirmation"
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers, underscores only. Unique per language.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Category <span className="text-destructive">*</span></Label>
                <Select value={form.category} onValueChange={(v) => set('category', v as typeof form.category)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['Marketing', 'Utility', 'Authentication'] as const).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Language <span className="text-destructive">*</span></Label>
                <Select value={form.language} onValueChange={(v) => v && set('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 2: Header ── */}
        <section className="mb-8">
          <SectionLabel>Header (optional)</SectionLabel>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            {/* Type pills */}
            <div className="flex flex-wrap gap-2">
              {HEADER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => set('headerType', opt.value)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors border ${
                    form.headerType === opt.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.headerType === 'text' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[13px]">Header text</Label>
                  <span className="text-[11px] text-muted-foreground">{form.headerText.length}/60</span>
                </div>
                <Input
                  value={form.headerText}
                  onChange={(e) => set('headerText', e.target.value.slice(0, 60))}
                  placeholder="Your header text, {{1}} variable supported"
                />
              </div>
            )}

            {['image', 'video', 'document'].includes(form.headerType) && (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/40 py-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={HEADER_MEDIA_ACCEPT[form.headerType]}
                  onChange={onPickHeaderSample}
                  className="hidden"
                />
                {headerSampleFile ? (
                  <>
                    <CheckCheck className="h-8 w-8 text-emerald-500 mb-2" />
                    <p className="text-[13px] text-foreground font-medium truncate max-w-xs">{headerSampleFile.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {(headerSampleFile.size / 1024 / 1024).toFixed(2)} MB — ready to upload on submit
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        Replace file
                      </button>
                      <button
                        type="button"
                        onClick={removeHeaderSample}
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-destructive hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-[13px] text-muted-foreground font-medium">Upload sample media for Meta review</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {form.headerType === 'image' && 'PNG, JPEG or WebP — used for template approval'}
                      {form.headerType === 'video' && 'MP4 or 3GP — used for template approval'}
                      {form.headerType === 'document' && 'PDF — used for template approval'}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Choose file
                    </button>
                  </>
                )}
              </div>
            )}

            {form.headerType === 'location' && (
              <div className="grid grid-cols-2 gap-3">
                {[['Latitude', 'lat'], ['Longitude', 'lng'], ['Name', 'name'], ['Address', 'address']].map(([label, _key]) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-[12px]">{label}</Label>
                    <Input placeholder={label.toLowerCase()} className="h-8 text-[12px]" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Section 3: Body ── */}
        <section className="mb-8">
          <SectionLabel>Body <span className="normal-case font-normal">(required)</span></SectionLabel>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[13px]">Message body</Label>
              <button
                onClick={insertVariable}
                className="rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                + Insert next variable
              </button>
            </div>
            <div className="relative">
              <Textarea
                ref={bodyRef}
                value={form.body}
                onChange={(e) => set('body', e.target.value.slice(0, 1024))}
                placeholder="Hello {{1}}, your order {{2}} has been confirmed."
                className="min-h-[96px] resize-none text-[13px]"
              />
              <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
                {form.body.length}/1024
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Use sequential {'{{1}}'}, {'{{2}}'}… Meta requires sample values for each at submit time.
            </p>

            {/* Sample values */}
            {variables.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Sample values
                </p>
                {variables.map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                      Value for {`{{${n}}}`}
                    </span>
                    <Input
                      value={form.sampleValues[n] ?? ''}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        sampleValues: { ...prev.sampleValues, [n]: e.target.value },
                      }))}
                      placeholder={`e.g. ${n === 1 ? 'John' : 'ORD-123'}`}
                      className="h-7 text-[12px] flex-1"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Section 4: Footer ── */}
        <section className="mb-8">
          <SectionLabel>Footer (optional)</SectionLabel>
          <div className="rounded-xl border border-border bg-card p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[13px]">Footer text</Label>
              <span className="text-[11px] text-muted-foreground">{form.footer.length}/60</span>
            </div>
            <Input
              value={form.footer}
              onChange={(e) => set('footer', e.target.value.slice(0, 60))}
              placeholder="Reply STOP to opt out"
            />
          </div>
        </section>

        {/* ── Section 5: Buttons ── */}
        <section className="mb-8">
          <SectionLabel>Buttons (optional, max 3)</SectionLabel>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            {/* Add buttons row */}
            <div className="flex flex-wrap gap-2">
              {BUTTON_TYPE_OPTIONS.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => addButton(type)}
                  disabled={form.buttons.length >= 3}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Plus className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Button cards */}
            {form.buttons.length > 0 && (
              <div className="space-y-2">
                {form.buttons.map((btn) => (
                  <div key={btn.id} className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
                        {btn.type.replace('_', ' ')}
                      </span>
                      <button onClick={() => removeButton(btn.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {btn.type !== 'copy_code' && (
                      <Input
                        value={btn.text ?? ''}
                        onChange={(e) => updateButton(btn.id, { text: e.target.value })}
                        placeholder="Button label"
                        className="h-8 text-[12px]"
                      />
                    )}

                    {btn.type === 'url' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {(['static', 'dynamic'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => updateButton(btn.id, { urlType: t })}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                btn.urlType === t
                                  ? 'bg-foreground text-background border-foreground'
                                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
                              }`}
                            >
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={btn.url ?? ''}
                          onChange={(e) => updateButton(btn.id, { url: e.target.value })}
                          placeholder="https://example.com"
                          className="h-8 text-[12px]"
                        />
                      </div>
                    )}

                    {btn.type === 'phone_number' && (
                      <Input
                        value={btn.phone_number ?? ''}
                        onChange={(e) => updateButton(btn.id, { phone_number: e.target.value })}
                        placeholder="+91 98765 43210"
                        className="h-8 text-[12px]"
                      />
                    )}

                    {btn.type === 'copy_code' && (
                      <Input
                        value={btn.copy_code ?? ''}
                        onChange={(e) => updateButton(btn.id, { copy_code: e.target.value })}
                        placeholder="PROMO2024"
                        className="h-8 text-[12px]"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {form.buttons.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Group quick replies together. Max 2 URL buttons allowed.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ── Right column — preview ─────────────────────────── */}
      <div className="w-[280px] shrink-0 hidden lg:block">
        <div className="sticky top-0 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Live preview
          </p>
          <WhatsAppPreview form={form} />
          <p className="text-[11px] text-muted-foreground text-center">
            Approximate WhatsApp layout
          </p>
        </div>
      </div>

      {/* ── Sticky submit bar ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-end gap-3 border-t border-border bg-card/95 backdrop-blur px-6 py-3 lg:left-[180px]">
        <button
          onClick={() => router.push(backHref)}
          className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
          {saving ? 'Submitting…' : 'Submit to Meta →'}
        </Button>
      </div>
    </div>
  );
}
