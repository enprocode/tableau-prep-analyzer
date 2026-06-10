import type { ParsedFlow } from "./tflParser";

export interface LayoutPosition {
  x: number;
  y: number;
}

/**
 * 簡易自動レイアウト。
 * Tableau Prep のフローは左（データソース）→ 右（出力）へ進むため、
 * ノードの依存関係から「深さ（レイヤー）」を計算し、X 軸方向にオフセットする。
 * 同じレイヤー内のノードは Y 軸方向に並べる。
 */
export function computeLayout(
  flow: ParsedFlow,
  opts: { xGap?: number; yGap?: number } = {}
): Record<string, LayoutPosition> {
  const xGap = opts.xGap ?? 300;
  const yGap = opts.yGap ?? 120;

  const nodeIds = Object.keys(flow.nodes);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const id of nodeIds) {
    adjacency.set(id, []);
    indegree.set(id, 0);
  }
  for (const c of flow.connections) {
    if (!adjacency.has(c.source) || !flow.nodes[c.target]) continue;
    adjacency.get(c.source)!.push(c.target);
    indegree.set(c.target, (indegree.get(c.target) ?? 0) + 1);
  }

  // 深さ（最長パス）を計算。入力ノード（indegree 0）を起点とする BFS/緩和。
  const depth = new Map<string, number>();
  for (const id of nodeIds) depth.set(id, 0);

  // トポロジカル順に緩和（Kahn 法、循環は残余を最後に処理）
  const queue: string[] = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const localIndeg = new Map(indegree);
  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const d = depth.get(cur) ?? 0;
    for (const next of adjacency.get(cur) ?? []) {
      depth.set(next, Math.max(depth.get(next) ?? 0, d + 1));
      localIndeg.set(next, (localIndeg.get(next) ?? 1) - 1);
      if ((localIndeg.get(next) ?? 0) <= 0) queue.push(next);
    }
  }
  // 循環などで未訪問のノードは末尾レイヤーへ
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  for (const id of nodeIds) {
    if (!visited.has(id)) depth.set(id, maxDepth + 1);
  }

  // レイヤーごとにグループ化し Y を割り当てる
  const layers = new Map<number, string[]>();
  for (const id of nodeIds) {
    const d = depth.get(id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(id);
  }

  const positions: Record<string, LayoutPosition> = {};
  const sortedDepths = Array.from(layers.keys()).sort((a, b) => a - b);
  for (const d of sortedDepths) {
    const ids = layers.get(d)!;
    // 名前順で安定したレイアウトにする
    ids.sort((a, b) =>
      (flow.nodes[a]?.name ?? a).localeCompare(flow.nodes[b]?.name ?? b)
    );
    const totalHeight = (ids.length - 1) * yGap;
    ids.forEach((id, i) => {
      positions[id] = {
        x: d * xGap,
        y: i * yGap - totalHeight / 2,
      };
    });
  }

  return positions;
}
