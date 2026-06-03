'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Connection, type Edge, type Node,
  type NodeTypes,
  MarkerType, BackgroundVariant,
  useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';

import { TriggerNode } from './nodes/trigger-node';
import { ActionNode } from './nodes/action-node';
import { LeftPanel, TRIGGER_GROUPS, ACTION_GROUPS } from './panels/left-panel';
import { TriggerPanel, type TriggerConfig } from './panels/trigger-panel';
import { ActionPanel } from './panels/action-panel';
import { VariablePanel, type BotVariable } from './panels/variable-panel';
import { NODE_DEFS, type NodeType } from '@/lib/chatbot/node-definitions';

// ─── Node type registry ───────────────────────────────────────

const nodeTypes: NodeTypes = {
  trigger: TriggerNode as never,
  ...Object.fromEntries(Object.keys(NODE_DEFS).map(k => [k, ActionNode as never])),
};

// ─── Panel state ──────────────────────────────────────────────

type PanelState =
  | { kind: 'trigger';      nodeId: string }
  | { kind: 'action-config';nodeId: string; nodeType: NodeType; isNew: boolean }
  | null

// ─── DB types ─────────────────────────────────────────────────

interface DbNode {
  id: string; chatbot_id: string; node_type: string;
  label: string; config: Record<string, unknown>;
  position_x: number; position_y: number;
}
interface DbEdge {
  id: string; source_node_id: string; target_node_id: string;
  source_handle?: string; label?: string;
}

interface FlowBuilderProps {
  chatbotId: string;
  initialNodes: DbNode[];
  initialEdges: DbEdge[];
  initialVariables: BotVariable[];
  onSave: (n: Node[], e: Edge[]) => void;
  showVarPanel: boolean;
  setShowVarPanel: (v: boolean) => void;
}

// ─── Edge style ───────────────────────────────────────────────

const edgeStyle = (handle?: string | null) => ({
  animated: false,
  style: {
    stroke: handle === 'success' || handle === 'yes' ? '#10B981'
          : handle === 'invalid' || handle === 'no'  ? '#EF4444'
          : handle === 'timeout'                      ? '#F59E0B'
          : '#9CA3AF',
    strokeWidth: 2,
  },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14,
    color: handle === 'success' || handle === 'yes' ? '#10B981'
         : handle === 'invalid' || handle === 'no'  ? '#EF4444'
         : '#9CA3AF' },
})

// ─── Canvas inner ─────────────────────────────────────────────

