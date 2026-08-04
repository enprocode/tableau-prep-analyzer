"use client";

import {
  UploadCloud,
  Workflow,
  ShieldCheck,
  FileText,
  GitCompareArrows,
  Shield,
  MousePointerClick,
  ArrowLeft,
  FileType2,
  Lightbulb,
} from "lucide-react";

interface Props {
  onBack: () => void;
  /** ランディングから開いた場合など、サンプル導線を出す */
  onTrySample?: () => void;
}

const FEATURES = [
  {
    icon: Workflow,
    title: "フロー図",
    body: "ステップを左（入力）から右（出力）へ自動配置して可視化します。ノードをクリックすると、計算フィールド・接続元・結合条件などの詳細が右側に表示されます。",
  },
  {
    icon: ShieldCheck,
    title: "健全性診断",
    body: "Late Filter（結合後のフィルタ）、空のクレンジングステップ、データ型未定義、出力なしなどを検出します。「〜を表示」を押すと該当ステップのフロー図へジャンプできます。",
  },
  {
    icon: FileText,
    title: "ドキュメント",
    body: "入力元・計算フィールド・出力先を Markdown の仕様書として自動生成します。クリップボードへコピー、または .md ファイルとして保存できます。",
  },
  {
    icon: GitCompareArrows,
    title: "フロー比較",
    body: "別の .tfl / .tflx を追加して差分を確認します。ステップの追加・削除・変更に加え、接続（トポロジー）の変更や数式の語句単位ハイライトも表示します。",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "ファイルを開く",
    body: "ランディング画面で .tfl / .tflx をドラッグ＆ドロップするか、クリックして選択します。「サンプルフローで試す」なら、手元にファイルがなくてもすぐ体験できます。",
  },
  {
    n: "2",
    title: "タブで機能を切り替える",
    body: "上部タブからフロー図・健全性診断・ドキュメント・フロー比較を切り替えます。診断のバッジはエラー／警告の件数です。",
  },
  {
    n: "3",
    title: "詳細を確認・共有する",
    body: "ノード詳細で変換内容を確認し、ドキュメントをコピー／保存してレビューに使えます。比較タブでは新旧フローの差分を一目で把握できます。",
  },
] as const;

/** アプリ内の使い方ガイド（クライアント完結・外部送信なし）。 */
export default function HelpGuide({ onBack, onTrySample }: Props) {
  return (
    <div className="tpfa-scroll flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft size={16} aria-hidden />
          戻る
        </button>

        <header className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Guide
          </p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            使い方
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Tableau Prep Flow Analyzer（TPFA）は、Tableau Prep のフローファイルを
            ブラウザ内だけで解析・可視化・診断・比較するツールです。
            アップロードしたデータが外部サーバーへ送信されることはありません。
          </p>
        </header>

        <section className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <Shield size={16} aria-hidden />
            プライバシー
          </h3>
          <p className="text-sm leading-relaxed text-emerald-700 dark:text-emerald-400">
            解析・診断・差分はすべてお使いのブラウザ内で完結します。サンプルの読み込みも
            同一オリジンの静的ファイルのみで、フロー内容を外部へ送りません。
          </p>
        </section>

        <section className="mb-10">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <FileType2 size={16} className="text-slate-400" aria-hidden />
            対応ファイル
          </h3>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                .tfl
              </span>
              {" — "}生の JSON 形式のフロー定義
            </li>
            <li className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                .tflx
              </span>
              {" — "}ZIP パッケージ（内部の flow 定義を自動抽出。
              .hyper 等の抽出データは無視します）
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <MousePointerClick size={16} className="text-slate-400" aria-hidden />
            基本的な流れ
          </h3>
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {s.n}
                </span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-10">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <UploadCloud size={16} className="text-slate-400" aria-hidden />
            各機能の見方
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li
                  key={f.title}
                  className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <Icon size={16} className="text-blue-600 dark:text-blue-400" aria-hidden />
                    {f.title}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {f.body}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Lightbulb size={16} aria-hidden />
            ヒント
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800/90 dark:text-amber-400/90">
            <li>
              大きな .tflx でも処理はブラウザ内で行います。応答が遅い場合は少し待つか、
              フローを分割して確認してください。
            </li>
            <li>
              診断の指摘はベストプラクティスの目安です。業務上必要な設計まで機械的に
              否定するものではありません。
            </li>
            <li>
              比較は主にステップ ID をキーにします。Prep 上でステップを作り直すと
              「削除＋追加」として出ることがあります。
            </li>
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            閉じる
          </button>
          {onTrySample && (
            <button
              type="button"
              onClick={onTrySample}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              サンプルフローで試す
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
