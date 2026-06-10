import type { FlowNode, ParsedFlow } from "./tflParser";

/**
 * ============================================================================
 * TPFA - 健全性・ベストプラクティス診断 (Linter)
 * ----------------------------------------------------------------------------
 * パース済みのフロー情報を元に、パフォーマンスのボトルネックや無駄なステップ、
 * 設定ミスを検知する静的解析ルールを実装する。
 * ============================================================================
 */

export interface LintAlert {
  id: string;
  nodeId: string;
  nodeName: string;
  severity: "error" | "warning" | "info";
  message: string;
  tip: string; // 改善アドバイス
}

/** フロー全体を診断し、警告の配列を返す。 */
export function lintFlow(flow: ParsedFlow): LintAlert[] {
  const alerts: LintAlert[] = [];

  // 上流ノード（祖先）を辿るための逆隣接リストを構築
  const incoming = new Map<string, string[]>();
  for (const id of Object.keys(flow.nodes)) incoming.set(id, []);
  for (const c of flow.connections) {
    if (incoming.has(c.target)) incoming.get(c.target)!.push(c.source);
  }
  const outgoingCount = new Map<string, number>();
  for (const c of flow.connections) {
    outgoingCount.set(c.source, (outgoingCount.get(c.source) ?? 0) + 1);
  }

  /** あるノードの祖先に、指定タイプのノードが存在するか判定する。 */
  const hasAncestorOfType = (
    startId: string,
    types: string[]
  ): FlowNode | null => {
    const seen = new Set<string>();
    const stack = [...(incoming.get(startId) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const node = flow.nodes[cur];
      if (node && types.includes(node.type)) return node;
      stack.push(...(incoming.get(cur) ?? []));
    }
    return null;
  };

  for (const node of Object.values(flow.nodes)) {
    /* --- ルール 1: Late Filter（遅すぎるフィルタ） -------------------------
     * Join / Union の後ろにあるクレンジングステップで行をフィルタしている場合、
     * 結合前にフィルタした方が処理対象の行数が減りパフォーマンスが向上する。 */
    const hasFilter = (node.actions ?? []).some((a) => a.kind === "filter");
    if (hasFilter) {
      const ancestor = hasAncestorOfType(node.id, ["Join", "Union"]);
      if (ancestor) {
        alerts.push({
          id: `late-filter-${node.id}`,
          nodeId: node.id,
          nodeName: node.name,
          severity: "warning",
          message: `結合/ユニオン（「${ancestor.name}」）より後でフィルタが実行されています。`,
          tip: "可能であれば結合の前段でフィルタを適用してください。処理する行数が減り、フロー全体のパフォーマンスが向上します。",
        });
      }
    }

    /* --- ルール 2: Empty Clean Step（無駄なステップ） ----------------------
     * actions が空のまま存在する、実質何もしていないクレンジングステップ。 */
    if (node.type === "Clean" && (node.actions ?? []).length === 0) {
      alerts.push({
        id: `empty-clean-${node.id}`,
        nodeId: node.id,
        nodeName: node.name,
        severity: "info",
        message: `クレンジングステップ「${node.name}」には操作が含まれていません。`,
        tip: "何も処理していないステップはフローを複雑にするだけです。不要であれば削除を検討してください。",
      });
    }

    /* --- ルール 3: Missing Data Type（データ型未定義） ---------------------
     * データ型が UNKNOWN や想定外のものになっているフィールド。 */
    const badFields = (node.metaData?.fields ?? []).filter((f) => {
      const t = (f.type ?? "").toLowerCase();
      return !t || t === "unknown" || t === "undefined" || t === "null";
    });
    if (badFields.length > 0) {
      alerts.push({
        id: `missing-type-${node.id}`,
        nodeId: node.id,
        nodeName: node.name,
        severity: "warning",
        message: `「${node.name}」にデータ型が未定義/不明なフィールドが ${badFields.length} 件あります（例: ${badFields
          .slice(0, 3)
          .map((f) => f.name)
          .join(", ")}）。`,
        tip: "出力前に各フィールドへ適切なデータ型を割り当ててください。型が不明だと集計や結合で予期しない挙動を招きます。",
      });
    }

    /* --- 追加ルール: 孤立ノード ------------------------------------------ */
    const isOrphan =
      (incoming.get(node.id)?.length ?? 0) === 0 &&
      (outgoingCount.get(node.id) ?? 0) === 0;
    if (isOrphan && Object.keys(flow.nodes).length > 1) {
      alerts.push({
        id: `orphan-${node.id}`,
        nodeId: node.id,
        nodeName: node.name,
        severity: "info",
        message: `ステップ「${node.name}」はどこにも接続されていません。`,
        tip: "他のステップと接続されていない孤立ノードです。使われていない場合は削除してください。",
      });
    }

    /* --- 追加ルール: 入力に接続情報が無い -------------------------------- */
    if (
      node.type === "Input" &&
      !node.metaData?.filePath &&
      !node.metaData?.connectionName &&
      !node.metaData?.connectionType
    ) {
      alerts.push({
        id: `input-no-conn-${node.id}`,
        nodeId: node.id,
        nodeName: node.name,
        severity: "info",
        message: `入力ステップ「${node.name}」の接続情報を特定できませんでした。`,
        tip: "接続が壊れている可能性があります。データソースのパスや接続設定を確認してください。",
      });
    }
  }

  /* --- 追加ルール: 出力ステップが存在しない ------------------------------ */
  const hasOutput = Object.values(flow.nodes).some((n) => n.type === "Output");
  if (!hasOutput && Object.keys(flow.nodes).length > 0) {
    alerts.push({
      id: "no-output",
      nodeId: "",
      nodeName: "(フロー全体)",
      severity: "error",
      message: "このフローには出力ステップ (Output) がありません。",
      tip: "フローの結果を保存するには、少なくとも 1 つの出力ステップを追加してください。",
    });
  }

  // 重大度順に並べ替え（error → warning → info）
  const order = { error: 0, warning: 1, info: 2 } as const;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return alerts;
}

/** 重大度ごとの件数を集計する。 */
export function summarizeAlerts(alerts: LintAlert[]) {
  return {
    error: alerts.filter((a) => a.severity === "error").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
    total: alerts.length,
  };
}
