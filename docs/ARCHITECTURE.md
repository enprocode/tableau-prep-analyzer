# アーキテクチャ

## 1. 全体像

TPFA は **完全フロントエンド完結（サーバーレス）** の SPA 的 Web アプリです。
ユーザーがアップロードしたフローファイルはブラウザ内でのみ処理され、外部へ送信されません。

```
┌─────────────────────────────────────────────────────────────┐
│ ブラウザ (クライアント)                                        │
│                                                              │
│  app/page.tsx  ── ダッシュボード（アップロード & タブ）         │
│       │                                                      │
│       │ File (.tfl/.tflx)                                    │
│       ▼                                                      │
│  utils/tflParser.ts  ── パース・正規化 → ParsedFlow          │
│       │                                                      │
│       ├──────────────┬──────────────┬───────────────┐       │
│       ▼              ▼              ▼               ▼       │
│  FlowVisualizer  LinterAlerts  DocumentViewer   DiffViewer  │
│  (+flowLayout    (+tflLinter)               (+tflDiff)      │
│   +flowTheme)                                               │
└─────────────────────────────────────────────────────────────┘
```

サーバーは静的アセットの配信のみ（Next.js の静的出力）。API ルートやサーバーアクションは持ちません。

## 2. レイヤー構成と責務

| レイヤー | ディレクトリ | 責務 | 依存 |
| --- | --- | --- | --- |
| UI（プレゼンテーション） | `app/`, `components/` | 入力受付・描画・操作 | `utils/` に依存可 |
| ロジック | `utils/` | パース・診断・差分・レイアウト・テーマ | **UI/DOM に非依存** |
| アセット | `public/` | サンプルフロー等の静的ファイル | — |
| 検証 | `scripts/` | ロジックの簡易テスト | `utils/` |

**設計原則**: ビジネスロジックはすべて `utils/` の純粋関数に置き、`components/` は
それを呼んで描画するだけにする。これによりロジックは Node 上で単体検証でき、UI と疎結合になる。

## 3. データモデル（共通型）

`utils/tflParser.ts` が単一の正規化モデルを定義し、全機能がこれを共有します。

```ts
interface ParsedFlow {
  nodes: Record<string, FlowNode>;   // id → ノード
  connections: FlowConnection[];     // エッジ（source → target）
  fileName?: string;                 // 差分やドキュメントの見出しに使用
  raw?: unknown;                     // 解析元の生 JSON（上級検査用）
}

interface FlowNode {
  id: string;
  name: string;
  type: string;                      // FlowNodeType（Input/Clean/Join/…）
  description?: string;
  actions?: FlowActionItem[];        // 計算フィールド/フィルタ/列操作 等
  metaData?: FlowMetaData;           // 接続情報/パス/フィールド/結合条件 等
}

interface FlowConnection { id: string; source: string; target: string; }
```

- `FlowActionItem.kind`: `calculatedField | filter | removeColumn | renameColumn |
  changeType | join | union | aggregate | group | other`
- `FlowMetaData`: `connectionType / connectionName / filePath / outputPath /
  fields / joinType / joinConditions` 等（追加可能なインデックス型）

## 4. 機能別データフロー

### Phase 1: パース
`File → (ZIP 判定/解凍) → JSON.parse → parseFlowDocument → ParsedFlow`
詳細は [TFL_FORMAT.md](./TFL_FORMAT.md)。

### Phase 2: 可視化
`ParsedFlow → computeLayout()（深さ計算で座標付与） → React Flow の nodes/edges`。
ノードクリックで `NodeDetailPanel` に詳細表示。配色は `flowTheme.ts`。

### Phase 3: 診断
`ParsedFlow → lintFlow() → LintAlert[] → LinterAlerts`。
グラフ探索（祖先判定）には逆隣接リストを構築して再利用。

### Phase 4: ドキュメント
`ParsedFlow → generateMarkdown() → <pre> 表示 + コピー/ダウンロード`。

### Phase 5: 差分
`(ParsedFlow A, ParsedFlow B) → diffFlows() → FlowDiff → DiffViewer`。
数式の語句単位ハイライトは `diffWords()`（LCS）。

## 5. 状態管理

- グローバルな状態管理ライブラリは使わない。`app/page.tsx` の `useState` で
  `flowA` / `flowB` / `activeTab` / `selectedNodeId` を保持するのみ。
- 選択ノードはダッシュボードが保持し、`FlowVisualizer` へ制御プロパティとして渡す
  （リンターの「ノードを表示」からフロー図へジャンプできるようにするため）。

## 6. パフォーマンス上の配慮

- 再帰探索 `deepCollect` は循環ガードと件数上限を持つ。
- 重い計算（レイアウト/リンター/差分/Markdown）は `useMemo` でメモ化。
- `.tflx` は `jszip` で非同期解凍し、UI をブロックしない。

## 7. デプロイ

静的ホスティング（Vercel / GitHub Pages 等）にそのまま載せられます。
`npm run build` の成果物を配信するだけで動作します（サーバー不要）。
