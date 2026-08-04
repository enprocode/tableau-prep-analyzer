import JSZip from "jszip";

/**
 * ============================================================================
 * Tableau Prep Flow Analyzer (TPFA) - Core Parsing Engine
 * ----------------------------------------------------------------------------
 * Tableau Prep のフローファイルには 2 種類存在する。
 *   - .tfl : 生の JSON データ（フロー定義そのもの）
 *   - .tflx : ZIP パッケージ。内部に `flow`（拡張子なしの JSON）と
 *             抽出ファイル（.hyper など）が含まれる。
 *
 * このモジュールはどちらの形式も受け付け、アプリ全体で共通利用する
 * 正規化された型（FlowNode / FlowConnection / ParsedFlow）へ変換する。
 * すべてブラウザ内で完結し、外部サーバーへデータを送信しない。
 * ============================================================================
 */

/** ノード（ステップ）の正規化された分類タイプ。 */
export type FlowNodeType =
  | "Input"
  | "Clean"
  | "Join"
  | "Union"
  | "Aggregate"
  | "Pivot"
  | "Output"
  | "Script"
  | "Other";

/** ステップ内で行われる個々のアクション（計算フィールド・フィルタ等）の正規化表現。 */
export interface FlowActionItem {
  kind:
    | "calculatedField"
    | "filter"
    | "removeColumn"
    | "renameColumn"
    | "changeType"
    | "join"
    | "union"
    | "aggregate"
    | "group"
    | "other";
  /** 対象フィールド名（該当する場合） */
  field?: string;
  /** 計算式 / フィルタ式など */
  formula?: string;
  /** 人間が読める補足説明 */
  detail?: string;
  /** 元 JSON への参照（デバッグ / 差分用） */
  raw?: unknown;
}

/** ノードに付随するメタデータ（接続情報・ファイルパス・フィールド等）。 */
export interface FlowMetaData {
  nodeType?: string;
  baseType?: string;
  connectionType?: string;
  connectionName?: string;
  filePath?: string;
  outputPath?: string;
  outputType?: string;
  fields?: { name: string; type?: string }[];
  joinType?: string;
  joinConditions?: string[];
  /** その他、表示に有用な生メタ情報 */
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  name: string;
  type: string; // 'Input' (入力), 'Clean', 'Join', 'Union', 'Output' など
  description?: string;
  actions?: FlowActionItem[]; // 変更履歴や計算フィールドなどの詳細
  metaData?: FlowMetaData; // ファイルパスや接続情報
}

export interface FlowConnection {
  id: string;
  source: string;
  target: string;
}

export interface ParsedFlow {
  nodes: Record<string, FlowNode>;
  connections: FlowConnection[];
  /** 解析元のファイル名（差分比較などで利用） */
  fileName?: string;
  /** 解析元の生 JSON（差分比較・上級者向け検査で利用） */
  raw?: unknown;
}

/* ===========================================================================
 * ユーティリティ: 安全なプロパティアクセス & 深い探索
 * ======================================================================== */

type AnyObject = Record<string, unknown>;

function isObject(v: unknown): v is AnyObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 大文字小文字を無視して最初に見つかったキーの値を返す。 */
function getField(obj: AnyObject, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
    // 大文字小文字無視のフォールバック
    const lower = key.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === lower && obj[k] !== undefined && obj[k] !== null) {
        return obj[k];
      }
    }
  }
  return undefined;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

/**
 * 再帰的にオブジェクトツリーを走査し、predicate にマッチした
 * サブオブジェクトをすべて収集する（循環参照ガード付き）。
 */