function Canvas({ chatbotId, initialNodes, initialEdges, initialVariables,
  onSave, showVarPanel, setShowVarPanel }: FlowBuilderProps) {

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [variables, setVariables] = useState<BotVariable[]>(initialVariables);
  const [panel, setPanel] = useState<PanelState>(null);

  const [triggerCfg, setTriggerCfg] = useState<TriggerConfig>({ trigger_type: 'new_message' });
  const [actionType, setActionType]  = useState<NodeType>('send_text');
  const [actionCfg,  setActionCfg]   = useState<Record<string, unknown>>({});
  const [actionPanelMode, setActionPanelMode] = useState<'pick' | 'configure'>('configure');

  const { screenToFlowPosition, fitView } = useReactFlow();

  // ── Callbacks (stable IDs) ──
  const makeCallbacks = useCallback((id: string, type: string) => ({
    onEdit:    () => openNode(id, type),
    onDelete:  () => { setNodes(n => n.filter(x => x.id !== id)); setEdges(e => e.filter(x => x.source !== id && x.target !== id)); },
    onClone:   () => cloneNode(id),
    onAddNext: () => {
      setActionPanelMode('pick');
      setActionType('send_text'); setActionCfg({});
      setPanel({ kind: 'action-config', nodeId: `next-from-${id}`, nodeType: 'send_text', isNew: true });
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNode = useCallback((id: string, type: string) => {
    setNodes(nds => {
      const n = nds.find(x => x.id === id);
      if (!n) return nds;
      if (type === 'trigger') {
        setTriggerCfg((n.data as Record<string, unknown>).config as unknown as TriggerConfig ?? { trigger_type: 'new_message' });
        setPanel({ kind: 'trigger', nodeId: id });
      } else {
        setActionType(type as NodeType);
        setActionCfg(((n.data as Record<string, unknown>).config ?? {}) as Record<string, unknown>);
        setActionPanelMode('configure');
        setPanel({ kind: 'action-config', nodeId: id, nodeType: type as NodeType, isNew: false });
      }
      return nds;
    });
  }, [setNodes]);

  const cloneNode = useCallback((id: string) => {
    setNodes(nds => {
      const src = nds.find(n => n.id === id);
      if (!src) return nds;
      const newId = crypto.randomUUID();
      return [...nds, { ...src, id: newId,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        data: { ...(src.data as object), ...makeCallbacks(newId, String(src.type)) },
      }];
    });
  }, [setNodes, makeCallbacks]);

  // ── Build RF node from DB ──
  const buildNode = useCallback((n: DbNode, idx: number): Node => {
    const cbs = makeCallbacks(n.id, n.node_type);
    return {
      id: n.id,
      type: n.node_type === 'trigger' ? 'trigger' : n.node_type,
      position: { x: n.position_x, y: n.position_y },
      data: { ...n.config, node_type: n.node_type, config: n.config, nodeIndex: idx, label: n.label, ...cbs },
    };
  }, [makeCallbacks]);

  // ── Init from DB ──
  useEffect(() => {
    setNodes(initialNodes.map((n, i) => buildNode(n, i)));
    setEdges(initialEdges.map(e => ({
      id: e.id, source: e.source_node_id, target: e.target_node_id,
      sourceHandle: e.source_handle ?? 'output', label: e.label ?? '',
      ...edgeStyle(e.source_handle),
    })));
    setTimeout(() => fitView({ padding: 0.3 }), 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect ──
  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, ...edgeStyle(params.sourceHandle) }, eds));
  }, [setEdges]);

  // ── Drag-and-drop from left panel ──
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('application/reactflow-type');
    const isTrigger = e.dataTransfer.getData('application/reactflow-is-trigger') === 'true';
    if (!nodeType) return;

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNewNode(nodeType, isTrigger, position, {});
  }, [screenToFlowPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add node at position ──
  const addNewNode = useCallback((
    type: string, isTrigger: boolean,
    position: { x: number; y: number },
    config: Record<string, unknown>,
  ) => {
    const id = crypto.randomUUID();
    const cbs = makeCallbacks(id, isTrigger ? 'trigger' : type);

    type ItemShape = { id: string; label: string; icon: string; desc?: string; color?: string };
    const allItems: ItemShape[] = isTrigger
      ? (TRIGGER_GROUPS as { items: ItemShape[] }[]).flatMap(g => g.items)
      : (ACTION_GROUPS  as { items: ItemShape[] }[]).flatMap(g => g.items);
    const item = allItems.find(i => i.id === type);
    const label = item?.label ?? type;

    setNodes(nds => {
      const n: Node = {
        id,
        type: isTrigger ? 'trigger' : type,
        position,
        data: {
          node_type: isTrigger ? 'trigger' : type,
          config: isTrigger ? { trigger_type: type, ...config } : config,
          nodeIndex: nds.length,
          label,
          ...cbs,
        },
      };
      return [...nds, n];
    });

    // Open config immediately after adding
    if (isTrigger) {
      setTriggerCfg({ trigger_type: type });
      setPanel({ kind: 'trigger', nodeId: id });
    } else {
      setActionType(type as NodeType);
      setActionCfg(config);
      setActionPanelMode('configure');
      setPanel({ kind: 'action-config', nodeId: id, nodeType: type as NodeType, isNew: false });
    }
  }, [makeCallbacks, setNodes]);

  // ── Click on left panel item ──
  const onAddItem = useCallback((id: string, isTrigger: boolean) => {
    const existingNodes = nodes;
    let x = 400, y = 250;
    if (existingNodes.length > 0) {
      // Place to the right of the last node
      const last = existingNodes[existingNodes.length - 1];
      x = last.position.x + 320;
      y = last.position.y;
    }
    addNewNode(id, isTrigger, { x, y }, {});
  }, [nodes, addNewNode]);

  // ── Node click → open config ──
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    openNode(node.id, String(node.type ?? 'send_text'));
  }, [openNode]);

  // ── Save trigger ──
  const saveTrigger = () => {
    if (panel?.kind !== 'trigger') return;
    const { nodeId } = panel;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, data: { ...(n.data as object), config: triggerCfg, ...makeCallbacks(nodeId, 'trigger') } };
    }));
    setPanel(null);
    toast.success('Trigger saved');
  };

  // ── Save action ──
  const saveAction = () => {
    if (panel?.kind !== 'action-config') return;
    const { nodeId, isNew } = panel;
    if (!isNew) {
      setNodes(nds => nds.map(n => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...(n.data as object), config: actionCfg, ...makeCallbacks(nodeId, actionType) } };
      }));
    }
    setPanel(null);
    toast.success(isNew ? '' : 'Node saved');
  };

  const panelOpen = !!panel || showVarPanel;

  return (
    <div className="flex h-full w-full">
      {/* ── Left panel: Triggers / Actions ── */}
      <LeftPanel onAddItem={onAddItem} />

      {/* ── Canvas ── */}
      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onDrop={onDrop} onDragOver={onDragOver}
          fitView deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#D1D5DB" />
          <Controls showInteractive={false}
            className="!border-gray-200 !bg-white !shadow-sm !rounded-lg overflow-hidden" />
          <MiniMap className="!border-gray-200 !rounded-lg" nodeColor="#E5E7EB" />
        </ReactFlow>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/80 px-8 py-6 text-center">
              <p className="text-[15px] font-semibold text-gray-600">Drag a Trigger here to start</p>
              <p className="text-[12px] text-gray-400 mt-1">Or click any item in the left panel</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right config panel ── */}
      {(panel || showVarPanel) && (
        <div className="h-full w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col shadow-xl">
          {showVarPanel && (
            <VariablePanel variables={variables}
              onAdd={async v => {
                setVariables(p => [...p, v]);
                await fetch(`/api/chatbots/${chatbotId}/variables`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
                }).catch(() => {});
              }}
              onDelete={name => setVariables(p => p.filter(v => v.name !== name))}
              onClose={() => setShowVarPanel(false)} />
          )}

          {!showVarPanel && panel?.kind === 'trigger' && (
            <TriggerPanel config={triggerCfg} onChange={setTriggerCfg}
              onClose={() => setPanel(null)} onSave={saveTrigger} />
          )}

          {!showVarPanel && panel?.kind === 'action-config' && (
            <ActionPanel
              mode={actionPanelMode}
              nodeType={actionType}
              config={actionCfg}
              onPickType={type => { setActionType(type); setActionPanelMode('configure'); }}
              onConfigChange={setActionCfg}
              onClose={() => setPanel(null)}
              onSave={saveAction}
              onBack={() => setActionPanelMode('pick')}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Exported with provider ───────────────────────────────────

export function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
