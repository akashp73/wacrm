'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, GitBranch, ToggleLeft, ToggleRight, Copy, Trash2, Pencil, Loader2, AlertTriangle, Copy as CopyIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

const SETUP_SQL = `-- Run this in Supabase Dashboard → SQL Editor
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Bot',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  folder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chatbot_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL, label TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  position_x FLOAT NOT NULL DEFAULT 100, position_y FLOAT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chatbot_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES chatbot_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES chatbot_nodes(id) ON DELETE CASCADE,
  source_handle TEXT, label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chatbot_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  name TEXT NOT NULL, var_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(chatbot_id, name)
);
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  current_node_id UUID REFERENCES chatbot_nodes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  variables JSONB NOT NULL DEFAULT '{}',
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own chatbots" ON chatbots;
CREATE POLICY "Users manage own chatbots" ON chatbots FOR ALL USING (auth.uid() = user_id);

ALTER TABLE chatbot_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own nodes" ON chatbot_nodes;
CREATE POLICY "Users manage own nodes" ON chatbot_nodes FOR ALL
  USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_nodes.chatbot_id AND chatbots.user_id = auth.uid()));

ALTER TABLE chatbot_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own edges" ON chatbot_edges;
CREATE POLICY "Users manage own edges" ON chatbot_edges FOR ALL
  USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_edges.chatbot_id AND chatbots.user_id = auth.uid()));

ALTER TABLE chatbot_variables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own variables" ON chatbot_variables;
CREATE POLICY "Users manage own variables" ON chatbot_variables FOR ALL
  USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_variables.chatbot_id AND chatbots.user_id = auth.uid()));

ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sessions" ON chatbot_sessions;
CREATE POLICY "Users manage own sessions" ON chatbot_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_sessions.chatbot_id AND chatbots.user_id = auth.uid()));`;

interface Chatbot {
  id: string;
  name: string;
  is_active: boolean;
  folder: string | null;
  created_at: string;
}

export default function ChatbotsPage() {
  const router = useRouter();
  const [bots, setBots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chatbot | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/chatbots')
      .then(r => r.json())
      .then(({ chatbots, error }) => {
        if (error || chatbots === undefined) {
          setNeedsSetup(true);
        } else {
          setBots(chatbots ?? []);
        }
      })
      .catch(() => setNeedsSetup(true))
      .finally(() => setLoading(false));
  }, []);

  const copySql = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    });
  };

  const folders = Array.from(new Set(bots.map(b => b.folder).filter(Boolean))) as string[];

  const filtered = selectedFolder
    ? bots.filter(b => b.folder === selectedFolder)
    : bots;

  const toggleActive = async (bot: Chatbot) => {
    const next = !bot.is_active;
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, is_active: next } : b));
    await fetch(`/api/chatbots/${bot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
  };

  const cloneBot = async (bot: Chatbot) => {
    const res = await fetch('/api/chatbots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${bot.name} (Copy)`, folder: bot.folder }),
    });
    const data = await res.json();
    if (data.chatbot) setBots(prev => [data.chatbot, ...prev]);
    toast.success('Chatbot cloned');
  };

  const deleteBot = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/chatbots/${deleteTarget.id}`, { method: 'DELETE' });
    setBots(prev => prev.filter(b => b.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
    toast.success('Deleted');
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    const res = await fetch('/api/chatbots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), folder: folder.trim() || null }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.chatbot) {
      setCreateOpen(false);
      router.push(`/chatbots/${data.chatbot.id}/flow`);
    } else {
      toast.error('Failed to create chatbot');
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (needsSetup) return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-800">Database tables not created yet</p>
          <p className="text-[12px] text-amber-700 mt-0.5">
            The chatbot tables need to be created in your Supabase database. Copy the SQL below and run it in your{' '}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer"
              className="underline font-medium">Supabase Dashboard → SQL Editor</a>.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
          <p className="text-[12px] font-medium text-foreground">Setup SQL — copy and run in Supabase SQL Editor</p>
          <button
            onClick={copySql}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <CopyIcon className="h-3 w-3" />
            {sqlCopied ? 'Copied!' : 'Copy SQL'}
          </button>
        </div>
        <pre className="p-4 text-[11px] text-muted-foreground font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap">
          {SETUP_SQL}
        </pre>
      </div>

      <div className="flex gap-3">
        <a
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:bg-foreground/90 transition-colors"
        >
          Open Supabase Dashboard ↗
        </a>
        <button
          onClick={() => { setNeedsSetup(false); setLoading(true); fetch('/api/chatbots').then(r=>r.json()).then(({chatbots})=>{ setBots(chatbots??[]); setLoading(false); }).catch(()=>setLoading(false)); }}
          className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          I've run the SQL — Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full gap-0">
      {/* Folder sidebar */}
      <div className="w-44 shrink-0 border-r border-border bg-card flex flex-col py-3">
        <p className="px-3 mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Folders</p>
        <button
          onClick={() => setSelectedFolder(null)}
          className={`flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
            !selectedFolder ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          All
          <span className="ml-auto text-[11px] text-muted-foreground">{bots.length}</span>
        </button>
        {folders.map(f => (
          <button key={f} onClick={() => setSelectedFolder(f)}
            className={`flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
              selectedFolder === f ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {f}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {bots.filter(b => b.folder === f).length}
            </span>
          </button>
        ))}
        <div className="mt-auto px-3 py-2">
          <button className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="h-3 w-3" /> New folder
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h1 className="text-[20px] font-semibold text-foreground">Chatbots</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">Build automated conversation flows for WhatsApp.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create Chatbot
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
              <GitBranch className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-semibold text-foreground">No chatbots yet</p>
            <p className="text-[13px] text-muted-foreground mt-1 mb-5">Create your first automated conversation flow.</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create Chatbot
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Table header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-6 py-2 bg-muted/40">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-8"></span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Folder</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Created</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Actions</span>
            </div>

            {filtered.map((bot) => (
              <div key={bot.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-6 py-3.5 hover:bg-muted/30 transition-colors">
                {/* Active toggle */}
                <button onClick={() => toggleActive(bot)} className="flex items-center">
                  {bot.is_active
                    ? <ToggleRight className="h-5 w-5 text-[#25D366]" />
                    : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>

                {/* Name */}
                <div>
                  <button
                    onClick={() => router.push(`/chatbots/${bot.id}/flow`)}
                    className="text-[13px] font-semibold text-foreground hover:underline"
                  >
                    {bot.name}
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-white text-[8px]" style={{ background: '#25D366' }}>W</span>
                    WhatsApp
                  </p>
                </div>

                <span className="text-[12px] text-muted-foreground">{bot.folder ?? '—'}</span>
                <span className="text-[12px] text-muted-foreground">{new Date(bot.created_at).toLocaleDateString()}</span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button onClick={() => router.push(`/chatbots/${bot.id}/flow`)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Edit flow">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => cloneBot(bot)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Clone">
                    <Copy className="h-3.5 w-3.5" />
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
      </div>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Chatbot</DialogTitle>
            <DialogDescription>Name your bot and optionally assign it to a folder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Chatbot name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Support Bot"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Folder (optional)</Label>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Sales" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & Edit Flow →'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chatbot</DialogTitle>
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
