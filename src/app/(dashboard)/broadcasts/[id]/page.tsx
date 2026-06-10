'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { Broadcast, BroadcastRecipient, MessageTemplate, RecipientStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Loader2,
  Users,
  Send,
  CheckCheck,
  Eye,
  AlertCircle,
  MessageCircle,
  Filter,
  Download,
  ChevronDown,
  Trash2,
  Pause,
  FileText,
} from 'lucide-react';
import { getHeaderMediaSrc } from '@/lib/whatsapp/template-media';
import { toast } from 'sonner';
import {
  getBroadcastStatus,
  getRecipientStatus,
} from '@/lib/broadcast-status';

interface StatCardProps {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, total, icon, color }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

/**
 * Pure-CSS funnel chart: decreasing-width rounded bars.
 * Width is relative to the largest step (typically Sent) so we
 * always render a full bar at the top and proportional tails.
 */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Funnel</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const pctOfMax = Math.max(5, Math.round((step.value / max) * 100));
          const pctOfSent =
            steps[0].value > 0
              ? Math.round((step.value / steps[0].value) * 100)
              : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {step.label}
              </span>
              <div className="relative h-7 flex-1 rounded-full bg-muted">
                <div
                  className={`h-7 rounded-full ${step.color} transition-[width] duration-500`}
                  style={{ width: `${pctOfMax}%` }}
                />
                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-foreground">
                  {step.value.toLocaleString()}
                  <span className="ml-2 text-foreground/70/80">
                    ({pctOfSent}%)
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
];

/**
 * CSV export helper — RFC 4180 quoting. Quote every field so
 * commas/newlines/quotes round-trip cleanly.
 */
