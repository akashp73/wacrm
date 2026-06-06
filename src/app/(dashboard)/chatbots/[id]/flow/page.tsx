'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, Plus, Loader2, Pencil } from 'lucide-react';
import type { Node, Edge } from '@xyflow/react';

import { FlowBuilder } from '@/components/chatbot/flow-builder';

interface Chatbot {
  id: string;
  name: string;
  is_active: boolean;
}

interface Variable { id?: string; name: string; var_type: string }

export default function FlowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [showVarPanel, setShowVarPanel] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Capture nodes/edges from canvas via callback
  const latestNodesRef = useRef<Node[]>([]);
  const latestEdgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    fetch(`/api/chatbots/${id}`)
      .then(r => r.json())
      .then(({ chatbot: bot, variables: v }) => {
        setChatbot(bot);
        setNameVal(bot?.name ?? '');
        setVariables(v ?? []);
      })
      .catch(() => toast.error('Failed to load flow'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (rfNodes?: Node[], rfEdges?: Edge[]) => {
    const nodesToSave = rfNodes ?? latestNodesRef.current;
    const edgesToSave = rfEdges ?? latestEdgesRef.current;

    setSaving(true);
    try {
      await fetch(`/api/chatbots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodesToSave.map(n => ({
            id: n.id,
            node_type: String(n.type ?? 'send_message'),
            label: String((n.data as Record<string, unknown>).label ?? ''),
            config: (n.data as Record<string, unknown>).config ?? {},
            position: n.position,
          })),
          edges: edgesToSave,
        }),
      });
      toast.success('Flow saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    if (!nameVal.trim()) return;
    setEditingName(false);
    setChatbot(prev => prev ? { ...prev, name: nameVal } : prev);
    await fetch(`/api/chatbots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameVal.trim() }),
    });
  };

  const toggleActive = async () => {
    const next = !chatbot?.is_active;
    setChatbot(prev => prev ? { ...prev, is_active: next } : prev);
    await fetch(`/api/chatbots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    toast.success(next ? 'Chatbot activated' : 'Chatbot paused');
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    // Full-screen, NO dashboard shell sidebar here — we use a direct layout
    <div className="fixed inset-0 flex flex-col bg-[#F8F9FA] z-50">
      {/* Top bar — DoubleTick style */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
        {/* Back */}
        <button
          onClick={() => router.push('/chatbots')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Editable bot name + pencil */}
        <div className="flex items-center gap-1.5">
          {editingName ? (
            <input
              ref={nameRef}
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(chatbot?.name ?? ''); }}}
              className="h-8 rounded-lg border border-gray-300 px-2.5 text-[14px] font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              autoFocus
            />
          ) : (
            <span className="text-[16px] font-semibold text-gray-900">
              {chatbot?.name ?? 'Untitled Bot'}
            </span>
          )}
          <button
            onClick={() => { setEditingName(true); setTimeout(() => nameRef.current?.select(), 10); }}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1" />

        {/* Right: Add Field + Enabled toggle + Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowVarPanel(!showVarPanel)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Field
          </button>

          {/* Enabled toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleActive}
              className={`relative flex h-6 w-11 items-center rounded-full transition-colors ${
                chatbot?.is_active ? 'bg-[#25D366]' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={chatbot?.is_active}
            >
              <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${
                chatbot?.is_active ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-[13px] font-medium text-gray-700">
              {chatbot?.is_active ? 'Enabled' : 'Disabled'}
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

      {/* Canvas — full remaining height */}
      <div className="flex-1 overflow-hidden">
        <FlowBuilder
          chatbotId={id}
          initialVariables={variables}
          onSave={(rfNodes, rfEdges) => {
            latestNodesRef.current = rfNodes;
            latestEdgesRef.current = rfEdges;
          }}
          showVarPanel={showVarPanel}
          setShowVarPanel={setShowVarPanel}
        />
      </div>
    </div>
  );
}