function deepCollect(
  root: unknown,
  predicate: (o: AnyObject) => boolean,
  limit = 5000
): AnyObject[] {
  const results: AnyObject[] = [];
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  while (stack.length && results.length < limit) {
    const cur = stack.pop();
    if (cur === null || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    const obj = cur as AnyObject;
    if (predicate(obj)) results.push(obj);
    for (const key of Object.keys(obj)) stack.push(obj[key]);
  }
  return results;
}

/* ===========================================================================
 * ファイル読み込み: .tfl / .tflx の判定と展開
 * ======================================================================== */

/**
 * ブラウザのメモリ枯渇（巨大ファイル / ZIP bomb）を防ぐ上限。
 * .tflx は .hyper 等を含むためアップロード自体は大きめを許容し、
 * 実際に展開・文字列化するフロー定義 JSON だけを厳しく制限する。
 */
export const FLOW_FILE_LIMITS = {
  /** アップロード全体（圧縮後）の上限 */
  maxUploadBytes: 80 * 1024 * 1024,
  /** ZIP 内のファイルエントリ数上限（ディレクトリ除く） */
  maxZipEntries: 500,
  /** フロー定義として読み込む 1 エントリの展開後サイズ上限 */
  maxFlowJsonBytes: 16 * 1024 * 1024,
} as const;

/** 人間が読めるバイト表記（エラーメッセージ用）。 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(2) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 100 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

/** アップロードサイズが上限以内か検査する。超過時は日本語メッセージで throw。 */
export function assertUploadSizeAllowed(byteLength: number): void {
  if (byteLength > FLOW_FILE_LIMITS.maxUploadBytes) {
    throw new Error(
      `ファイルサイズが上限（${formatByteSize(FLOW_FILE_LIMITS.maxUploadBytes)}）を超えています（${formatByteSize(byteLength)}、${byteLength.toLocaleString()} bytes）。より小さいファイルでお試しください。`
    );
  }
}

/** 対応している拡張子か（中身の ZIP マジック判定は別途）。 */
export function isSupportedFlowFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".tfl") || lower.endsWith(".tflx") || lower.endsWith(".json");
}

export async function parseFlowFile(file: File): Promise<ParsedFlow> {
  assertUploadSizeAllowed(file.size);

  const name = file.name.toLowerCase();
  const isZip = name.endsWith(".tflx") || (await looksLikeZip(file));

  // 拡張子が不明で ZIP でもない場合は早期に分かりやすいエラーを返す
  if (!isSupportedFlowFileName(file.name) && !isZip) {
    throw new Error(
      "対応していないファイル形式です。.tfl または .tflx ファイルを選択してください。"
    );
  }

  let jsonText: string;
  if (isZip) {
    jsonText = await extractFlowJsonFromZip(file);
  } else {
    // 生 .tfl も展開後相当の上限でガード（巨大 JSON の一括読込を防ぐ）
    if (file.size > FLOW_FILE_LIMITS.maxFlowJsonBytes) {
      throw new Error(
        `フロー定義が大きすぎます（上限 ${formatByteSize(FLOW_FILE_LIMITS.maxFlowJsonBytes)}、実際 ${formatByteSize(file.size)}）。`
      );
    }
    jsonText = await file.text();
  }

  if (new TextEncoder().encode(jsonText).byteLength > FLOW_FILE_LIMITS.maxFlowJsonBytes) {
    throw new Error(
      `フロー定義が大きすぎます（上限 ${formatByteSize(FLOW_FILE_LIMITS.maxFlowJsonBytes)}）。`
    );
  }

  let doc: unknown;
  try {
    doc = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(
      `フローファイルの JSON 解析に失敗しました。ファイルが破損している可能性があります。(${(e as Error).message})`
    );
  }

  const parsed = parseFlowDocument(doc);
  parsed.fileName = file.name;
  return parsed;
}

/** ZIP のマジックナンバー (PK\x03\x04) を確認する。 */
async function looksLikeZip(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return (
      head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
    );
  } catch {
    return false;
  }
}

/** JSZip エントリの展開後サイズ（不明なら undefined）。 */
function zipEntryUncompressedSize(entry: {
  _data?: { uncompressedSize?: number };
}): number | undefined {
  const size = entry._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : undefined;
}

function isSkippedExtractAsset(entryName: string): boolean {
  const lower = entryName.toLowerCase();
  return (
    lower.endsWith(".hyper") ||
    lower.endsWith(".tde") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".parquet")
  );
}

/**
 * サイズ検査付きで ZIP エントリを UTF-8 テキストとして読む。
 * 展開前に uncompressedSize が分かる場合はそこで拒否し、ZIP bomb を抑止する。
 */
