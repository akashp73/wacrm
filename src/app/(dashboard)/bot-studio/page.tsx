'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Cpu, ToggleLeft, ToggleRight, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface BotSummary {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  trigger: 'message_received' | 'webhook';
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  message_received: 'Message Received',
  webhook: 'Webhook',
};

export default function BotStudioPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BotSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/bot-studio')
      .then(r => r.json())
      .then(({ bots }) => setBots(bots ?? []))
      .catch(() => toast.error('Failed to load bots'))
      .finally(() => setLoading(false));
  }, []);

  const toggleStatus = async (bot: BotSummary) => {
    const next = bot.status === 'active' ? 'inactive' : 'active';
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, status: next } : b));
    await fetch(`/api/bot-studio/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  };

  const deleteBot = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/bot-studio/${deleteTarget.id}`, { method: 'DELETE' });
    setBots(prev => prev.filter(b => b.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
    toast.success('Bot deleted');
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    const res = await fetch('/api/bot-studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.bot) {
      setCreateOpen(false);
      setName('');
      router.push(`/bot-studio/${data.bot.id}`);
    } else {
      toast.error('Failed to create bot');
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Bot Studio</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">Build automated WhatsApp flows with a visual canvas.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Bot
        </Button>
      </div>

      {bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
            <Cpu className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-[14px] font-semibold text-foreground">No bots yet</p>
          <p className="text-[13px] text-muted-foreground mt-1 mb-5">Create your first bot and design its flow on the canvas.</p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Bot
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-6 py-2 bg-muted/40">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-8"></span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Trigger</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Created</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>

          {bots.map(bot => (
            <div key={bot.id}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-6 py-3.5 hover:bg-muted/30 transition-colors">
              <button onClick={() => toggleStatus(bot)} className="flex items-center" title={bot.status === 'active' ? 'Active — click to disable' : 'Inactive — click to enable'}>
                {bot.status === 'active'
                  ? <ToggleRight className="h-5 w-5 text-[#25D366]" />
                  : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
              </button>

              <button
                onClick={() => router.push(`/bot-studio/${bot.id}`)}
                className="text-left text-[13px] font-semibold text-foreground hover:underline"
              >
                {bot.name}
              </button>

              <span className="text-[12px] text-muted-foreground">{TRIGGER_LABELS[bot.trigger] ?? bot.trigger}</span>
              <span className="text-[12px] text-muted-foreground">{new Date(bot.created_at).toLocaleDateString()}</span>

              <div className="flex items-center gap-1">
                <button onClick={() => router.push(`/bot-studio/${bot.id}`)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Edit bot">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setDeleteTarget(bot)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                  title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Bot</DialogTitle>
            <DialogDescription>Name your bot — you can design its flow next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Bot name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lead Qualifier"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & Edit →'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete bot</DialogTitle>
            <DialogDescription>Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={deleteBot} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
