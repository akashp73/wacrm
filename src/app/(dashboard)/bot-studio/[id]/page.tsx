'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, Pencil } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';

import { createClient } from '@/lib/supabase/client';
import { BotCanvas } from '@/components/bot-studio/bot-canvas';
import type { MessageTemplateOption } from '@/components/bot-studio/config-panel';

interface Bot {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  trigger: string;
  nodes: unknown[];
  edges: unknown[];
}

export default function BotBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [bot, setBot] = useState<Bot | null>(null);
  const [templates, setTemplates] = useState<MessageTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const latestNodesRef = useRef<Node[]>([]);
  const latestEdgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      fetch(`/api/bot-studio/${id}`).then(r => r.json()),
      supabase.auth.getUser(),
    ])
      .then(async ([botRes, { data: { user } }]) => {
        setBot(botRes.bot ?? null);
        setNameVal(botRes.bot?.name ?? '');

        if (user) {
          const { data } = await supabase
            .from('message_templates')
            .select('id, name, body_text, language, status')
            .eq('user_id', user.id)
            .eq('status', 'Approved')
            .order('name');
          setTemplates(data ?? []);
        }
      })
      .catch(() => toast.error('Failed to load bot'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (rfNodes?: Node[], rfEdges?: Edge[]) => {
    const nodesToSave = rfNodes ?? latestNodesRef.current;
    const edgesToSave = rfEdges ?? latestEdgesRef.current;

    setSaving(true);
    try {
      const res = await fetch(`/api/bot-studio/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodesToSave.map(n => ({
            id: n.id,
            type: String(n.type ?? 'send_message'),
            data: {
              node_type: String(n.type ?? 'send_message'),
              label: String((n.data as Record<string, unknown>).label ?? ''),
              config: (n.data as Record<string, unknown>).config ?? {},
            },
            position: n.position,
          })),
          edges: edgesToSave.map(e => ({
            id: e.id, source: e.source, target: e.target,
            sourceHandle: e.sourceHandle, label: e.label,
          })),
        }),
      });
      const data = await res.json();
      if (data.bot) setBot(data.bot);
      toast.success('Bot saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    if (!nameVal.trim()) return;
    setEditingName(false);
    setBot(prev => prev ? { ...prev, name: nameVal } : prev);
    await fetch(`/api/bot-studio/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameVal.trim() }),
    });
  };

  const toggleStatus = async () => {
    const next = bot?.status === 'active' ? 'inactive' : 'active';
    setBot(prev => prev ? { ...prev, status: next } : prev);
    await fetch(`/api/bot-studio/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    toast.success(next === 'active' ? 'Bot enabled' : 'Bot disabled');
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!bot) return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <p className="text-[13px] text-muted-foreground">Bot not found</p>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#F8F9FA] z-50">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <button
          onClick={() => router.push('/bot-studio')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5">
          {editingName ? (
            <input
              ref={nameRef}
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(bot.name); }}}
              className="h-8 rounded-lg border border-gray-300 px-2.5 text-[14px] font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              autoFocus
            />
          ) : (
            <span className="text-[16px] font-semibold text-gray-900">{bot.name}</span>
          )}
          <button
            onClick={() => { setEditingName(true); setTimeout(() => nameRef.current?.select(), 10); }}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleStatus}
              className={`relative flex h-6 w-11 items-center rounded-full transition-colors ${
                bot.status === 'active' ? 'bg-[#25D366]' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={bot.status === 'active'}
            >
              <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${
                bot.status === 'active' ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-[13px] font-medium text-gray-700">
              {bot.status === 'active' ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <BotCanvas
          botId={id}
          initialNodes={(bot.nodes ?? []) as never}
          initialEdges={(bot.edges ?? []) as never}
          templates={templates}
          onSave={(rfNodes, rfEdges) => {
            latestNodesRef.current = rfNodes;
            latestEdgesRef.current = rfEdges;
          }}
        />
      </div>
    </div>
  );
}
