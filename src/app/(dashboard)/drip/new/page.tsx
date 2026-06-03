'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, GripVertical, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface DripStep {
  id: string;
  step_order: number;
  message_type: 'text' | 'template';
  content: string;
  template_name: string;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
}

function makeStep(order: number): DripStep {
  return {
    id: crypto.randomUUID(),
    step_order: order,
    message_type: 'text',
    content: '',
    template_name: '',
    delay_value: 1,
    delay_unit: 'days',
  };
}

export default function NewDripPage() {
  const router = useRouter();
  const supabase = createClient();
  const { ownerId } = useAuth();

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<'new_contact' | 'tag_added' | 'manual'>('manual');
  const [tagId, setTagId] = useState('');
  const [steps, setSteps] = useState<DripStep[]>([makeStep(1)]);
  const [saving, setSaving] = useState(false);

  function addStep() {
    setSteps((prev) => [...prev, makeStep(prev.length + 1)]);
  }

  function removeStep(id: string) {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  }

  function updateStep(id: string, patch: Partial<DripStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Campaign name is required'); return; }
    if (steps.length === 0) { toast.error('Add at least one step'); return; }
    for (const s of steps) {
      if (s.message_type === 'text' && !s.content.trim()) {
        toast.error(`Step ${s.step_order}: message text is required`); return;
      }
      if (s.message_type === 'template' && !s.template_name.trim()) {
        toast.error(`Step ${s.step_order}: template name is required`); return;
      }
    }
    if (!ownerId) return;

    setSaving(true);
    try {
      const triggerConfig = triggerType === 'tag_added' ? { tag_id: tagId } : {};
      const { data: campaign, error: campErr } = await supabase
        .from('drip_campaigns')
        .insert({ user_id: ownerId, name: name.trim(), trigger_type: triggerType, trigger_config: triggerConfig })
        .select('id')
        .single();

      if (campErr || !campaign) throw campErr;

      const stepsPayload = steps.map((s) => ({
        drip_campaign_id: campaign.id,
        step_order: s.step_order,
        message_type: s.message_type,
        content: s.message_type === 'text' ? s.content.trim() : null,
        template_name: s.message_type === 'template' ? s.template_name.trim() : null,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
      }));

      const { error: stepsErr } = await supabase.from('drip_steps').insert(stepsPayload);
      if (stepsErr) throw stepsErr;

      toast.success('Campaign created');
      router.push(`/drip/${campaign.id}`);
    } catch {
      toast.error('Failed to create campaign');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/drip" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground hover:text-foreground hover:bg-muted -ml-2')}>
          <ChevronLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Drip Campaign</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Define a sequence of messages sent automatically over time.</p>
        </div>
      </div>

      {/* Campaign Name */}
      <Card className="bg-card border-border ring-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-foreground">Campaign details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground/70">Campaign name</Label>
            <Input
              placeholder="e.g. New Customer Onboarding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground/70">Enrollment trigger</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as typeof triggerType)}>
              <SelectTrigger className="bg-muted border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-muted border-border">
                <SelectItem value="manual" className="text-foreground focus:bg-accent focus:text-foreground">
                  Manual — enroll contacts individually
                </SelectItem>
                <SelectItem value="new_contact" className="text-foreground focus:bg-accent focus:text-foreground">
                  New contact created
                </SelectItem>
                <SelectItem value="tag_added" className="text-foreground focus:bg-accent focus:text-foreground">
                  Tag added to contact
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {triggerType === 'tag_added' && (
            <div className="space-y-2">
              <Label className="text-foreground/70">Tag ID</Label>
              <Input
                placeholder="Tag UUID from your tags list"
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">The campaign starts when this tag is applied to a contact.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Sequence steps</h2>
          <p className="text-xs text-muted-foreground">Steps run in order. Each delay is from the previous step.</p>
        </div>

        {steps.map((step, idx) => (
          <Card key={step.id} className="bg-card border-border ring-0">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground/70">Step {step.step_order}</span>
                </div>
                {steps.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStep(step.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>

              {/* Delay (for step > 1 or step 1 as "wait before sending") */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">
                  {idx === 0 ? 'Send after enrollment +' : 'Wait'}
                </span>
                <Input
                  type="number"
                  min={0}
                  value={step.delay_value}
                  onChange={(e) => updateStep(step.id, { delay_value: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-20 bg-muted border-border text-foreground text-sm"
                />
                <Select
                  value={step.delay_unit}
                  onValueChange={(v) => updateStep(step.id, { delay_unit: v as DripStep['delay_unit'] })}
                >
                  <SelectTrigger className="w-28 bg-muted border-border text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    {(['minutes', 'hours', 'days'] as const).map((u) => (
                      <SelectItem key={u} value={u} className="text-foreground focus:bg-accent focus:text-foreground capitalize">{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Message type */}
              <div className="flex gap-2">
                {(['text', 'template'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateStep(step.id, { message_type: t })}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                      step.message_type === t
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {t === 'text' ? 'Text message' : 'Template'}
                  </button>
                ))}
              </div>

              {step.message_type === 'text' ? (
                <textarea
                  rows={3}
                  placeholder="Type your message… Use {{name}}, {{phone}} for personalization"
                  value={step.content}
                  onChange={(e) => updateStep(step.id, { content: e.target.value })}
                  className="w-full rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <Input
                  placeholder="Template name (e.g. welcome_message)"
                  value={step.template_name}
                  onChange={(e) => updateStep(step.id, { template_name: e.target.value })}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              )}
            </CardContent>
          </Card>
        ))}

        <button
          onClick={addStep}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
        >
          <Plus className="size-4" />
          Add step
        </button>
      </div>

      {/* Preview timeline */}
      <Card className="bg-card border-border ring-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-foreground/70">Sequence preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-3">
            {steps.map((s, i) => {
              const unitMap = { minutes: 'min', hours: 'hr', days: 'day' };
              return (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/20 text-xs font-bold text-foreground">
                      {s.step_order}
                    </div>
                    {i < steps.length - 1 && <div className="mt-1 h-6 w-px bg-muted" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="text-xs text-muted-foreground mb-0.5">
                      +{s.delay_value} {unitMap[s.delay_unit]}{s.delay_value !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-foreground/70 truncate">
                      {s.message_type === 'text'
                        ? (s.content || <span className="italic text-muted-foreground">Empty message</span>)
                        : `Template: ${s.template_name || '(unnamed)'}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/drip" className={cn(buttonVariants({ variant: 'outline' }), 'border-border text-foreground/70 hover:bg-muted')}>
          Cancel
        </Link>
        <Button onClick={handleSave} disabled={saving} className="bg-foreground hover:bg-foreground/90 text-background">
          {saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : 'Save campaign'}
        </Button>
      </div>
    </div>
  );
}
