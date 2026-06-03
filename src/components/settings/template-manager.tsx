'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, RefreshCw, Pencil } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { MessageTemplate } from '@/types';

const STATUS_STYLE: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected:  'bg-red-50 text-red-600 border-red-200',
  Pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  Draft:     'bg-muted text-muted-foreground border-border',
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.Draft;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${s}`}>
      {status ?? 'Draft'}
    </span>
  );
}

const CATEGORY_STYLE: Record<string, string> = {
  Marketing:      'bg-purple-50 text-purple-700 border-purple-200',
  Utility:        'bg-blue-50 text-blue-700 border-blue-200',
  Authentication: 'bg-amber-50 text-amber-700 border-amber-200',
};

function CategoryBadge({ category }: { category: string }) {
  const s = CATEGORY_STYLE[category] ?? '';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${s}`}>
      {category}
    </span>
  );
}

export function TemplateManager() {
  const supabase = createClient();
  const { user, ownerId, loading: authLoading } = useAuth();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) { setLoading(false); return; }
    if (ownerId) fetchTemplates(ownerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, ownerId]);

  async function fetchTemplates(userId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load templates');
    setTemplates(data ?? []);
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Sync failed');
      toast.success(`Synced ${data.total ?? 0} templates from Meta`);
      if (ownerId) await fetchTemplates(ownerId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('message_templates').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success('Deleted');
      setDeleteTarget(null);
    }
    setDeleting(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Message templates</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Reusable, Meta-approved formats for broadcasts and automated replies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync from Meta
          </Button>
          <Link
            href="/templates/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[13px] font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New template
          </Link>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted mb-3">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-[14px] font-semibold text-foreground">No templates yet</p>
          <p className="text-[13px] text-muted-foreground mt-1 mb-5 max-w-xs">
            Create a template to start sending broadcasts and automated messages.
          </p>
          <Link
            href="/templates/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New template
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><span className="font-medium text-foreground">{t.name}</span></TableCell>
                  <TableCell><CategoryBadge category={t.category} /></TableCell>
                  <TableCell className="text-muted-foreground">{t.language ?? 'en_US'}</TableCell>
                  <TableCell><StatusBadge status={t.status ?? 'Draft'} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/templates/${t.id}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>Delete <strong>{deleteTarget?.name}</strong>? Cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
