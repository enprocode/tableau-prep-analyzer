# Tableau Prep Flow Analyzer (TPFA)

Tableau Prep のフローファイル（`.tfl` / `.tflx`）を **ブラウザ内で完結** してパース・可視化・診断・比較するオールインワン Web アプリケーションです。

> 🔒 すべての処理はブラウザ内（クライアントサイド）で実行されます。アップロードしたデータが外部サーバーへ送信されることはありません。Vercel や GitHub Pages 等の静的ホスティングにそのままデプロイできます。

## ✨ 主な機能（実装フェーズ）

| フェーズ | 機能 | 主なファイル |
| --- | --- | --- |
| **Phase 1** | コアパースエンジン（`.tfl` / `.tflx` の読み込み・ZIP 解凍・正規化） | `utils/tflParser.ts` |
| **Phase 2** | インタラクティブなフロー図の可視化（React Flow / 自動レイアウト / 詳細パネル） | `components/FlowVisualizer.tsx`, `utils/flowLayout.ts` |
| **Phase 3** | 健全性・ベストプラクティス診断（Late Filter / Empty Step / Missing Type 等） | `utils/tflLinter.ts`, `components/LinterAlerts.tsx` |
| **Phase 4** | 仕様の自動ドキュメント化（Markdown 生成 / コピー / ダウンロード） | `components/DocumentViewer.tsx` |
| **Phase 5** | 新旧 2 フローのビジュアル差分比較（ステップ単位＋接続（トポロジー）の変更＋数式の語句単位ハイライト） | `utils/tflDiff.ts`, `components/DiffViewer.tsx` |

## 🚀 技術スタック

- **フレームワーク**: Next.js (App Router) + TypeScript
- **UI / デザイン**: Tailwind CSS + Lucide Icons
- **インタラクティブグラフ**: React Flow (`@xyflow/react`)
- **ZIP 解凍 (.tflx 用)**: `jszip`
- **差分比較**: 自作のオブジェクト比較ロジック（LCS による語句単位 diff を含む）

## 📚 開発ドキュメント

今後の開発・拡張のためのドキュメントを用意しています。

| ドキュメント | 内容 |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | 開発エージェント向けの運用ガイド・コマンド・規約・ガードレール |
| [`SKILL.md`](./SKILL.md) | Tableau Prep 解析のドメイン知識と拡張スキル |
| [`docs/SPEC.md`](./docs/SPEC.md) | 元の設計書（開発ロードマップ＆実装仕様書の原典）+ 実装との差分メモ |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | システム構成・データフロー・データモデル |
| [`docs/TFL_FORMAT.md`](./docs/TFL_FORMAT.md) | `.tfl` / `.tflx` 形式リファレンスと解析方針 |
| [`docs/EXTENDING.md`](./docs/EXTENDING.md) | 機能追加の具体的な手順（ノードタイプ/リンター/差分/ドキュメント/タブ） |

## 🛠️ セットアップ

```bash
npm install
npm run dev      # 開発サーバー (http://localhost:3000)
npm run build    # 本番ビルド（静的出力 → out/）
npm run start    # 本番サーバー（静的ホスティングでは不要）
npm run lint     # ESLint
npm run smoke    # パーサー / リンター / 差分のロジック検証
```

## 🌐 デプロイ

`next.config.ts` で `output: "export"` を有効にしており、`npm run build` の成果物は `out/` に静的ファイルとして出力されます。

| ホスティング | 手順の目安 |
| --- | --- |
| **Vercel** | リポジトリを接続してデプロイ（Framework Preset: Next.js） |
| **GitHub Pages** | `out/` を Pages に公開。プロジェクトサイトの場合は `basePath` / `assetPrefix` の設定が別途必要 |

> 🔒 アップロードされたフローデータはブラウザ内のみで処理され、外部へ送信されません（サンプル読み込みも同一オリジンの静的ファイルです）。

## 📂 プロジェクト構造

```
.
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # メインダッシュボード（アップロード & タブ切り替え）
│   └── globals.css
├── components/
│   ├── FlowVisualizer.tsx    # React Flow を使ったフロー図描画
│   ├── NodeDetailPanel.tsx   # ノード詳細サイドパネル
│   ├── LinterAlerts.tsx      # 健全性診断結果の表示
│   ├── DocumentViewer.tsx    # 自動生成ドキュメント（Markdown / コピー）
│   ├── DiffViewer.tsx        # 2 フローのビジュアル差分比較
│   └── HelpGuide.tsx         # アプリ内の使い方ガイド
├── utils/
│   ├── tflParser.ts          # .tfl/.tflx のパース・ZIP 解凍・共通型定義
│   ├── tflLinter.ts          # 静的解析（Linter）ルール
│   ├── tflDiff.ts            # 2 つのフローの差分抽出
│   ├── flowLayout.ts         # 簡易自動レイアウト
│   └── flowTheme.ts          # ノードタイプ別の配色・アイコン
├── public/samples/           # 動作確認用サンプルフロー (v1 / v2)
└── scripts/smoke-test.mts    # ロジックの動作確認用スクリプト（tsx で実行）
```

## 🧪 動作確認

ロジック（パーサー / リンター / 差分）の単体動作はサンプルファイルで確認できます。

```bash
npm run smoke
# または: npx tsx scripts/smoke-test.mts
```

アプリ起動後、ランディング画面の「サンプルフローで試す」からサンプルを読み込めます。
比較タブでは「サンプル (v2) と比較する」で差分表示を確認できます。
ヘッダーまたはランディングの「使い方」から、アプリ内ガイドを開けます。

## 📥 対応ファイル形式

- **`.tfl`**: 生の JSON データ（フロー定義そのもの）
- **`.tflx`**: ZIP パッケージ（内部の `flow` 定義を自動抽出。`.hyper` 等の抽出ファイルは無視）
