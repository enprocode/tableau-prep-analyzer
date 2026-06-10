import type { FlowNode, ParsedFlow } from "./tflParser";

/**
 * ============================================================================
 * TPFA - フロー比較エンジン
 * ----------------------------------------------------------------------------
 * 新旧 2 つのフローを比較し、ステップ単位の追加/削除に加え、
 * クレンジングステップ内の「計算フィールドの数式が変わった」といった
 * 細かな差分まで抽出する。
 * ============================================================================
 */

export type StepStatus = "added" | "removed" | "modified" | "unchanged";

/** ステップ内部の個別変更（項目ごとの Before/After）。 */
export interface FieldChange {
  /** 変更項目の見出し（例: "ステップ名", "計算: Profit Ratio"） */
  label: string;
  before?: string;
  after?: string;
  /** 変更種別 */
  kind: "added" | "removed" | "changed";
}

export interface StepDiff {
  status: StepStatus;
  nodeId: string;
  name: string;
  type: string;
  changes: FieldChange[];
}

export interface FlowDiff {
  steps: StepDiff[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

/** ノードから「計算フィールド名 → 数式」のマップを作る。 */
function calcMap(node: FlowNode): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of node.actions ?? []) {
    if (a.kind === "calculatedField" && a.field) {
      m.set(a.field, a.formula ?? "");
    }
  }
  return m;
}

/** ノードからフィルタ式の一覧を作る。 */
function filterList(node: FlowNode): string[] {
  return (node.actions ?? [])
    .filter((a) => a.kind === "filter")
    .map((a) => a.formula ?? "")
    .filter(Boolean);
}

function metaStr(node: FlowNode, key: string): string | undefined {
  const v = node.metaData?.[key];
  return v === undefined || v === null ? undefined : String(v);
}

/** 2 つのノードを比較し、項目単位の変更リストを返す。 */
function diffNode(a: FlowNode, b: FlowNode): FieldChange[] {
  const changes: FieldChange[] = [];

  if (a.name !== b.name) {
    changes.push({
      label: "ステップ名",
      before: a.name,
      after: b.name,
      kind: "changed",
    });
  }
  if (a.type !== b.type) {
    changes.push({
      label: "ステップ種別",
      before: a.type,
      after: b.type,
      kind: "changed",
    });
  }

  // 接続 / パス / 出力先
  for (const [key, label] of [
    ["connectionType", "接続種類"],
    ["connectionName", "接続名"],
    ["filePath", "ファイルパス"],
    ["outputPath", "出力先"],
    ["joinType", "結合タイプ"],
  ] as const) {
    const av = metaStr(a, key);
    const bv = metaStr(b, key);
    if (av !== bv && (av || bv)) {
      changes.push({
        label,
        before: av,
        after: bv,
        kind: av && bv ? "changed" : av ? "removed" : "added",
      });
    }
  }

  // 結合条件
  const ac = (a.metaData?.joinConditions ?? []).join(" AND ");
  const bc = (b.metaData?.joinConditions ?? []).join(" AND ");
  if (ac !== bc && (ac || bc)) {
    changes.push({
      label: "結合条件",
      before: ac || undefined,
      after: bc || undefined,
      kind: ac && bc ? "changed" : ac ? "removed" : "added",
    });
  }

  // 計算フィールド（フィールド名単位で Before/After）
  const aCalc = calcMap(a);
  const bCalc = calcMap(b);
  const allFields = new Set([...aCalc.keys(), ...bCalc.keys()]);
  for (const f of allFields) {
    const av = aCalc.get(f);
    const bv = bCalc.get(f);
    if (av === bv) continue;
    changes.push({
      label: `計算フィールド: ${f}`,
      before: av,
      after: bv,
      kind: av === undefined ? "added" : bv === undefined ? "removed" : "changed",
    });
  }

  // フィルタ
  const aFilters = filterList(a);
  const bFilters = filterList(b);
  const af = aFilters.join(" / ");
  const bf = bFilters.join(" / ");
  if (af !== bf && (af || bf)) {
    changes.push({
      label: "フィルタ条件",
      before: af || undefined,
      after: bf || undefined,
      kind: af && bf ? "changed" : af ? "removed" : "added",
    });
  }

  return changes;
}

/** 2 つのフローを比較する。 */
export function diffFlows(a: ParsedFlow, b: ParsedFlow): FlowDiff {
  const steps: StepDiff[] = [];
  const allIds = new Set([
    ...Object.keys(a.nodes),
    ...Object.keys(b.nodes),
  ]);

  for (const id of allIds) {
    const na = a.nodes[id];
    const nb = b.nodes[id];

    if (na && !nb) {
      steps.push({
        status: "removed",
        nodeId: id,
        name: na.name,
        type: na.type,
        changes: [],
      });
    } else if (!na && nb) {
      steps.push({
        status: "added",
        nodeId: id,
        name: nb.name,
        type: nb.type,
        changes: [],
      });
    } else if (na && nb) {
      const changes = diffNode(na, nb);
      steps.push({
        status: changes.length ? "modified" : "unchanged",
        nodeId: id,
        name: nb.name,
        type: nb.type,
        changes,
      });
    }
  }

  // 表示順: modified → added → removed → unchanged、その中は名前順
  const order: Record<StepStatus, number> = {
    modified: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  };
  steps.sort(
    (x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name)
  );

  return {
    steps,
    summary: {
      added: steps.filter((s) => s.status === "added").length,
      removed: steps.filter((s) => s.status === "removed").length,
      modified: steps.filter((s) => s.status === "modified").length,
      unchanged: steps.filter((s) => s.status === "unchanged").length,
    },
  };
}

/* ===========================================================================
 * 文字列の語句単位 diff（LCS）— 数式の細かな変更をハイライトするために使用
 * ======================================================================== */

export interface DiffSegment {
  value: string;
  type: "equal" | "added" | "removed";
}

/** 空白・記号を保持しつつトークン分割する。 */
function tokenize(s: string): string[] {
  return s.match(/(\s+|[A-Za-z0-9_\.]+|\[[^\]]*\]|[^\s])/g) ?? [];
}

/**
 * 2 つの文字列を語句単位で比較し、差分セグメントの配列を返す。
 * before 用（equal / removed）と after 用（equal / added）の両方を含む統合表現。
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // LCS DP テーブル
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (value: string, type: DiffSegment["type"]) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.value += value;
    else segments.push({ value, type });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i], "equal");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i], "removed");
      i++;
    } else {
      push(b[j], "added");
      j++;
    }
  }
  while (i < n) push(a[i++], "removed");
  while (j < m) push(b[j++], "added");

  return segments;
}
