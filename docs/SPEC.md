# Tableau Prep Flow Analyzer (TPFA) — 開発ロードマップ & 実装仕様書（原典）

> 📌 このドキュメントは、本プロジェクトの **出発点となった元の設計書（オリジナル仕様）** を
> そのまま記録として残したものです。実装は本仕様に沿って Phase 1 から順に進められました。
> 実装後の最新の設計・運用は以下を参照してください。
> - 概要/運用: [`../AGENTS.md`](../AGENTS.md)
> - ドメイン知識/拡張: [`../SKILL.md`](../SKILL.md)
> - 設計詳細: [`./ARCHITECTURE.md`](./ARCHITECTURE.md) / [`./TFL_FORMAT.md`](./TFL_FORMAT.md) / [`./EXTENDING.md`](./EXTENDING.md)
>
> ※ 仕様と実装が乖離した場合は **実装（コード）を正** とし、本ファイルは歴史的経緯として保持します。

このドキュメントは、AIエディタ（Claude Code / Cursor / VS Code 等）を使用して、Tableau Prep の
フローファイル（`.tfl` / `.tflx`）をパース・視覚化・診断・比較する「最強のオールインワン
Webアプリケーション」を立ち上げるための開発仕様書です。

---

## 1. 🚀 技術スタック & アーキテクチャ

ユーザーのデータを外部サーバーに送信せず、安全かつ高速にブラウザ内で動作させるため、
**完全フロントエンド完結型（サーバーレス）** の構成とします。これにより、Vercel や
GitHub Pages 等の無料ホスティングで簡単に運用可能です。

- **フレームワーク**: Next.js (App Router) + TypeScript
- **UI/デザイン**: Tailwind CSS + shadcn/ui + Lucide Icons
- **インタラクティブグラフ**: React Flow (`@xyflow/react`)
- **ZIP圧縮解凍 (for .tflx)**: `jszip`
- **JSON差分比較**: 自作のオブジェクト比較ロジック、または `diff-match-patch`

---

## 2. 📁 推奨プロジェクトフォルダ構造

```
tpfa/
├── app/
│   ├── layout.tsx
│   └── page.tsx            # メインダッシュボード（アップロード & タブ切り替え）
├── components/
│   ├── FlowVisualizer.tsx   # React Flow を使ったフロー図描画コンポーネント
│   ├── LinterAlerts.tsx     # 健全性診断結果のビジュアル表示
│   ├── DocumentViewer.tsx   # 自動生成ドキュメント（Markdown / コピー機能）
│   └── DiffViewer.tsx       # 2つのフローのビジュアル差分比較
├── utils/
│   ├── tflParser.ts         # .tfl/.tflx のパース、ZIP解凍、共通型定義
│   ├── tflLinter.ts         # パフォーマンスや設定ミスの自動診断ルール
│   └── tflDiff.ts           # 2つのJSONオブジェクトの比較差分抽出
├── package.json
└── tailwind.config.js
```

---

## 3. 🎯 開発フェーズ別・実装ガイド

各フェーズを順番に作成させるための設計コードと指示用プロンプトです。

### 📦 Phase 1: コアパースエンジンの作成 (`utils/tflParser.ts`)

Tableau Prep のファイルには以下の2種類があります。

- **`.tfl`**: 生のJSONデータ。
- **`.tflx`**: ZIPパッケージ。展開すると内部に `.tfl` と抽出ファイル（`.hyper` など）が含まれています。

まずはこれらを読み込み、共通の型定義にパースする処理を構築します。

> 💡 指示プロンプト:
> `utils/tflParser.ts` を作成してください。ユーザーがアップロードした `.tfl`（生のJSON）または
> `.tflx`（ZIP圧縮）を判定し、`jszip` を使って解凍・解析する `parseFlowFile` 関数を実装してください。
> 出力として、ノード（ステップ）のマップ、および接続（コネクション）の配列を返す以下の
> インターフェースを定義してください。

```ts
export interface FlowNode {
  id: string;
  name: string;
  type: string; // 'Extract' (入力), 'Clean', 'Join', 'Union', 'Output' など
  description?: string;
  actions?: any;      // 変更履歴や計算フィールドなどの詳細
  metaData?: any;     // ファイルパスや接続情報
}

export interface FlowConnection {
  id: string;
  source: string;
  target: string;
}

export interface ParsedFlow {
  nodes: Record<string, FlowNode>;
  connections: FlowConnection[];
}
```

### 🎨 Phase 2: インタラクティブ可視化 (`components/FlowVisualizer.tsx`)

パースしたノードとコネクション情報から、React Flow 用の `nodes`（座標情報付き）と `edges` を
自動生成します。Prepのフローは通常、左（データソース）から右（出力）へ進むため、簡易的な
レイアウトアルゴリズムを実装します。

