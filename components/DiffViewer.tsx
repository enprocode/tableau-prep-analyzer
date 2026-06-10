"use client";

import { useMemo } from "react";
import { Plus, Minus, Pencil, ArrowRight } from "lucide-react";
import type { ParsedFlow } from "@/utils/tflParser";
import {
  diffFlows,
  diffWords,
  type FieldChange,
  type StepDiff,
  type StepStatus,
} from "@/utils/tflDiff";
import { getNodeTheme } from "@/utils/flowTheme";

interface Props {
  before: ParsedFlow;
  after: ParsedFlow;
}

const STATUS_META: Record<
  StepStatus,
  { label: string; badge: string; icon: typeof Plus; border: string }
> = {
  added: {
    label: "追加",
    badge: "bg-green-100 text-green-700 border-green-300",
    icon: Plus,
    border: "border-l-green-500",
  },
  removed: {
    label: "削除",
    badge: "bg-red-100 text-red-700 border-red-300",
    icon: Minus,
    border: "border-l-red-500",
  },
  modified: {
    label: "変更",
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    icon: Pencil,
    border: "border-l-amber-500",
  },
  unchanged: {
    label: "変更なし",
    badge: "bg-slate-100 text-slate-500 border-slate-300",
    icon: ArrowRight,
    border: "border-l-slate-300",
  },
};

/** 2 つのフローのビジュアル差分比較。 */
export default function DiffViewer({ before, after }: Props) {
  const diff = useMemo(() => diffFlows(before, after), [before, after]);
  const visibleSteps = diff.steps.filter((s) => s.status !== "unchanged");

  return (
    <div className="tpfa-scroll mx-auto h-full max-w-4xl overflow-y-auto p-6">
      {/* ファイル見出し */}
      <div className="mb-4 flex items-center justify-center gap-3 text-sm">
        <span className="rounded-md border border-red-300 bg-red-50 px-3 py-1 font-medium text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
          旧: {before.fileName ?? "Flow A"}
        </span>
        <ArrowRight size={18} className="text-slate-400" />
        <span className="rounded-md border border-green-300 bg-green-50 px-3 py-1 font-medium text-green-700 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300">
          新: {after.fileName ?? "Flow B"}
        </span>
      </div>

      {/* サマリー */}
      <div className="mb-6 grid grid-cols-4 gap-3 text-center">
        <Stat label="追加" value={diff.summary.added} className="text-green-600" />
        <Stat label="削除" value={diff.summary.removed} className="text-red-600" />
        <Stat
          label="変更"
          value={diff.summary.modified}
          className="text-amber-600"
        />
        <Stat
          label="変更なし"
          value={diff.summary.unchanged}
          className="text-slate-500"
        />
      </div>

      {visibleSteps.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          2 つのフローに差分はありません。
        </p>
      ) : (
        <ul className="space-y-3">
          {visibleSteps.map((step) => (
            <StepCard key={step.nodeId} step={step} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StepCard({ step }: { step: StepDiff }) {
  const meta = STATUS_META[step.status];
  const Icon = meta.icon;
  const theme = getNodeTheme(step.type);

  return (
    <li
      className={`rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${meta.border}`}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0 text-slate-500" />
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badge}`}
        >
          {meta.label}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${theme.badgeClass}`}
        >
          {step.type}
        </span>
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {step.name}
        </span>
      </div>

      {step.changes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {step.changes.map((c, i) => (
            <ChangeRow key={i} change={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ChangeRow({ change }: { change: FieldChange }) {
  return (
    <li className="rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-900/60">
      <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">
        {change.label}
      </p>
      {change.kind === "changed" &&
      change.before !== undefined &&
      change.after !== undefined ? (
        <InlineWordDiff before={change.before} after={change.after} />
      ) : (
        <div className="space-y-1">
          {change.before !== undefined && (
            <pre className="whitespace-pre-wrap break-words rounded bg-red-50 px-2 py-1 font-mono text-red-700 line-through decoration-red-400 dark:bg-red-950/40 dark:text-red-300">
              - {change.before}
            </pre>
          )}
          {change.after !== undefined && (
            <pre className="whitespace-pre-wrap break-words rounded bg-green-50 px-2 py-1 font-mono text-green-700 dark:bg-green-950/40 dark:text-green-300">
              + {change.after}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

/** 数式などの細かな変更を、語句単位の赤/緑ハイライトで表示する。 */
function InlineWordDiff({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  const segments = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div className="space-y-1">
      <pre className="whitespace-pre-wrap break-words rounded bg-red-50 px-2 py-1 font-mono dark:bg-red-950/30">
        <span className="select-none text-red-400">- </span>
        {segments
          .filter((s) => s.type !== "added")
          .map((s, i) => (
            <span
              key={i}
              className={
                s.type === "removed"
                  ? "bg-red-200 text-red-900 dark:bg-red-800/60 dark:text-red-100"
                  : "text-slate-600 dark:text-slate-300"
              }
            >
              {s.value}
            </span>
          ))}
      </pre>
      <pre className="whitespace-pre-wrap break-words rounded bg-green-50 px-2 py-1 font-mono dark:bg-green-950/30">
        <span className="select-none text-green-500">+ </span>
        {segments
          .filter((s) => s.type !== "removed")
          .map((s, i) => (
            <span
              key={i}
              className={
                s.type === "added"
                  ? "bg-green-200 text-green-900 dark:bg-green-800/60 dark:text-green-100"
                  : "text-slate-600 dark:text-slate-300"
              }
            >
              {s.value}
            </span>
          ))}
      </pre>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <p className={`text-2xl font-bold ${className}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
