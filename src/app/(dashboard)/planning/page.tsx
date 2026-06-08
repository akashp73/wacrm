'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { Plan, PlanStep } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Loader2, Save, Pencil, Trash2, Map as MapIcon,
  ListChecks, CalendarDays,
} from 'lucide-react';

import '@excalidraw/excalidraw/index.css';

// Excalidraw touches `window` on import — must load client-side only.
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false },
);

const AUTOSAVE_DEBOUNCE_MS = 2_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasScene = { elements: any[]; appState: Record<string, unknown> } | null;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(value: string | null): string {
  if (!value) return 'No date set';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── New Plan modal ──────────────────────────────────────────

function NewPlanModal({
  open,
  onOpenChange,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; executionDate: string; description: string }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState('');
  const [executionDate, setExecutionDate] = useState('');
  const [description, setDescription] = useState('');

  // Reset the form whenever the modal closes — legitimate prop-driven
  // sync; the rule is over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setName('');
      setExecutionDate('');
      setDescription('');
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Plan</DialogTitle>
          <DialogDescription>
            Set up a plan — you&apos;ll get a blank whiteboard to map it out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label className="text-foreground/70">Plan Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q3 product launch"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-foreground/70">Execution Date</Label>
            <Input
              type="date"
              value={executionDate}
              onChange={(e) => setExecutionDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-foreground/70">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this plan about?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={() => onCreate({ name, executionDate, description })}
            disabled={!name.trim() || creating}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function PlanningPage() {
  const supabase = createClient();
  const { ownerId } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [stepName, setStepName] = useState('');
  const [stepDate, setStepDate] = useState('');

  const [saving, setSaving] = useState(false);

  const sceneRef = useRef<CanvasScene>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );

  // ── Fetch plans ──
  const fetchPlans = useCallback(async (userId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) toast.error('Failed to load plans');
    setPlans(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ownerId) fetchPlans(ownerId);
  }, [ownerId, fetchPlans]);

  // Sync local toolbar/steps state whenever the selected plan changes —
  // legitimate prop-driven sync; the rule is over-cautious here, hence
  // the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!selectedPlan) {
      sceneRef.current = null;
      return;
    }
    setNameDraft(selectedPlan.name);
    setEditingName(false);
    setSteps(selectedPlan.steps ?? []);
    sceneRef.current =
      selectedPlan.canvas_data && typeof selectedPlan.canvas_data === 'object'
        ? selectedPlan.canvas_data
        : null;
  }, [selectedPlan?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  function patchPlan(id: string, patch: Partial<Plan>) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  // ── Create plan ──
  async function handleCreatePlan({
    name,
    executionDate,
    description,
  }: {
    name: string;
    executionDate: string;
    description: string;
  }) {
    if (!ownerId || !name.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('plans')
      .insert({
        user_id: ownerId,
        name: name.trim(),
        description: description.trim() || null,
        execution_date: executionDate || null,
        canvas_data: {},
        steps: [],
      })
      .select('*')
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error('Failed to create plan');
      return;
    }
    setPlans((prev) => [data, ...prev]);
    setSelectedId(data.id);
    setShowNewModal(false);
    toast.success('Plan created');
  }

  // ── Canvas autosave ──
  const persistCanvas = useCallback(async (planId: string, scene: CanvasScene) => {
    if (!scene) return;
    const { error } = await supabase.from('plans').update({ canvas_data: scene }).eq('id', planId);
    if (error) {
      toast.error('Failed to autosave canvas');
      return;
    }
    patchPlan(planId, { canvas_data: scene, updated_at: new Date().toISOString() });
  }, [supabase]);

  const handleCanvasChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (elements: readonly any[], appState: any) => {
      if (!selectedPlan) return;
      sceneRef.current = {
        elements: [...elements],
        appState: { viewBackgroundColor: appState?.viewBackgroundColor },
      };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const planId = selectedPlan.id;
      saveTimerRef.current = setTimeout(() => {
        void persistCanvas(planId, sceneRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [selectedPlan, persistCanvas],
  );

  // ── Inline name edit ──
  function startEditingName() {
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 10);
  }

  async function commitName() {
    setEditingName(false);
    if (!selectedPlan) return;
    const name = nameDraft.trim();
    if (!name || name === selectedPlan.name) {
      setNameDraft(selectedPlan.name);
      return;
    }
    const { error } = await supabase.from('plans').update({ name }).eq('id', selectedPlan.id);
    if (error) {
      toast.error('Failed to rename plan');
      setNameDraft(selectedPlan.name);
      return;
    }
    patchPlan(selectedPlan.id, { name });
  }

  // ── Inline execution date edit ──
  async function commitDate(value: string) {
    if (!selectedPlan) return;
    const { error } = await supabase
      .from('plans')
      .update({ execution_date: value || null })
      .eq('id', selectedPlan.id);
    if (error) {
      toast.error('Failed to update execution date');
      return;
    }
    patchPlan(selectedPlan.id, { execution_date: value || null });
  }

  // ── Steps ──
  async function persistSteps(planId: string, next: PlanStep[]) {
    const { error } = await supabase.from('plans').update({ steps: next }).eq('id', planId);
    if (error) {
      toast.error('Failed to save step');
      return;
    }
    patchPlan(planId, { steps: next });
  }

  function addStep() {
    if (!selectedPlan || !stepName.trim() || !stepDate) return;
    const next = [...steps, { name: stepName.trim(), date: stepDate }];
    setSteps(next);
    setStepName('');
    setStepDate('');
    void persistSteps(selectedPlan.id, next);
  }

  function removeStep(index: number) {
    if (!selectedPlan) return;
    const next = steps.filter((_, i) => i !== index);
    setSteps(next);
    void persistSteps(selectedPlan.id, next);
  }

  // ── Manual save (everything) ──
  async function handleSave() {
    if (!selectedPlan) return;
    setSaving(true);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const name = nameDraft.trim() || selectedPlan.name;
    const update = {
      name,
      canvas_data: sceneRef.current ?? selectedPlan.canvas_data,
      steps,
    };
    const { error } = await supabase.from('plans').update(update).eq('id', selectedPlan.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to save plan');
      return;
    }
    patchPlan(selectedPlan.id, { ...update, updated_at: new Date().toISOString() });
    setEditingName(false);
    toast.success('Plan saved');
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] overflow-hidden sm:-m-6">
      {/* ── Left panel: plan list ── */}
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-3">
          <Button
            onClick={() => setShowNewModal(true)}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted mb-3">
                <MapIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-[13px] font-medium text-foreground">No plans yet</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Create your first plan to start mapping it out.
              </p>
            </div>
          ) : (
            <ul className="space-y-px p-2">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <button
                    onClick={() => setSelectedId(plan.id)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      selectedId === plan.id
                        ? 'bg-sidebar-active border-l-2 border-foreground'
                        : 'hover:bg-muted border-l-2 border-transparent',
                    )}
                  >
                    <p className="truncate text-[13px] font-medium text-foreground">{plan.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      {formatDate(plan.execution_date)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Edited {timeAgo(plan.updated_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Right panel: canvas + steps ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selectedPlan ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
              <MapIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-semibold text-foreground">Select or create a plan</p>
            <p className="mt-1 text-[13px] text-muted-foreground max-w-xs">
              Choose a plan from the list, or start a new one to open the whiteboard.
            </p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                {editingName ? (
                  <input
                    ref={nameInputRef}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') { setEditingName(false); setNameDraft(selectedPlan.name); }
                    }}
                    className="h-8 rounded-lg border border-border bg-card px-2.5 text-[14px] font-semibold text-foreground outline-none focus:border-foreground"
                    autoFocus
                  />
                ) : (
                  <span className="text-[15px] font-semibold text-foreground">{selectedPlan.name}</span>
                )}
                <button
                  onClick={startEditingName}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Rename plan"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedPlan.execution_date ?? ''}
                  onChange={(e) => commitDate(e.target.value)}
                  className="h-8 w-[150px] border-border bg-card text-[13px] text-foreground"
                />
              </div>

              <div className="flex-1" />

              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>

            {/* Canvas */}
            <div className="min-h-[360px] flex-1">
              <Excalidraw
                key={selectedPlan.id}
                initialData={() => ({
                  elements: sceneRef.current?.elements ?? [],
                  appState: sceneRef.current?.appState ?? {},
                })}
                onChange={handleCanvasChange}
              />
            </div>

            {/* Steps / Milestones */}
            <div className="max-h-[42%] shrink-0 overflow-y-auto border-t border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-[13px] font-semibold text-foreground">Steps</h2>
                <span className="text-[12px] text-muted-foreground">({steps.length})</span>
              </div>

              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="grid flex-1 gap-1.5">
                  <Label className="text-[11px] text-foreground/70">Step Name</Label>
                  <Input
                    value={stepName}
                    onChange={(e) => setStepName(e.target.value)}
                    placeholder="e.g. Finalize budget"
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[11px] text-foreground/70">Execution Date</Label>
                  <Input
                    type="date"
                    value={stepDate}
                    onChange={(e) => setStepDate(e.target.value)}
                    className="h-8 w-[150px] text-[13px]"
                  />
                </div>
                <Button
                  onClick={addStep}
                  disabled={!stepName.trim() || !stepDate}
                  size="sm"
                  variant="outline"
                  className="border-border text-foreground/70 hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </Button>
              </div>

              {steps.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No steps added yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {steps.map((step, i) => (
                    <li
                      key={`${step.name}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">{step.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(step.date)}</p>
                      </div>
                      <button
                        onClick={() => removeStep(i)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        aria-label={`Remove step ${step.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <NewPlanModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onCreate={handleCreatePlan}
        creating={creating}
      />
    </div>
  );
}