async function readZipEntryTextLimited(
  entry: JSZip.JSZipObject,
  maxBytes: number
): Promise<string> {
  const declared = zipEntryUncompressedSize(
    entry as unknown as { _data?: { uncompressedSize?: number } }
  );
  if (declared !== undefined && declared > maxBytes) {
    throw new Error(
      `ZIP 内のフロー定義が大きすぎます（上限 ${formatByteSize(maxBytes)}、申告サイズ ${formatByteSize(declared)}）。`
    );
  }

  const buf = await entry.async("uint8array");
  if (buf.byteLength > maxBytes) {
    throw new Error(
      `ZIP 内のフロー定義が大きすぎます（上限 ${formatByteSize(maxBytes)}、実際 ${formatByteSize(buf.byteLength)}）。`
    );
  }
  return new TextDecoder("utf-8").decode(buf);
}

/** .tflx (ZIP) から内部のフロー定義 JSON を取り出す。 */
async function extractFlowJsonFromZip(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  if (entries.length > FLOW_FILE_LIMITS.maxZipEntries) {
    throw new Error(
      `ZIP 内のファイル数が上限（${FLOW_FILE_LIMITS.maxZipEntries}）を超えています（${entries.length} 件）。不正なパッケージの可能性があります。`
    );
  }

  // 優先順位: 拡張子なしの "flow" → *.tfl → *.json
  const byName = (pred: (n: string) => boolean) =>
    entries.find((f) => pred(f.name.toLowerCase().split("/").pop() ?? ""));

  const target =
    byName((n) => n === "flow") ??
    byName((n) => n.endsWith(".tfl")) ??
    byName((n) => n.endsWith(".json"));

  if (target) {
    return readZipEntryTextLimited(target, FLOW_FILE_LIMITS.maxFlowJsonBytes);
  }

  // 拡張子で判定できない場合、抽出アセットを除き JSON っぽいテキストを探す
  for (const f of entries) {
    if (isSkippedExtractAsset(f.name)) continue;
    const declared = zipEntryUncompressedSize(
      f as unknown as { _data?: { uncompressedSize?: number } }
    );
    // 展開前に大きすぎるエントリは読まずスキップ（ZIP bomb / 巨大バイナリ対策）
    if (
      declared !== undefined &&
      declared > FLOW_FILE_LIMITS.maxFlowJsonBytes
    ) {
      continue;
    }
    const text = await readZipEntryTextLimited(
      f,
      FLOW_FILE_LIMITS.maxFlowJsonBytes
    );
    if (text.trimStart().startsWith("{")) {
      return text;
    }
  }
  throw new Error(".tflx 内にフロー定義ファイルが見つかりませんでした。");
}

/* ===========================================================================
 * ドキュメント本体の正規化
 * ======================================================================== */

/**
 * パース済みの JSON ドキュメントを ParsedFlow へ正規化する。
 * （テスト・差分比較で生 JSON から直接呼び出せるよう公開）
 */
export function parseFlowDocument(doc: unknown): ParsedFlow {
  if (!isObject(doc)) {
    throw new Error("フロー定義が不正な形式です（オブジェクトではありません）。");
  }

  const rawNodes = getField(doc, "nodes");
  const nodesMap: AnyObject = isObject(rawNodes) ? rawNodes : {};

  // データソース接続のマップ（DB 接続名やファイルパスの参照に利用）
  const rawConnections = getField(doc, "connections");
  const connectionsMap: AnyObject = isObject(rawConnections)
    ? rawConnections
    : {};

  const nodes: Record<string, FlowNode> = {};
  const connections: FlowConnection[] = [];

  for (const [id, rawNode] of Object.entries(nodesMap)) {
    if (!isObject(rawNode)) continue;
    const node = normalizeNode(id, rawNode, connectionsMap);
    nodes[id] = node;

    // フローの接続（エッジ）は各ノードの nextNodes から導出する
    const nextNodes = getField(rawNode, "nextNodes");
    if (Array.isArray(nextNodes)) {
      for (const nn of nextNodes) {
        if (!isObject(nn)) continue;
        const targetId = asString(
          getField(nn, "nextNodeId", "nodeId", "targetNodeId", "id")
        );
        if (!targetId) continue;
        connections.push({
          id: `${id}->${targetId}`,
          source: id,
          target: targetId,
        });
      }
    }
  }

  // nextNodes が無い古い形式 / 別形式に備え、トップレベル connections も拾う
  if (connections.length === 0) {
    const topConns = getField(doc, "connections", "edges", "links");
    if (Array.isArray(topConns)) {
      for (const c of topConns) {
        if (!isObject(c)) continue;
        const source = asString(getField(c, "source", "sourceId", "from"));
        const target = asString(getField(c, "target", "targetId", "to"));
        if (source && target) {
          connections.push({ id: `${source}->${target}`, source, target });
        }
      }
    }
  }

  return { nodes, connections, raw: doc };
}