function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const broadcastId = params.id as string;

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [headerMediaError, setHeaderMediaError] = useState(false);

  const { sendBroadcast, isProcessing, progress } = useBroadcastSending();

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();

      const { data: bc, error: bcError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (bcError) throw bcError;
      setBroadcast(bc);

      const { data: recs, error: recsError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcastId)
        .order('created_at', { ascending: false });

      if (recsError) throw recsError;
      setRecipients(recs ?? []);

      const { data: tmpl } = await supabase
        .from('message_templates')
        .select('*')
        .eq('user_id', bc.user_id)
        .eq('name', bc.template_name)
        .maybeSingle();
      setTemplate(tmpl ?? null);
      setHeaderMediaError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load broadcast');
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRecipients = useMemo(
    () =>
      statusFilter === 'all'
        ? recipients
        : recipients.filter((r) => r.status === statusFilter),
    [recipients, statusFilter],
  );

  // Derive analytics directly from broadcast_recipients rows — the
  // sent/delivered/read timestamps and status/error_message columns are
  // the source of truth, so we count off them rather than the
  // aggregate columns on `broadcasts` (which can drift/lag behind).
  const stats = useMemo(() => {
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let replied = 0;
    let failed = 0;
    for (const r of recipients) {
      if (r.sent_at) sent++;
      if (r.delivered_at) delivered++;
      if (r.read_at) read++;
      if (r.status === 'replied') replied++;
      if (r.status === 'failed' || r.error_message) failed++;
    }
    return { sent, delivered, read, replied, failed };
  }, [recipients]);

  function handleExport() {
    if (!broadcast) return;
    const header = [
      'Contact',
      'Phone',
      'Status',
      'Sent At',
      'Delivered At',
      'Read At',
      'Replied At',
      'Error',
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.replied_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    const safeName = broadcast.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    downloadBlob(`broadcast-${safeName}-${broadcastId.slice(0, 8)}.csv`, csv);
  }

  // Stop a broadcast that's stuck in 'sending' (e.g. the tab that was
  // running the send loop was closed mid-broadcast). Marks it 'failed'
  // so it reads as stopped and unblocks the Delete button below.
  async function handleCancel() {
    setCancelling(true);
    const supabase = createClient();
    const { error: cancelErr } = await supabase
      .from('broadcasts')
      .update({ status: 'failed' })
      .eq('id', broadcastId);
    setCancelling(false);
    if (cancelErr) {
      toast.error(`Failed to stop: ${cancelErr.message}`);
      return;
    }
    setBroadcast((prev) => (prev ? { ...prev, status: 'failed' } : prev));
    toast.success('Broadcast stopped');
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    // broadcast_recipients cascades on broadcasts.id (migration 001), so a
    // single delete is sufficient — the aggregate trigger in migration 003
    // is defined on broadcast_recipients but fires only on its own row
    // changes, not on a cascaded drop of the parent row.
    const { error: delErr } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', broadcastId);
    setDeleting(false);
    if (delErr) {
      toast.error(`Failed to delete: ${delErr.message}`);
      return;
    }
    toast.success('Broadcast deleted');
    router.push('/broadcasts');
  }

  async function handleConfirmSend() {
    try {
      await sendBroadcast(broadcastId);
      setSendConfirmOpen(false);
      toast.success('Broadcast sent');
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send broadcast';
      toast.error(message);
      await fetchData();
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error ?? 'Broadcast not found'}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          Back to Broadcasts
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);

  const audienceFilter = (broadcast.audience_filter ?? {}) as {
    type?: string;
    tagIds?: string[];
  };
  const audienceLabel =
    audienceFilter.type === 'all'
      ? 'All Contacts'
      : audienceFilter.type === 'tags'
        ? `Tags (${audienceFilter.tagIds?.length ?? 0} selected)`
        : audienceFilter.type === 'csv'
          ? 'CSV Upload'
          : audienceFilter.type === 'custom_field'
            ? 'Custom Field'
            : 'Custom';

  const funnelSteps: FunnelStep[] = [
    { label: 'Sent', value: stats.sent, color: 'bg-foreground' },
    { label: 'Delivered', value: stats.delivered, color: 'bg-teal-500' },
    { label: 'Read', value: stats.read, color: 'bg-blue-500' },
    { label: 'Replied', value: stats.replied, color: 'bg-indigo-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{broadcast.name}</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {status.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <span>Template: {broadcast.template_name}</span>
              <span>-</span>
              <span>
                Created {new Date(broadcast.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Delete — inline-confirm pattern matches the pipeline-settings
            "Delete Pipeline" flow. Mid-send broadcasts can't be deleted
            because orphaning in-flight Meta messages would leave the
            funnel inconsistent. Use Stop first to mark a stuck broadcast
            as failed, which unblocks Delete. */}
        <div className="flex items-center gap-2">
          {(broadcast.status === 'sending' || broadcast.status === 'scheduled') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
              title="Stop this broadcast — marks it as failed and stops further sends"
              className="border-amber-500/30 bg-transparent text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
            >
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
              Stop
            </Button>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm">
              <span className="text-red-300">Delete this broadcast?</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="h-7 border-border bg-transparent text-foreground/70 hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="h-7 bg-red-600 text-foreground hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={broadcast.status === 'sending'}
              onClick={() => setConfirmDelete(true)}
              title={
                broadcast.status === 'sending'
                  ? 'Stop the broadcast first, then delete it'
                  : 'Delete this broadcast'
              }
              className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Draft review — shown until the broadcast is actually sent. Lets
          the user check the message, audience, and recipient count
          before committing, and either send or delete from here. */}
      {broadcast.status === 'draft' && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Ready to review</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This broadcast hasn&apos;t been sent yet. Check the details below, then send when ready.
              </p>
            </div>
            <Button
              onClick={() => setSendConfirmOpen(true)}
              disabled={isProcessing}
              className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Broadcast
            </Button>
          </div>

          {isProcessing && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-foreground transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Sending… {progress}%</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Message preview */}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Message preview</p>
              <div className="rounded-lg bg-[#0e1a12] p-3">
                <div className="ml-auto max-w-[90%] overflow-hidden rounded-lg bg-violet-700/30 shadow-sm">
                  {template?.header_type === 'image' && template.header_content && (
                    headerMediaError ? (
                      <div className="flex items-center gap-2 bg-violet-700/20 px-3 py-2 text-xs text-violet-100">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">Image header (preview unavailable)</span>
                      </div>
                    ) : (
                      <img
                        src={getHeaderMediaSrc(template.header_content) ?? undefined}
                        alt="Template header"
                        className="max-h-48 w-full object-cover"
                        onError={() => setHeaderMediaError(true)}
                      />
                    )
                  )}
                  {template?.header_type === 'video' && template.header_content && (
                    headerMediaError ? (
                      <div className="flex items-center gap-2 bg-violet-700/20 px-3 py-2 text-xs text-violet-100">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">Video header (preview unavailable)</span>
                      </div>
                    ) : (
                      <video
                        src={getHeaderMediaSrc(template.header_content) ?? undefined}
                        controls
                        className="max-h-48 w-full"
                        onError={() => setHeaderMediaError(true)}
                      />
                    )
                  )}
                  {template?.header_type === 'document' && template.header_content && (
                    <div className="flex items-center gap-2 bg-violet-700/20 px-3 py-2 text-xs text-violet-100">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">Document attachment</span>
                    </div>
                  )}
                  <div className="px-3 py-2">
                    {template?.header_type === 'text' && template.header_content && (
                      <p className="mb-1 text-sm font-semibold text-violet-50">{template.header_content}</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-violet-50">
                      {template?.body_text ?? `[template:${broadcast.template_name}]`}
                    </p>
                    {template?.footer_text && (
                      <p className="mt-1 text-xs text-violet-200/70">{template.footer_text}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Campaign details */}
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Audience</p>
                <p className="text-foreground">{audienceLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recipients</p>
                <p className="text-foreground">{broadcast.total_recipients.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Template</p>
                <p className="text-foreground">{broadcast.template_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Language</p>
                <p className="text-foreground">{broadcast.template_language}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Send this broadcast?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will send <span className="font-medium text-foreground">{broadcast.template_name}</span> to{' '}
              <span className="font-medium text-foreground">{broadcast.total_recipients.toLocaleString()}</span>{' '}
              recipient{broadcast.total_recipients !== 1 ? 's' : ''}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendConfirmOpen(false)}
              disabled={isProcessing}
              className="border-border text-foreground/70"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={isProcessing}
              className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Confirm & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats — 6 cards: Total / Sent / Delivered / Read / Replied / Failed */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Recipients"
          value={broadcast.total_recipients}
          total={broadcast.total_recipients}
          icon={<Users className="h-4 w-4" />}
          color="bg-muted text-foreground/70"
        />
        <StatCard
          label="Sent"
          value={stats.sent}
          total={broadcast.total_recipients}
          icon={<Send className="h-4 w-4" />}
          color="bg-foreground/10 text-foreground"
        />
        <StatCard
          label="Delivered"
          value={stats.delivered}
          total={broadcast.total_recipients}
          icon={<CheckCheck className="h-4 w-4" />}
          color="bg-teal-500/10 text-teal-400"
        />
        <StatCard
          label="Read"
          value={stats.read}
          total={broadcast.total_recipients}
          icon={<Eye className="h-4 w-4" />}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="Replied"
          value={stats.replied}
          total={broadcast.total_recipients}
          icon={<MessageCircle className="h-4 w-4" />}
          color="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          total={broadcast.total_recipients}
          icon={<AlertCircle className="h-4 w-4" />}
          color="bg-red-500/10 text-red-400"
        />
      </div>

      <FunnelChart steps={funnelSteps} />

      {/* Recipients Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">
            Recipients ({filteredRecipients.length}
            {statusFilter !== 'all' ? ` of ${recipients.length}` : ''})
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground/70 hover:bg-muted"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all'
                  ? 'All statuses'
                  : getRecipientStatus(statusFilter).label}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-card">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={
                    statusFilter === 'all' ? 'text-foreground' : 'text-foreground/70'
                  }
                >
                  All statuses
                </DropdownMenuItem>
                {RECIPIENT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? 'text-foreground'
                        : 'text-foreground/70'
                    }
                  >
                    {getRecipientStatus(s).label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={recipients.length === 0}
              className="border-border text-foreground/70 hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {recipients.length === 0
                ? 'No recipients found.'
                : 'No recipients match this filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Contact</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Sent</TableHead>
                  <TableHead className="text-muted-foreground">Delivered</TableHead>
                  <TableHead className="text-muted-foreground">Read</TableHead>
                  <TableHead className="text-muted-foreground">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((recipient) => {
                  const rStatus = getRecipientStatus(recipient.status);
                  return (
                    <TableRow key={recipient.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {recipient.contact?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-foreground/70">
                        {recipient.contact?.phone ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                        >
                          {rStatus.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.delivered_at
                          ? new Date(recipient.delivered_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.read_at
                          ? new Date(recipient.read_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-red-400">
                        {recipient.error_message ?? '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
