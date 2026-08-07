# AGENTS.md — TPFA 開発エージェント向けガイド

このファイルは、AI コーディングエージェント（Cursor / Claude Code 等）および人間の開発者が
**Tableau Prep Flow Analyzer (TPFA)** を安全かつ一貫した方法で拡張するための運用ガイドです。
作業を始める前に必ず一読してください。

> 📚 関連ドキュメント
> - 元の設計書（原典）→ [`docs/SPEC.md`](./docs/SPEC.md)
> - ドメイン知識・拡張スキル → [`SKILL.md`](./SKILL.md)
> - 設計の詳細 → [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
> - `.tfl` / `.tflx` 形式リファレンス → [`docs/TFL_FORMAT.md`](./docs/TFL_FORMAT.md)
> - 機能追加の手順 → [`docs/EXTENDING.md`](./docs/EXTENDING.md)

---

## 1. プロジェクトの目的

Tableau Prep のフローファイル（`.tfl` / `.tflx`）を **ブラウザ内で完結** して
パース・可視化・診断・比較するオールインワン Web アプリ。

最重要原則:

1. **完全フロントエンド完結（サーバーレス）**。ユーザーのデータを外部送信しない。
   - API ルート / サーバーアクション / DB / 外部 fetch を **追加しない**。
   - 解析・診断・差分はすべてクライアントサイド（ブラウザ）で実行する。
2. **静的ホスティング可能**（Vercel / GitHub Pages）。ビルド成果物は静的であること。
3. **堅牢なパース**。Tableau Prep はバージョンによりスキーマが揺れるため、
   防御的・ヒューリスティックな実装を維持する（[`SKILL.md`](./SKILL.md) 参照）。

---

## 2. 技術スタック

| 領域 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js (App Router) + TypeScript |
| スタイル | Tailwind CSS v4 |
| アイコン | `lucide-react` |
| グラフ描画 | React Flow (`@xyflow/react`) |
| ZIP 解凍 | `jszip` |
| 差分 | 自作ロジック（`utils/tflDiff.ts`、LCS 語句 diff を含む） |

---

## 3. よく使うコマンド

```bash
npm install                      # 依存関係のインストール
npm run dev                      # 開発サーバー (http://localhost:3000)
npm run build                    # 本番ビルド（型チェックを含む）
npm run start                    # 本番サーバー
npm run lint                     # ESLint（Next 16 では `next lint` は廃止、これを使う）
npm run smoke                    # パーサー/リンター/差分のロジック動作確認
```

**完了の定義（Definition of Done）**: 変更後は最低限 `npm run lint` と `npm run build` を
両方パスさせること。ロジック（`utils/`）を触った場合は `scripts/smoke-test.mts` も実行する。

---

## 4. ディレクトリ構成と責務

```
app/                  # Next.js App Router（UI のエントリ）
  layout.tsx          #   ルートレイアウト/メタデータ
  page.tsx            #   メインダッシュボード（アップロード & タブ）
  globals.css         #   Tailwind + React Flow スタイル
components/           # プレゼンテーション層（"use client"）
  FlowVisualizer.tsx  #   Phase 2: フロー図
  NodeDetailPanel.tsx #   Phase 2: ノード詳細サイドパネル
  LinterAlerts.tsx    #   Phase 3: 診断結果 UI
  DocumentViewer.tsx  #   Phase 4: Markdown ドキュメント
  DiffViewer.tsx      #   Phase 5: 差分 UI
  HelpGuide.tsx       #   アプリ内の使い方ガイド
utils/                # ロジック層（UI 非依存・純粋関数中心）
  tflParser.ts        #   Phase 1: パース・正規化・共通型
  flowTheme.ts        #   ノードタイプ別の配色/アイコン
  flowLayout.ts       #   自動レイアウト
  tflLinter.ts        #   Phase 3: 静的解析ルール
  tflDiff.ts          #   Phase 5: 差分抽出 + 語句 diff
public/samples/       # 動作確認用サンプルフロー (v1/v2)
scripts/smoke-test.mts# ロジックの簡易検証（tsconfig/eslint の対象外）
docs/                 # 詳細ドキュメント
```

**レイヤリングの原則**:
- `utils/` は **UI / React / DOM に依存しない**純粋ロジックに保つ（テスト容易性のため）。
- `components/` は `utils/` を呼び出して描画するだけにする。ビジネスロジックを UI に書かない。
- 新しい解析・診断・差分ロジックは必ず `utils/` 側に実装する。

---

## 5. コーディング規約

- **言語/型**: TypeScript strict。`any` は外部 JSON 境界（パーサー入力）に限定する。
  共通型は `utils/tflParser.ts` の `FlowNode` / `FlowConnection` / `ParsedFlow` を再利用する。
- **import エイリアス**: `@/*`（リポジトリルート起点）。相対パスより優先。
- **クライアントコンポーネント**: ブラウザ API / state を使うものは先頭に `"use client";`。
- **スタイル**: Tailwind ユーティリティを基本とする。色は `utils/flowTheme.ts` に集約し、
  個別コンポーネントへ配色をハードコードしない。
- **コメント**: 「何をしているか」ではなく「なぜそうするか（意図・トレードオフ・制約）」を書く。
- **国際化**: UI 文言は日本語。ユーザー向けメッセージ（リンターの tip 等）も日本語で統一する。
- **アクセシビリティ**: ボタンには `aria-label`、アイコンのみのコントロールに注意。

---

## 6. やってはいけないこと（Guardrails）

- ❌ サーバー側処理・外部 API・テレメトリ・アナリティクスの追加（プライバシー原則違反）。
- ❌ `utils/` への React / DOM 依存の持ち込み。
- ❌ 配色やノードタイプ判定のロジックを複数箇所へ分散させること
  （`flowTheme.ts` / `tflParser.ts` の `classifyNodeType` に集約する）。
- ❌ パーサーで「特定バージョンの正確なキー名」に強く依存すること。
  キーは大文字小文字無視・複数候補・深い探索で防御的に取得する。
- ❌ 巨大ファイルを同期処理でブロックすること。`deepCollect` の上限などの安全弁を維持する。

---

## 7. 変更時のチェックリスト

- [ ] ロジックは `utils/` に、表示は `components/` に置いたか
- [ ] 新しいノードタイプ/配色は `flowTheme.ts` と `classifyNodeType` に追加したか
- [ ] `public/samples/` のサンプルで挙動を確認したか（必要なら新サンプルを追加）
- [ ] `npm run lint` がクリーンか
- [ ] `npm run build` が成功するか
- [ ] `npm run smoke` が期待通りか（ロジック変更時）
- [ ] ユーザー向け文言は日本語か

---

## 8. Git 運用

- 機能単位（フェーズ単位）で論理的にコミットを分割する。
- コミットメッセージは日本語可。種別プレフィックス（`feat` / `fix` / `docs` / `chore` 等）を付ける。
- ブランチ名は `cursor/<descriptive-name>` 形式（小文字）。
- 強制プッシュ・amend は明示の指示がない限り行わない。
