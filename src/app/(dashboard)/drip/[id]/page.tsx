'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  ChevronLeft, Loader2, Users, ToggleLeft, ToggleRight, UserMinus, Clock,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface DripCampaign {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  created_at: string;
}

interface DripStep {
  id: string;
  step_order: number;
  message_type: 'text' | 'template';
  content: string | null;
  template_name: string | null;
  delay_value: number;
  delay_unit: string;
}

interface Enrollment {
  id: string;
  contact_id: string;
  current_step: number;
  status: 'active' | 'completed' | 'stopped';
  enrolled_at: string;
  next_send_at: string;
  contact: { name: string | null; phone: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  stopped: 'bg-muted text-muted-foreground border-border',
};

export default function DripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { ownerId } = useAuth();

  const [campaign, setCampaign] = useState<DripCampaign | null>(null);
  const [steps, setSteps] = useState<DripStep[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [unenrollTarget, setUnenrollTarget] = useState<Enrollment | null>(null);
  const [unenrolling, setUnenrolling] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [campRes, stepsRes, enrollRes] = await Promise.all([
      supabase.from('drip_campaigns').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle(),
      supabase.from('drip_steps').select('*').eq('drip_campaign_id', id).order('step_order'),
      supabase.from('drip_enrollments')
        .select('*, contact:contacts(name, phone)')
        .eq('drip_campaign_id', id)
        .order('enrolled_at', { ascending: false })
        .limit(100),
    ]);

    if (campRes.error || !campRes.data) {
      toast.error('Campaign not found');
      router.push('/drip');
      return;
    }

    setCampaign(campRes.data);
    setSteps(stepsRes.data ?? []);
    setEnrollments((enrollRes.data ?? []) as Enrollment[]);
    setLoading(false);
  }, [id, ownerId, supabase, router]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive() {
    if (!campaign) return;
    const { error } = await supabase
      .from('drip_campaigns')
      .update({ is_active: !campaign.is_active })
      .eq('id', campaign.id);
    if (error) { toast.error('Failed to update'); return; }
    setCampaign((c) => c ? { ...c, is_active: !c.is_active } : c);
  }

  async function handleUnenroll() {
    if (!unenrollTarget) return;
    setUnenrolling(true);
    const { error } = await supabase
      .from('drip_enrollments')
      .update({ status: 'stopped' })
      .eq('id', unenrollTarget.id);
    if (error) {
      toast.error('Failed to unenroll');
    } else {
      setEnrollments((prev) =>
        prev.map((e) => (e.id === unenrollTarget.id ? { ...e, status: 'stopped' } : e)),
      );
      toast.success('Contact unenrolled');
      setUnenrollTarget(null);
    }
    setUnenrolling(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-foreground" />
      </div>
    );
  }

  if (!campaign) return null;

  const activeCount = enrollments.filter((e) => e.status === 'active').length;
  const completedCount = enrollments.filter((e) => e.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/drip" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mt-0.5 text-muted-foreground hover:text-foreground hover:bg-muted -ml-2')}>
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Trigger: {campaign.trigger_type.replace(/_/g, ' ')} ·{' '}
              {steps.length} step{steps.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <button
          onClick={toggleActive}
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          style={campaign.is_active
            ? { borderColor: 'rgb(52 211 153 / 0.3)', color: 'rgb(52 211 153)' }
            : { borderColor: 'rgb(100 116 139 / 0.3)', color: 'rgb(100 116 139)' }}
        >
          {campaign.is_active
            ? <><ToggleRight className="size-4" />Active</>
            : <><ToggleLeft className="size-4" />Inactive</>}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active', value: activeCount, color: 'text-emerald-400' },
          { label: 'Completed', value: completedCount, color: 'text-blue-400' },
          { label: 'Total steps', value: steps.length, color: 'text-foreground' },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border ring-0">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Steps */}
      <Card className="bg-card border-border ring-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground/70">Sequence Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/20 text-xs font-bold text-foreground">
                    {step.step_order}
                  </div>
                  {i < steps.length - 1 && <div className="mt-1 h-6 w-px bg-muted" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Clock className="size-3" />
                    {i === 0 ? 'Immediately after enrollment' : `+${step.delay_value} ${step.delay_unit}`}
                  </p>
                  <p className="text-sm text-foreground/70">
                    {step.message_type === 'text'
                      ? (step.content || <em className="text-muted-foreground">Empty message</em>)
                      : <span>Template: <span className="text-foreground">{step.template_name}</span></span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Enrollments */}
      <Card className="bg-card border-border ring-0">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-foreground/70">
              Enrolled Contacts ({enrollments.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {enrollments.length === 0 ? (
            <div className="py-10 text-center">
              <Users className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No contacts enrolled yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Contact', 'Status', 'Step', 'Next send', 'Enrolled'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase dark:text-muted-foreground tracking-wide">{h}</th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => (
                    <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {e.contact?.name || e.contact?.phone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[e.status] ?? ''}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.current_step} / {steps.length}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {e.status === 'active'
                          ? formatDistanceToNow(new Date(e.next_send_at), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {format(new Date(e.enrolled_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUnenrollTarget(e)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            aria-label="Unenroll"
                          >
                            <UserMinus className="size-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unenroll dialog */}
      <Dialog open={!!unenrollTarget} onOpenChange={(open) => { if (!open) setUnenrollTarget(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Unenroll Contact</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Stop sending this sequence to <strong className="text-foreground">
                {unenrollTarget?.contact?.name || unenrollTarget?.contact?.phone}
              </strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnenrollTarget(null)} className="border-border text-foreground/70 hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleUnenroll} disabled={unenrolling} className="bg-red-600 hover:bg-red-700 text-foreground">
              {unenrolling ? <Loader2 className="size-4 animate-spin" /> : 'Unenroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
