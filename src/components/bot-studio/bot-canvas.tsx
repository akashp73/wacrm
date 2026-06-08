'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

import { StartNode } from './nodes/trigger-node';
import { ActionNode } from './nodes/action-node';
import { LeftPanel, TRIGGER_ITEMS, ACTION_GROUPS } from './left-panel';
import { ConfigPanel, type MessageTemplateOption } from './config-panel';
import { NODE_DEFS, type ActionType, type TriggerType } from '@/lib/bot-studio/node-definitions';

const nodeTypes: NodeTypes = {
  trigger: StartNode as never,
  ...Object.fromEntries(Object.keys(NODE_DEFS).map(k => [k, ActionNode as never])),
};

const START_NODE_ID = 'start';

type PanelState =
  | { kind: 'trigger'; nodeId: string; nodeType: TriggerType }
  | { kind: 'action';  nodeId: string; nodeType: ActionType }
  | null;

interface SavedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { config?: Record<string, unknown>; label?: string };
}
interface SavedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string | null;
}

interface BotCanvasProps {
  botId: string;
  initialNodes: SavedNode[];
  initialEdges: SavedEdge[];
  templates: MessageTemplateOption[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
}

const edgeStyle = (handle?: string | null) => ({
  animated: false,
  style: {
    stroke: handle === 'true'  ? '#10B981'
          : handle === 'false' ? '#EF4444'
          : '#9CA3AF',
    strokeWidth: 2,
  },
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14,
    color: handle === 'true' ? '#10B981' : handle === 'false' ? '#EF4444' : '#9CA3AF' },
});

function buildStartNode(config: Record<string, unknown>, position: { x: number; y: number }, onEdit: () => void): Node {
  return {
    id: START_NODE_ID,
    type: 'trigger',
    position,
    draggable: true,
    data: { config, label: 'Start', onEdit },
  };
}