/** 1 ノードを正規化する。 */
function normalizeNode(
  id: string,
  raw: AnyObject,
  connectionsMap: AnyObject
): FlowNode {
  const nodeType = asString(getField(raw, "nodeType", "type", "class")) ?? "";
  const baseType = asString(getField(raw, "baseType"));
  const name =
    asString(getField(raw, "name", "nodeName", "displayName", "caption")) ??
    `Step ${id.slice(0, 6)}`;
  const description = asString(getField(raw, "description", "userDescription"));

  const type = classifyNodeType(nodeType, baseType, raw);
  const metaData = extractMetaData(raw, type, connectionsMap);
  const actions = extractActions(raw, type);

  return {
    id,
    name,
    type,
    description,
    actions,
    metaData,
  };
}

/**
 * Tableau Prep の nodeType 文字列（バージョン接頭辞付き）と baseType から
 * 正規化されたノードタイプを判定する。
 */
export function classifyNodeType(
  nodeType: string,
  baseType: string | undefined,
  raw: AnyObject
): FlowNodeType {
  const t = nodeType.toLowerCase();
  const b = (baseType ?? "").toLowerCase();

  // 出力系
  if (
    t.includes("writeto") ||
    t.includes("publishextract") ||
    t.includes("output") ||
    t.includes("savetohyper") ||
    b === "output"
  ) {
    return "Output";
  }

  // 入力系（&& は || より優先されるが、意図を括弧で明示）
  if (
    t.includes("load") ||
    (t.includes("extract") && b === "input") ||
    t.includes("input") ||
    b === "input"
  ) {
    return "Input";
  }

  if (t.includes("join")) return "Join";
  if (t.includes("union")) return "Union";
  if (t.includes("aggregate") || t.includes("groupby")) return "Aggregate";
  if (t.includes("pivot")) return "Pivot";
  if (t.includes("script") || t.includes("python") || t.includes("rserve")) {
    return "Script";
  }

  // クレンジング系（Container / SuperTransform / 一般 transform）
  if (
    t.includes("container") ||
    t.includes("supertransform") ||
    t.includes("clean") ||
    b === "supernode" ||
    b === "transform"
  ) {
    return "Clean";
  }

  // 入力でも出力でもない、actions を持つものは Clean とみなす
  if (getField(raw, "actions", "loomContainer")) return "Clean";

  return "Other";
}

/* ===========================================================================
 * メタデータ抽出（接続情報 / ファイルパス / フィールド / 結合条件）
 * ======================================================================== */

function extractMetaData(
  raw: AnyObject,
  type: FlowNodeType,
  connectionsMap: AnyObject
): FlowMetaData {
  const meta: FlowMetaData = {
    nodeType: asString(getField(raw, "nodeType", "type")),
    baseType: asString(getField(raw, "baseType")),
  };

  const connAttrs = getField(raw, "connectionAttributes");
  const connectionId = asString(getField(raw, "connectionId"));

  // 接続属性（直接ノードに付与されている場合）
  if (isObject(connAttrs)) {
    meta.connectionType = asString(getField(connAttrs, "class", "dbclass"));
    meta.filePath = asString(
      getField(connAttrs, "filename", "file", "path", "directory", "dbname")
    );
    meta.connectionName = asString(
      getField(connAttrs, "server", "dbname", "schema", "filename")
    );
  }

  // 接続マップから補完
  if (connectionId && isObject(connectionsMap[connectionId])) {
    const conn = connectionsMap[connectionId] as AnyObject;
    meta.connectionType =
      meta.connectionType ??
      asString(getField(conn, "connectionType", "class"));
    const cAttrs = getField(conn, "connectionAttributes");
    if (isObject(cAttrs)) {
      meta.filePath =
        meta.filePath ??
        asString(getField(cAttrs, "filename", "file", "path", "dbname"));
      meta.connectionName =
        meta.connectionName ??
        asString(getField(cAttrs, "server", "dbname", "schema", "filename"));
    }
  }

  // リレーション名（テーブル名 / シート名）
  const relation = getField(raw, "relation");
  if (isObject(relation)) {
    const relName = asString(getField(relation, "table", "name", "tableName"));
    if (relName && !meta.connectionName) meta.connectionName = relName;
  }

  // 出力先情報
  if (type === "Output") {
    meta.outputPath =
      asString(
        getField(
          raw,
          "outputFile",
          "filename",
          "path",
          "projectName",
          "datasourceName",
          "tableName"
        )
      ) ??
      meta.filePath;
    meta.outputType =
      asString(getField(raw, "nodeType")) ?? meta.connectionType;
  }

  // フィールド一覧
  const fields = extractFields(raw);
  if (fields.length) meta.fields = fields;

  // 結合の詳細
  if (type === "Join") {
    const { joinType, conditions } = extractJoinInfo(raw);
    if (joinType) meta.joinType = joinType;
    if (conditions.length) meta.joinConditions = conditions;
  }

  return meta;
}