> 💡 指示プロンプト:
> `@xyflow/react` を使って、フロー図をインタラクティブに描画する `components/FlowVisualizer.tsx`
> を作成してください。各ノードはTableau Prep風の配色（Inputは青、Cleanは緑、Joinはオレンジ、
> Outputは赤など）のカスタムノードにしてください。ノードの依存関係やタイプから、簡易的な
> 自動レイアウト（X軸の自動オフセットなど）を行って配置してください。ノードをクリックすると、
> そのステップで作成された計算フィールドや、接続ソースなどの詳細がサイドパネルに表示される
> インタラクティブな設計にしてください。

### 🔍 Phase 3: 健全性・ベストプラクティス診断 (`utils/tflLinter.ts`)

パースされたJSONの構造をスキャンし、パフォーマンスボトルネックや設計ミスを検知する診断機能を
実装します。

実装するルール定義:

- **Late Filter (遅すぎるフィルタ)**: Join や Union の後ろにあるクレンジングステップで大量の
  行数をフィルタリングしていないか（結合する前にフィルタをかけるべき）。
- **Empty Clean Step (無駄なステップ)**: `actions`（変更履歴）が空のまま存在する、実質何も
  していないクレンジングステップがないか。
- **Missing Data Type (データ型未定義)**: データ型が `UNKNOWN` や想定外のものになっている
  フィールドの警告。

> 💡 指示プロンプト:
> `utils/tflLinter.ts` を作成してください。パースしたフロー情報を元に、パフォーマンスの
> ボトルネックや無駄なステップを検知する静的解析（Linter）ルールを実装してください。
> 以下の形式で警告を配列として返すようにしてください。

```ts
export interface LintAlert {
  id: string;
  nodeId: string;
  nodeName: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  tip: string; // 改善アドバイス
}
```

### 📝 Phase 4: 仕様自動ドキュメント化 (`components/DocumentViewer.tsx`)

作成したフロー内の「インプット接続」「作成した全計算フィールドの数式」「最終アウトプット先」を
綺麗に集計し、マークダウン形式のテーブルとして出力・コピーできる機能を実装します。

> 💡 指示プロンプト:
> `components/DocumentViewer.tsx` を作成してください。フローの全情報をスキャンし、以下のような
> Markdown形式の仕様ドキュメントを生成するコンポーネントを構築してください。
> - データ入力元の一覧（データベース接続名やCSVなどのファイルパス）
> - 計算フィールド一覧（どのステップで、どのような数式 Formula で記述されているか）
> - 出力先情報一覧
> - 「Markdownをコピーする」ボタンの実装（`document.execCommand('copy')` 等を利用しブラウザ
>   互換性を担保）

### ⚖️ Phase 5: フロー比較ツール (`utils/tflDiff.ts` & `components/DiffViewer.tsx`)

新旧2つのファイルをアップロードさせ、変更差分をビジュアル表示します。

比較ロジックの定義:

- **IDの比較**: AにあってBにない＝削除されたステップ / BにあってAにない＝追加されたステップ
- **変更の比較**: ステップ名、結合条件、あるいは計算フィールド内の数式が変更された箇所を特定し、
  行単位の差分（Before/After）を抽出。

> 💡 指示プロンプト:
> 新旧2つのフローファイルを比較して、変更点をマニアックに比較できる `utils/tflDiff.ts` と、
> それを表示する `components/DiffViewer.tsx` を作成してください。ステップ単位の追加/削除だけでなく、
> 特定のクレンジングステップ内で「計算フィールドの記述が変わった」などの差分を赤・緑の
> ハイライトで人間が読みやすく表示するUIにしてください。

---

## 4. 🛠️ 開発開始のためのセットアップ・コマンド

```bash
npx create-next-app@latest tpfa --typescript --tailwind --app
cd tpfa
npm install jszip @xyflow/react lucide-react
```

> その後、AIエディタに以下のように指示して開発を始めます。
> 「作成された `tableau-prep-analyzer-spec.md` に従って、まずは `utils/tflParser.ts` と
> `app/page.tsx` を作成して、ファイルのドラッグ＆ドロップとパース結果がプレビューできる
> 最小の構成（Phase 1）を実装してください。」

---

## 付録: 実装との差分メモ

実際の実装では、原典の仕様をベースにしつつ次の点を補強/調整しました（理由付き）。

- **配置**: アプリは `tpfa/` サブフォルダではなく **リポジトリ直下**に配置（同等の構成）。
- **shadcn/ui**: 依存を増やさず軽量に保つため、Tailwind + Lucide による自前コンポーネントで代替。
- **差分**: `diff-match-patch` は導入せず、**自作の LCS 語句単位 diff**（`diffWords`）で数式の
  細かな赤/緑ハイライトを実現。
- **パーサーの堅牢化**: Tableau のバージョン差に耐えるため、キーは大文字小文字無視・複数候補・
  `deepCollect` による深い探索で防御的に取得（[`./TFL_FORMAT.md`](./TFL_FORMAT.md) 参照）。
- **追加リンタールール**: 原典の3ルールに加え、孤立ノード・入力接続不明・出力なし を追加。
- **補助実装**: ノード詳細サイドパネル（`NodeDetailPanel.tsx`）、配色集約（`flowTheme.ts`）、
  自動レイアウト（`flowLayout.ts`）、検証用サンプル（`public/samples/`）と smoke-test を追加。
