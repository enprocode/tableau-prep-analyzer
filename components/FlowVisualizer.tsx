"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type OnNodesChange,
  MarkerType,
} from "@xyflow/react";
import type { FlowNode, ParsedFlow } from "@/utils/tflParser";
import { getNodeTheme } from "@/utils/flowTheme";
import { computeLayout } from "@/utils/flowLayout";
import NodeDetailPanel from "./NodeDetailPanel";

interface Props {
  flow: ParsedFlow;
  /** 外部から選択ノードを制御する場合に指定（リンターからのジャンプ等） */
  selectedId?: string | null;
  onSelectId?: (id: string | null) => void;
}

type TpfaNodeData = {
  flowNode: FlowNode;
};

/** Tableau Prep 風のカスタムノード。 */
function TpfaNode({ data, selected }: NodeProps) {
  const flowNode = (data as TpfaNodeData).flowNode;
  const theme = getNodeTheme(flowNode.type);
  const Icon = theme.icon;
  const actionCount = flowNode.actions?.length ?? 0;

  return (
    <div
      className="rounded-lg border-2 bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-slate-800"
      style={{
        borderColor: theme.color,
        boxShadow: selected ? `0 0 0 3px ${theme.color}55` : undefined,
        width: 200,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: theme.color }}
      />
      <div
        className="flex items-center gap-2 rounded-t-md px-2.5 py-1.5"
        style={{ backgroundColor: theme.bg }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded"
          style={{ color: theme.color }}
        >
          <Icon size={16} />
        </span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: theme.color }}
        >
          {flowNode.type}
        </span>
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {flowNode.name}
        </p>
        {actionCount > 0 && (
          <p className="mt-0.5 text-[11px] text-slate-400">
            {actionCount} 件の操作
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: theme.color }}
      />
    </div>
  );
}

const nodeTypes = { tpfa: TpfaNode };

function buildGraph(flow: ParsedFlow, selectedId: string | null): {
  nodes: Node[];
  edges: Edge[];
} {
  const positions = computeLayout(flow);
  const nodes: Node[] = Object.values(flow.nodes).map((n) => ({
    id: n.id,
    type: "tpfa",
    position: positions[n.id] ?? { x: 0, y: 0 },
    selected: n.id === selectedId,
    data: { flowNode: n } satisfies TpfaNodeData,
  }));
  const edges: Edge[] = flow.connections.map((c) => ({
    id: c.id,
    source: c.source,
    target: c.target,
    animated: true,
    style: { stroke: "#94a3b8", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
  }));
  return { nodes, edges };
}

function FlowCanvas({
  flow,
  selectedId,
  setSelectedId,
}: {
  flow: ParsedFlow;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const initial = useMemo(
    () => buildGraph(flow, selectedId),
    // 初回マウント用。フロー差し替えは下の render-time sync で扱う。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount snapshot
    []
  );
  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [graphFlow, setGraphFlow] = useState(flow);
  const [syncedSelected, setSyncedSelected] = useState(selectedId);

  // props 変化時の state 調整（React 推奨の render-time sync）
  if (flow !== graphFlow) {
    const next = buildGraph(flow, selectedId);
    setGraphFlow(flow);
    setSyncedSelected(selectedId);
    setNodes(next.nodes);
    setEdges(next.edges);
  } else if (selectedId !== syncedSelected) {
    setSyncedSelected(selectedId);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedId,
      }))
    );
  }

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      setSelectedId(node.id);
    },
    [setSelectedId]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelectedId(null)}
      nodesConnectable={false}
      elementsSelectable
      selectNodesOnDrag={false}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#cbd5e1" gap={20} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) =>
          getNodeTheme(((n.data as TpfaNodeData)?.flowNode?.type) ?? "Other")
            .color
        }
      />
    </ReactFlow>
  );
}

export default function FlowVisualizer({
  flow,
  selectedId: controlledId,
  onSelectId,
}: Props) {
  const [internalId, setInternalId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : internalId;
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (onSelectId) onSelectId(id);
      else setInternalId(id);
    },
    [onSelectId]
  );

  const selectedNode = selectedId ? flow.nodes[selectedId] ?? null : null;

  return (
    <div className="relative h-full w-full">
      <ReactFlowProvider>
        <FlowCanvas
          flow={flow}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
      </ReactFlowProvider>
      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedId(null)} />
    </div>
  );
}
