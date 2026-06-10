# SKILL.md — Tableau Prep フロー解析スキル

このドキュメントは「**TPFA を拡張するために必要なドメイン知識と実装スキル**」をまとめたものです。
新しい解析ルール・ノードタイプ・差分項目を追加するときに参照してください。

> 関連: 概要は [`AGENTS.md`](./AGENTS.md)、形式の詳細は [`docs/TFL_FORMAT.md`](./docs/TFL_FORMAT.md)、
> 手順は [`docs/EXTENDING.md`](./docs/EXTENDING.md)。

---

## 1. ドメイン知識: Tableau Prep のフロー

Tableau Prep Builder で作るデータ準備フローは、**ステップ（ノード）** を矢印（コネクション）で
左→右につないだ有向グラフです。代表的なステップ種別:

| 種別 | 役割 | TPFA の `FlowNodeType` |
| --- | --- | --- |
| 入力 (Input) | CSV/Excel/DB 等からデータを読み込む | `Input` |
| クレンジング (Clean) | 計算フィールド追加・フィルタ・型変更・列操作 | `Clean` |
| 結合 (Join) | 2 つの入力をキーで横結合 | `Join` |
| ユニオン (Union) | 複数入力を縦結合 | `Union` |
| 集計 (Aggregate) | グループ化して集計 | `Aggregate` |
| ピボット (Pivot) | 行↔列の変換 | `Pivot` |
| 出力 (Output) | Hyper/CSV/DB/データソースへ書き出し | `Output` |
| スクリプト (Script) | Python/R による処理 | `Script` |

### ファイル形式

- **`.tfl`**: フロー定義の **生 JSON**。
- **`.tflx`**: **ZIP パッケージ**。内部に拡張子なしの `flow`（= JSON）と、`.hyper` などの
  抽出データが入っている。TPFA は `flow` だけを取り出して解析する。

JSON のスキーマは Tableau のバージョンごとに揺れます（`nodeType` のバージョン接頭辞、
キー名、入れ子の有無など）。**正確なキー名に依存せず、ヒューリスティックに読む**のが鉄則です。
詳細は [`docs/TFL_FORMAT.md`](./docs/TFL_FORMAT.md)。

---

## 2. パーサーの設計思想（`utils/tflParser.ts`）

TPFA のパーサーは「壊れにくさ」を最優先に、以下のヘルパーで防御的に実装しています。

| ヘルパー | 役割 |
| --- | --- |
| `getField(obj, ...keys)` | 複数候補キーを **大文字小文字無視** で順に探す |
| `asString(v)` | string/number/boolean を安全に文字列化 |
| `deepCollect(root, predicate, limit)` | オブジェクトツリーを **再帰探索**して条件に合う部分を収集（循環ガード・件数上限あり） |
| `isObject(v)` | プレーンオブジェクト判定 |

処理の流れ:

```
parseFlowFile(File)
  ├─ 拡張子 or マジックナンバー(PK\x03\x04) で .tflx を判定
  ├─ .tflx なら JSZip で解凍し flow JSON を抽出
  ├─ JSON.parse
  └─ parseFlowDocument(doc)            ← 生 JSON でも直接呼べる（テスト容易）
        ├─ doc.nodes を走査して各ノードを normalizeNode
        │     ├─ classifyNodeType()    … nodeType/baseType から種別判定
        │     ├─ extractMetaData()     … 接続/パス/フィールド/結合条件
        │     └─ extractActions()      … 計算フィールド/フィルタ/列操作 等
        └─ 各ノードの nextNodes から connections(エッジ) を導出
```

**重要なポイント**:
- 計算フィールドやフィルタは Clean ステップの `loomContainer` などに **深く入れ子**になっているため、
  `deepCollect` でツリー全体から拾う。特定の階層を前提にしない。
- `parseFlowDocument` は `File` や JSZip に依存しないので、Node からサンプル JSON を渡して
  そのままテストできる（`scripts/smoke-test.mts` 参照）。

---

## 3. スキル: 新しいノードタイプを認識させる