function Canvas({ botId, initialNodes, initialEdges, templates, onSave }: BotCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [panel, setPanel] = useState<PanelState>(null);
  const [panelConfig, setPanelConfig] = useState<Record<string, unknown>>({});
  const loadedRef = useRef(false);

  const { screenToFlowPosition, fitView } = useReactFlow();

  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    onSaveRef.current(nodes, edges);
  }, [nodes, edges]);

  // ── Callbacks ──
  // openActionNode/cloneNode and makeActionCallbacks reference each other; refs (assigned in effects) break the cycle.
  const openActionNodeRef = useRef<(id: string, type: ActionType) => void>(() => {});
  const cloneNodeRef = useRef<(id: string) => void>(() => {});

  const makeActionCallbacks = useCallback((id: string, type: ActionType) => ({
    onEdit: () => openActionNodeRef.current(id, type),
    onDelete: () => {
      setNodes(nds => nds.filter(n => n.id !== id));
      setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    },
    onClone: () => cloneNodeRef.current(id),
  }), [setNodes, setEdges]);

  const openActionNode = useCallback((id: string, type: ActionType) => {
    setNodes(nds => {
      const n = nds.find(x => x.id === id);
      if (n) setPanelConfig(((n.data as Record<string, unknown>).config ?? {}) as Record<string, unknown>);
      return nds;
    });
    setPanel({ kind: 'action', nodeId: id, nodeType: type });
  }, [setNodes]);
  useEffect(() => { openActionNodeRef.current = openActionNode; }, [openActionNode]);

  const openTriggerNode = useCallback((cfg: Record<string, unknown>) => {
    const triggerType = (cfg.trigger_type as TriggerType) ?? 'message_received';
    setPanelConfig(cfg);
    setPanel({ kind: 'trigger', nodeId: START_NODE_ID, nodeType: triggerType });
  }, []);

  const cloneNode = useCallback((id: string) => {
    setNodes(nds => {
      const src = nds.find(n => n.id === id);
      if (!src || src.id === START_NODE_ID) return nds;
      const newId = crypto.randomUUID();
      const type = String(src.type) as ActionType;
      return [...nds, {
        ...src, id: newId,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        data: { ...(src.data as object), ...makeActionCallbacks(newId, type) },
      }];
    });
  }, [setNodes, makeActionCallbacks]);
  useEffect(() => { cloneNodeRef.current = cloneNode; }, [cloneNode]);

  // ── Build RF nodes from saved JSON ──
  const buildNode = useCallback((n: SavedNode): Node => {
    const cfg = n.data?.config ?? {};
    if (n.id === START_NODE_ID || n.type === 'trigger') {
      return buildStartNode(cfg, n.position, () => openTriggerNode(cfg));
    }
    const type = n.type as ActionType;
    return {
      id: n.id,
      type,
      position: n.position,
      data: { node_type: type, config: cfg, label: n.data?.label ?? NODE_DEFS[type]?.label ?? type, ...makeActionCallbacks(n.id, type) },
    };
  }, [makeActionCallbacks, openTriggerNode]);

  // ── Load (or seed) on mount ──
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    if (initialNodes.length === 0) {
      const start = buildStartNode({ trigger_type: 'message_received' }, { x: 80, y: 240 },
        () => openTriggerNode({ trigger_type: 'message_received' }));
      setNodes([start]);
      setEdges([]);
    } else {
      setNodes(initialNodes.map(buildNode));
      setEdges(initialEdges.map(e => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? 'output', label: e.label ?? '',
        ...edgeStyle(e.sourceHandle),
      })));
    }
    setTimeout(() => fitView({ padding: 0.3 }), 100);
  }, [initialNodes, initialEdges, buildNode, setNodes, setEdges, fitView, openTriggerNode]);

  // Refresh start-node callback closure whenever its config changes
  useEffect(() => {
    setNodes(nds => nds.map(n => {
      if (n.id !== START_NODE_ID) return n;
      const cfg = ((n.data as Record<string, unknown>).config ?? {}) as Record<string, unknown>;
      return { ...n, data: { ...(n.data as object), onEdit: () => openTriggerNode(cfg) } };
    }));
  }, [openTriggerNode, setNodes]);

  // ── Connect ──
  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, ...edgeStyle(params.sourceHandle) }, eds));
  }, [setEdges]);

  // ── Drag and drop ──
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const changeTriggerType = useCallback((triggerType: TriggerType) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== START_NODE_ID) return n;
      const cfg = { trigger_type: triggerType };
      return { ...n, data: { ...(n.data as object), config: cfg, onEdit: () => openTriggerNode(cfg) } };
    }));
    setPanelConfig({ trigger_type: triggerType });
    setPanel({ kind: 'trigger', nodeId: START_NODE_ID, nodeType: triggerType });
  }, [setNodes, openTriggerNode]);

  const addActionNode = useCallback((type: ActionType, position: { x: number; y: number }) => {
    const id = crypto.randomUUID();
    const cfg: Record<string, unknown> = {};
    setNodes(nds => [...nds, {
      id, type, position,
      data: { node_type: type, config: cfg, label: NODE_DEFS[type]?.label ?? type, ...makeActionCallbacks(id, type) },
    }]);
    setPanelConfig(cfg);
    setPanel({ kind: 'action', nodeId: id, nodeType: type });
  }, [setNodes, makeActionCallbacks]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('application/botstudio-type');
    const isTrigger = e.dataTransfer.getData('application/botstudio-is-trigger') === 'true';
    if (!itemId) return;

    if (isTrigger) {
      changeTriggerType(itemId as TriggerType);
      return;
    }

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addActionNode(itemId as ActionType, position);
  }, [screenToFlowPosition, changeTriggerType, addActionNode]);

  // ── Click left panel item ──
  const onAddItem = useCallback((id: string, isTrigger: boolean) => {
    if (isTrigger) {
      changeTriggerType(id as TriggerType);
      return;
    }
    let x = 420, y = 240;
    if (nodes.length > 0) {
      const last = nodes[nodes.length - 1];
      x = last.position.x + 320;
      y = last.position.y;
    }
    addActionNode(id as ActionType, { x, y });
  }, [nodes, changeTriggerType, addActionNode]);

  // ── Node click ──
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === START_NODE_ID) {
      const cfg = ((node.data as Record<string, unknown>).config ?? {}) as Record<string, unknown>;
      openTriggerNode(cfg);
    } else {
      openActionNode(node.id, String(node.type) as ActionType);
    }
  }, [openTriggerNode, openActionNode]);

  // ── Save panel config back to node ──
  const savePanelConfig = () => {
    if (!panel) return;
    const { nodeId } = panel;
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      if (nodeId === START_NODE_ID) {
        return { ...n, data: { ...(n.data as object), config: panelConfig, onEdit: () => openTriggerNode(panelConfig) } };
      }
      const type = String(n.type) as ActionType;
      return { ...n, data: { ...(n.data as object), config: panelConfig, ...makeActionCallbacks(nodeId, type) } };
    }));
    setPanel(null);
    toast.success('Saved');
  };

  // Targets for "Go To" — every node except the one being configured
  const gotoTargets = nodes
    .filter(n => !panel || n.id !== panel.nodeId)
    .map(n => ({
      id: n.id,
      label: n.id === START_NODE_ID ? 'Start' : String((n.data as Record<string, unknown>).label ?? n.type),
    }));

  return (
    <div className="flex h-full w-full">
      <LeftPanel onAddItem={onAddItem} />

      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onDrop={onDrop} onDragOver={onDragOver}
          fitView deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#D1D5DB" />
          <Controls showInteractive={false}
            className="!border-gray-200 !bg-white !shadow-sm !rounded-lg overflow-hidden" />
          <MiniMap className="!border-gray-200 !rounded-lg" nodeColor="#E5E7EB" />
        </ReactFlow>

        {nodes.length <= 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-3">
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/80 px-8 py-6 text-center">
              <p className="text-[15px] font-semibold text-gray-600">Drag an action onto the canvas</p>
              <p className="text-[12px] text-gray-400 mt-1">Connect it to Start to build your flow</p>
            </div>
          </div>
        )}
      </div>

      {panel && (
        <div className="h-full w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col shadow-xl">
          <ConfigPanel
            kind={panel.kind}
            nodeType={panel.nodeType}
            config={panelConfig}
            botId={botId}
            templates={templates}
            gotoTargets={gotoTargets}
            onChange={setPanelConfig}
            onSave={savePanelConfig}
            onClose={() => setPanel(null)}
          />
        </div>
      )}
    </div>
  );
}

export function BotCanvas(props: BotCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

export { TRIGGER_ITEMS, ACTION_GROUPS };
