"use client";

import { useCallback, useRef, useState } from "react";
import {
  UploadCloud,
  Workflow,
  ShieldCheck,
  FileText,
  GitCompareArrows,
  Loader2,
  AlertCircle,
  FileStack,
  X,
  ExternalLink,
} from "lucide-react";
import { parseFlowFile, type ParsedFlow } from "@/utils/tflParser";
import { lintFlow, summarizeAlerts } from "@/utils/tflLinter";
import FlowVisualizer from "@/components/FlowVisualizer";
import LinterAlerts from "@/components/LinterAlerts";
import DocumentViewer from "@/components/DocumentViewer";
import DiffViewer from "@/components/DiffViewer";

type TabId = "flow" | "lint" | "doc" | "diff";

const TABS: { id: TabId; label: string; icon: typeof Workflow }[] = [
  { id: "flow", label: "フロー図", icon: Workflow },
  { id: "lint", label: "健全性診断", icon: ShieldCheck },
  { id: "doc", label: "ドキュメント", icon: FileText },
  { id: "diff", label: "フロー比較", icon: GitCompareArrows },
];

export default function Home() {
  const [flowA, setFlowA] = useState<ParsedFlow | null>(null);
  const [flowB, setFlowB] = useState<ParsedFlow | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("flow");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadFile = useCallback(
    async (file: File, slot: "A" | "B") => {
      setError(null);
      setLoading(true);
      try {
        const parsed = await parseFlowFile(file);
        if (slot === "A") {
          setFlowA(parsed);
          setSelectedNodeId(null);
        } else {
          setFlowB(parsed);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadSample = useCallback(
    async (slot: "A" | "B") => {
      setError(null);
      setLoading(true);
      try {
        const url =
          slot === "A"
            ? "/samples/superstore_v1.tfl"
            : "/samples/superstore_v2.tfl";
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], url.split("/").pop()!, {
          type: "application/json",
        });
        await loadFile(file, slot);
      } catch (e) {
        setError(`サンプルの読み込みに失敗しました: ${(e as Error).message}`);
        setLoading(false);
      }
    },
    [loadFile]
  );

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setActiveTab("flow");
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <Header
        hasFlow={!!flowA}
        onReset={() => {
          setFlowA(null);
          setFlowB(null);
          setSelectedNodeId(null);
          setError(null);
        }}
      />

      {error && (
        <div className="mx-auto mt-3 flex w-full max-w-5xl items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {!flowA ? (
        <LandingUploader
          loading={loading}
          onFile={(f) => loadFile(f, "A")}
          onSample={() => loadSample("A")}
        />
      ) : (
        <div className="flex flex-1 flex-col">
          {/* タブ */}
          <nav className="sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "border-blue-600 text-blue-600 dark:text-blue-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                  {tab.id === "lint" && <LintBadge flow={flowA} />}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
              <FileStack size={14} />
              {flowA.fileName}
            </div>
          </nav>

          {/* コンテンツ */}
          <main className="relative flex-1 overflow-hidden">
            <div className="absolute inset-0">
              {activeTab === "flow" && (
                <FlowVisualizer
                  flow={flowA}
                  selectedId={selectedNodeId}
                  onSelectId={setSelectedNodeId}
                />
              )}
              {activeTab === "lint" && (
                <LinterAlerts flow={flowA} onSelectNode={handleSelectNode} />
              )}
              {activeTab === "doc" && <DocumentViewer flow={flowA} />}
              {activeTab === "diff" && (
                <DiffTab
                  flowA={flowA}
                  flowB={flowB}
                  loading={loading}
                  onFileB={(f) => loadFile(f, "B")}
                  onSampleB={() => loadSample("B")}
                  onClearB={() => setFlowB(null)}
                />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header({
  hasFlow,
  onReset,
}: {
  hasFlow: boolean;
  onReset: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
          <Workflow size={20} />
        </span>
        <div>
          <h1 className="text-base font-bold leading-tight text-slate-900 dark:text-white">
            Tableau Prep Flow Analyzer
          </h1>
          <p className="text-[11px] text-slate-400">
            .tfl / .tflx をブラウザ内で安全に解析・可視化・診断・比較
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {hasFlow && (
          <button
            onClick={onReset}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            別のファイルを開く
          </button>
        )}
        <a
          href="https://www.tableau.com/products/prep"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-1 text-xs text-slate-400 hover:text-slate-600 sm:flex"
          aria-label="Tableau Prep"
        >
          Tableau Prep <ExternalLink size={14} />
        </a>
      </div>
    </header>
  );
}

function LintBadge({ flow }: { flow: ParsedFlow }) {
  const summary = summarizeAlerts(lintFlow(flow));
  const critical = summary.error + summary.warning;
  if (critical === 0) return null;
  return (
    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
      {critical}
    </span>
  );
}

function LandingUploader({
  loading,
  onFile,
  onSample,
}: {
  loading: boolean;
  onFile: (f: File) => void;
  onSample: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl text-center">
        <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-white">
          フローファイルをアップロード
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          すべての処理はブラウザ内で完結します。データが外部サーバーに送信されることはありません。
        </p>
        <Dropzone loading={loading} onFile={onFile} />
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <span className="text-slate-400">または</span>
          <button
            onClick={onSample}
            disabled={loading}
            className="font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            サンプルフローで試す
          </button>
        </div>
      </div>
    </div>
  );
}

function Dropzone({
  loading,
  onFile,
  compact,
}: {
  loading: boolean;
  onFile: (f: File) => void;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
        compact ? "p-6" : "p-10"
      } ${
        dragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-slate-300 bg-white hover:border-blue-400 dark:border-slate-600 dark:bg-slate-900"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".tfl,.tflx,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {loading ? (
        <Loader2 className="mb-2 animate-spin text-blue-500" size={compact ? 28 : 40} />
      ) : (
        <UploadCloud
          className="mb-2 text-slate-400"
          size={compact ? 28 : 40}
        />
      )}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {loading
          ? "解析中..."
          : "ここにファイルをドラッグ＆ドロップ、またはクリックして選択"}
      </p>
      {!compact && (
        <p className="mt-1 text-xs text-slate-400">
          対応形式: .tfl（生 JSON） / .tflx（ZIP パッケージ）
        </p>
      )}
    </div>
  );
}

function DiffTab({
  flowA,
  flowB,
  loading,
  onFileB,
  onSampleB,
  onClearB,
}: {
  flowA: ParsedFlow;
  flowB: ParsedFlow | null;
  loading: boolean;
  onFileB: (f: File) => void;
  onSampleB: () => void;
  onClearB: () => void;
}) {
  if (!flowB) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <h3 className="mb-1 text-lg font-semibold text-slate-800 dark:text-white">
            比較対象のフローを追加
          </h3>
          <p className="mb-5 text-sm text-slate-500">
            現在の「{flowA.fileName}」と比較する新しいフローファイルを
            アップロードしてください。
          </p>
          <Dropzone loading={loading} onFile={onFileB} compact />
          <button
            onClick={onSampleB}
            disabled={loading}
            className="mt-3 text-sm font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            サンプル (v2) と比較する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <button
        onClick={onClearB}
        className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
      >
        <X size={12} /> 比較対象を変更
      </button>
      <DiffViewer before={flowA} after={flowB} />
    </div>
  );
}