1. `utils/tflParser.ts` の `classifyNodeType()` に判定分岐を追加（`nodeType` の部分一致など）。
2. `utils/flowParser` の `FlowNodeType` ユニオン型に種別を追加（必要なら）。
3. `utils/flowTheme.ts` の `NODE_THEME` に **配色・ラベル・アイコン**を追加。
4. `public/samples/` に該当ステップを含むサンプルを追加し、`scripts/smoke-test.mts` で確認。

> 配色やラベルは必ず `flowTheme.ts` に集約する。UI 側へ直書きしない。

---

## 4. スキル: リンタールールを追加する（`utils/tflLinter.ts`）

リンターは `lintFlow(flow): LintAlert[]` がフローを走査して警告配列を返すだけのシンプルな構造です。

`LintAlert` の形:

```ts
interface LintAlert {
  id: string;            // 一意。`<rule>-<nodeId>` 形式が慣例
  nodeId: string;        // 関連ノード（全体に対する警告は空文字）
  nodeName: string;
  severity: 'error' | 'warning' | 'info';
  message: string;       // 何が問題か（日本語）
  tip: string;           // どう直すか（日本語）
}
```

ルール追加の手順:

1. `lintFlow` 内のノードループに条件を追加して `alerts.push({...})`。
2. グラフ的な判定（祖先/子孫の探索）が要るなら、既存の `incoming` マップと
   `hasAncestorOfType(nodeId, types)` を再利用する（Late Filter ルールが好例）。
3. 重大度は意味に合わせる。`error`=出力できない/壊れている、`warning`=性能/品質、`info`=軽微。
4. サマリーは `summarizeAlerts()` が自動集計するので変更不要。

実装済みルール: Late Filter（結合後フィルタ）/ Empty Clean Step / Missing Data Type /
孤立ノード / 入力の接続不明 / 出力ステップ無し。

---

## 5. スキル: 差分比較項目を追加する（`utils/tflDiff.ts`）

`diffFlows(a, b): FlowDiff` がノード ID の集合演算で 追加/削除/変更/変更なし を判定します。
ステップ内の詳細差分は `diffNode(a, b): FieldChange[]` が担当。

新しい比較項目（例: 新しいメタデータ）を増やすには `diffNode` に追記:

```ts
// 例: 既存のメタ比較テーブルに 1 行足すだけ
for (const [key, label] of [
  ['connectionType', '接続種類'],
  // ['myNewMeta', '新しい項目'],   ← ここに追加
] as const) { ... }
```

計算フィールドはフィールド名単位で Before/After を出すよう実装済み。
数式の細かな変更は `diffWords(before, after)`（LCS ベースの語句 diff）で
赤/緑のセグメントに分解し、`DiffViewer` がハイライト表示します。

---

## 6. スキル: ドキュメント出力を拡張する（`components/DocumentViewer.tsx`）

`generateMarkdown(flow)` がフローを走査して Markdown を組み立てます。
集計には `utils/tflParser.ts` の以下のヘルパーを使うと簡潔です:

- `collectInputs(flow)` / `collectOutputs(flow)` — 入力/出力ノード
- `collectCalculatedFields(flow)` — 全計算フィールド（所属ステップ付き）

新セクションを足す場合は `generateMarkdown` に push するだけ。コピーは
`navigator.clipboard` → `document.execCommand('copy')` のフォールバックで互換性を担保済み。

---

## 7. テストの作法

- ロジックは UI 非依存なので、`scripts/smoke-test.mts` にケースを足して
  `npx tsx scripts/smoke-test.mts` で素早く確認できる。
- 検証用サンプルは `public/samples/` に置く（アプリの「サンプルで試す」からも読める）。
- 差分やリンターの新ルールを足したら、それを踏む **専用サンプル**を用意すると回帰確認が楽。

---

## 8. よくある落とし穴

- Tableau のバージョン差で **キー名が違う / 階層が深い**。`getField` の候補追加と `deepCollect` で対応。
- `.tflx` 内の `flow` は **拡張子が無い**。名前ベースの抽出に加え「中身が `{` で始まる最初の
  テキスト」のフォールバックがある（`extractFlowJsonFromZip`）。
- 大きなフローでの性能。`deepCollect` の `limit`、フィールド収集の上限などの安全弁を残す。
- 配色の不整合。色は `flowTheme.ts` 一箇所のみ。