function extractFields(raw: AnyObject): { name: string; type?: string }[] {
  const out: { name: string; type?: string }[] = [];
  const seen = new Set<string>();
  const fieldArrays = deepCollect(
    raw,
    (o) =>
      ("name" in o || "columnName" in o) &&
      ("type" in o || "dataType" in o || "ordinal" in o)
  );
  for (const f of fieldArrays) {
    const fname = asString(getField(f, "name", "columnName"));
    if (!fname || seen.has(fname)) continue;
    // 計算式を持つものはフィールド型一覧では拾わない（計算フィールド側で扱う）
    seen.add(fname);
    out.push({
      name: fname,
      type: asString(getField(f, "type", "dataType")),
    });
    if (out.length >= 200) break;
  }
  return out;
}

function extractJoinInfo(raw: AnyObject): {
  joinType?: string;
  conditions: string[];
} {
  const conditions: string[] = [];
  let joinType: string | undefined;

  const joinObjs = deepCollect(
    raw,
    (o) => "joinType" in o || "conditions" in o || "actionNode" in o
  );
  for (const jo of joinObjs) {
    joinType = joinType ?? asString(getField(jo, "joinType"));
    const conds = getField(jo, "conditions");
    if (Array.isArray(conds)) {
      for (const c of conds) {
        if (!isObject(c)) continue;
        const left = asString(
          getField(c, "leftExpression", "leftField", "left")
        );
        const right = asString(
          getField(c, "rightExpression", "rightField", "right")
        );
        const comp = asString(getField(c, "comparator", "operator")) ?? "=";
        if (left || right) {
          conditions.push(`${left ?? "?"} ${comp} ${right ?? "?"}`);
        }
      }
    }
  }
  return { joinType, conditions };
}

/* ===========================================================================
 * アクション抽出（計算フィールド / フィルタ / 列操作 など）
 * ======================================================================== */

