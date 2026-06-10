# 機能追加ガイド

よくある拡張作業の **具体的な手順** をまとめます。設計思想は [ARCHITECTURE.md](./ARCHITECTURE.md)、
ドメイン知識は [`../SKILL.md`](../SKILL.md) を参照。

共通の完了条件:

```bash
npm run lint                      # クリーン
npm run build                     # 成功
npx tsx scripts/smoke-test.mts    # 期待通り（ロジック変更時）
```

---

## 1. 新しいノードタイプを追加する

例: 「行レベルのスクリプト変換」を `Script` ではなく独自タイプとして表示したい。

1. **分類**: `utils/tflParser.ts` の `classifyNodeType()` に分岐を追加。

   ```ts
   if (t.includes("myspecialtransform")) return "MySpecial";
   ```

2. **型**: 同ファイルの `FlowNodeType` ユニオンに `"MySpecial"` を追加。

3. **テーマ**: `utils/flowTheme.ts` の `NODE_THEME` にエントリを追加（色/ラベル/アイコン）。

   ```ts
   MySpecial: {
     label: "特殊変換 (MySpecial)",
     color: "#7c3aed",
     bg: "#f5f3ff",
     badgeClass: "bg-violet-100 text-violet-700 border-violet-300",
     icon: Sparkles, // lucide-react から import
   },
   ```

4. **確認**: `public/samples/` に該当ステップを含むサンプルを追加し、smoke-test で分類を確認。

> `NODE_THEME` は `Record<FlowNodeType, NodeTheme>` なので、型を追加すると
> テーマ未定義はコンパイルエラーで検知できます（追加漏れ防止）。

---

## 2. リンタールールを追加する

例: 「1 つの Clean ステップに計算フィールドが 10 個を超える場合に警告」。

`utils/tflLinter.ts` の `lintFlow` 内ノードループに追加:

```ts
const calcCount = (node.actions ?? []).filter(a => a.kind === "calculatedField").length;
if (node.type === "Clean" && calcCount > 10) {
  alerts.push({
    id: `too-many-calcs-${node.id}`,
    nodeId: node.id,
    nodeName: node.name,
    severity: "info",
    message: `「${node.name}」に計算フィールドが ${calcCount} 個あります。`,
    tip: "ステップを分割すると可読性とデバッグ性が向上します。",
  });
}
```

- グラフ的判定が必要なら、ループ前に作られる `incoming` マップと
  `hasAncestorOfType(nodeId, types)` を使う（Late Filter ルールが参考）。
- サマリー（`summarizeAlerts`）と UI（`LinterAlerts`）は自動対応、変更不要。
- 検証用に、そのルールを踏むサンプルを `public/samples/` に追加すると回帰確認が容易。

---

## 3. 差分の比較項目を追加する

`utils/tflDiff.ts` の `diffNode(a, b)` に項目を追加します。

- 単純なメタ値の比較なら、既存の比較テーブルへ 1 行追加:

  ```ts
  for (const [key, label] of [
    ["connectionType", "接続種類"],
    ["outputType", "出力タイプ"],   // ← 追加例
  ] as const) { ... }
  ```

- 配列やマップの比較（計算フィールドのような）は、専用ロジックを書いて
  `FieldChange[]` を push する。`kind` は `added | removed | changed` を適切に設定。
- `kind === "changed"` で `before`/`after` の両方があると、`DiffViewer` が
  `diffWords()` による **語句単位の赤/緑ハイライト**を自動適用する。

> 🔗 **トポロジー（接続）の差分**: ステップ ID が同じまま接続だけが張り替えられた場合
> （Clean を Join の前に移動する等）も見逃さないよう、`diffFlows` は
> `diffConnections()` でエッジの追加/削除を網羅的に抽出し（`FlowDiff.connections` /
> `summary.connectionAdded` / `connectionRemoved`）、各ソースノードには
> `diffNodeConnections()` が「接続 (出力先)」の変更を注入して `modified` に反映します。
> エッジは必ず **source 側で 1 度だけ** 検知されるため二重計上されません。
> 表示は `DiffViewer` の「接続（トポロジー）の変更」セクションとステップカード内に出ます。

---

## 4. ドキュメント出力にセクションを追加する

`components/DocumentViewer.tsx` の `generateMarkdown(flow)` に push を足すだけ。

```ts
lines.push("## 4. 結合の一覧");
lines.push("| ステップ | タイプ | 条件 |");
lines.push("| --- | --- | --- |");
for (const n of Object.values(flow.nodes)) {
  if (n.type !== "Join") continue;
  lines.push(`| ${esc(n.name)} | ${esc(String(n.metaData?.joinType ?? "-"))} | ${esc((n.metaData?.joinConditions ?? []).join(" AND "))} |`);
}
```

集計には `collectInputs / collectOutputs / collectCalculatedFields`（`utils/tflParser.ts`）が便利。
セル内文字列は `esc()` でエスケープすること。

---

## 5. 新しいタブ（機能パネル）を追加する

1. `components/` に表示コンポーネントを作る（`"use client"`、`flow: ParsedFlow` を受け取る）。
2. `app/page.tsx` の `TabId` 型と `TABS` 配列にエントリを追加。
3. コンテンツ領域の条件分岐に描画を追加。

ロジックは必ず `utils/` の純粋関数に切り出し、コンポーネントからは呼ぶだけにする。

---

## 6. サンプルフローを追加する

- 置き場所: `public/samples/<name>.tfl`
- アプリの「サンプルで試す」やテストから `fetch("/samples/<name>.tfl")` で読める。
- 最小構成（入力→Clean→出力）から始め、検証したい特性（空ステップ・型不明など）を意図的に含める。
- `scripts/smoke-test.mts` に読み込みケースを足して期待値を確認する。

---

## 7. 依存関係の追加

- プライバシー原則を破る依存（テレメトリ/外部通信を行うもの）は追加しない。
- バンドルサイズに注意（クライアント同梱のため）。
- `lucide-react` のアイコンは存在するエクスポート名を使う（例: `Github` は環境により未提供。
  `ExternalLink` 等の確実なものを使う）。