function extractActions(raw: AnyObject, type: FlowNodeType): FlowActionItem[] {
  const actions: FlowActionItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (a: FlowActionItem) => {
    const key = `${a.kind}|${a.field ?? ""}|${a.formula ?? ""}|${a.detail ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    actions.push(a);
  };

  // --- 計算フィールド / 列変更計算 ---
  const calcObjs = deepCollect(raw, (o) => {
    const nt = (asString(getField(o, "nodeType", "type")) ?? "").toLowerCase();
    const hasExpr =
      "expression" in o || "calc" in o || "formula" in o || "calculation" in o;
    const hasCol = "columnName" in o || "name" in o;
    return (
      hasExpr &&
      hasCol &&
      (nt.includes("addcolumn") ||
        nt.includes("changecolumncalc") ||
        nt.includes("calculatedfield") ||
        nt.includes("calc") ||
        hasExpr)
    );
  });
  for (const o of calcObjs) {
    const formula = asString(
      getField(o, "expression", "calc", "formula", "calculation")
    );
    const field = asString(getField(o, "columnName", "name", "newColumnName"));
    if (formula && field) {
      pushUnique({ kind: "calculatedField", field, formula, raw: o });
    }
  }

  // --- フィルタ ---
  const filterObjs = deepCollect(raw, (o) => {
    const nt = (asString(getField(o, "nodeType", "type")) ?? "").toLowerCase();
    return (
      nt.includes("filter") ||
      "filterExpression" in o ||
      "filterClause" in o ||
      ("expression" in o && nt.includes("filter"))
    );
  });
  for (const o of filterObjs) {
    const formula = asString(
      getField(o, "filterExpression", "expression", "filterClause", "calc")
    );
    pushUnique({
      kind: "filter",
      formula: formula ?? "(条件式)",
      detail: "行のフィルタリング",
      raw: o,
    });
  }

  // --- 列の削除 ---
  const removeObjs = deepCollect(raw, (o) => {
    const nt = (asString(getField(o, "nodeType", "type")) ?? "").toLowerCase();
    return nt.includes("removecolumn") || nt.includes("dropcolumn");
  });
  for (const o of removeObjs) {
    const cols = getField(o, "columnNames", "columns", "columnName");
    const names = Array.isArray(cols)
      ? cols.map((c) => asString(c)).filter(Boolean).join(", ")
      : asString(cols);
    pushUnique({
      kind: "removeColumn",
      detail: `列の削除${names ? `: ${names}` : ""}`,
      raw: o,
    });
  }

  // --- 列名の変更 ---
  const renameObjs = deepCollect(raw, (o) => {
    const nt = (asString(getField(o, "nodeType", "type")) ?? "").toLowerCase();
    return nt.includes("renamecolumn");
  });
  for (const o of renameObjs) {
    const from = asString(getField(o, "columnName", "oldName", "from"));
    const to = asString(getField(o, "newColumnName", "newName", "to"));
    pushUnique({
      kind: "renameColumn",
      detail: `列名変更: ${from ?? "?"} → ${to ?? "?"}`,
      raw: o,
    });
  }

  // --- データ型の変更 ---
  const typeObjs = deepCollect(raw, (o) => {
    const nt = (asString(getField(o, "nodeType", "type")) ?? "").toLowerCase();
    return nt.includes("changecolumntype") || nt.includes("changetype");
  });
  for (const o of typeObjs) {
    const field = asString(getField(o, "columnName", "name"));
    const newType = asString(getField(o, "type", "dataType", "newType"));
    pushUnique({
      kind: "changeType",
      field,
      detail: `データ型変更: ${field ?? "?"} → ${newType ?? "?"}`,
      raw: o,
    });
  }

  // --- 結合 ---
  if (type === "Join") {
    const { joinType, conditions } = extractJoinInfo(raw);
    pushUnique({
      kind: "join",
      detail: `${joinType ? joinType.toUpperCase() + " 結合" : "結合"}${
        conditions.length ? `: ${conditions.join(" AND ")}` : ""
      }`,
      raw: { joinType, conditions },
    });
  }

  // --- ユニオン ---
  if (type === "Union") {
    pushUnique({ kind: "union", detail: "複数の入力を縦結合 (Union)" });
  }

  // --- 集計 ---
  if (type === "Aggregate") {
    pushUnique({ kind: "aggregate", detail: "集計 (Aggregate / Group By)" });
  }

  return actions;
}

/* ===========================================================================
 * 集計ヘルパー（DocumentViewer などで利用）
 * ======================================================================== */

/** フロー内の全計算フィールドを、所属ステップ情報付きで取得する。 */
export interface CalculatedFieldSummary {
  stepId: string;
  stepName: string;
  field: string;
  formula: string;
}

export function collectCalculatedFields(
  flow: ParsedFlow
): CalculatedFieldSummary[] {
  const out: CalculatedFieldSummary[] = [];
  for (const node of Object.values(flow.nodes)) {
    for (const a of node.actions ?? []) {
      if (a.kind === "calculatedField" && a.field && a.formula) {
        out.push({
          stepId: node.id,
          stepName: node.name,
          field: a.field,
          formula: a.formula,
        });
      }
    }
  }
  return out;
}

/** 入力ノード一覧を取得する。 */
export function collectInputs(flow: ParsedFlow): FlowNode[] {
  return Object.values(flow.nodes).filter((n) => n.type === "Input");
}

/** 出力ノード一覧を取得する。 */
export function collectOutputs(flow: ParsedFlow): FlowNode[] {
  return Object.values(flow.nodes).filter((n) => n.type === "Output");
}
