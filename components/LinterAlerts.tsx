"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import type { ParsedFlow } from "@/utils/tflParser";
import { lintFlow, summarizeAlerts, type LintAlert } from "@/utils/tflLinter";

interface Props {
  flow: ParsedFlow;
  onSelectNode?: (nodeId: string) => void;
}

const SEVERITY_STYLE: Record<
  LintAlert["severity"],
  { icon: typeof Info; label: string; badge: string; ring: string }
> = {
  error: {
    icon: AlertCircle,
    label: "エラー",
    badge: "bg-red-100 text-red-700 border-red-300",
    ring: "border-l-red-500",
  },
  warning: {
    icon: AlertTriangle,
    label: "警告",
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    ring: "border-l-amber-500",
  },
  info: {
    icon: Info,
    label: "情報",
    badge: "bg-sky-100 text-sky-700 border-sky-300",
    ring: "border-l-sky-500",
  },
};

/** 健全性診断結果のビジュアル表示。 */
export default function LinterAlerts({ flow, onSelectNode }: Props) {
  const alerts = useMemo(() => lintFlow(flow), [flow]);
  const summary = useMemo(() => summarizeAlerts(alerts), [alerts]);

  return (
    <div className="tpfa-scroll mx-auto h-full max-w-3xl overflow-y-auto p-6">
      {/* サマリー */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <SummaryCard
          label="エラー"
          count={summary.error}
          className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        />
        <SummaryCard
          label="警告"
          count={summary.warning}
          className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        />
        <SummaryCard
          label="情報"
          count={summary.info}
          className="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
        />
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 py-16 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 size={48} />
          <p className="text-lg font-semibold">問題は検出されませんでした</p>
          <p className="text-sm">このフローはベストプラクティスに準拠しています。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => {
            const style = SEVERITY_STYLE[a.severity];
            const Icon = style.icon;
            return (
              <li
                key={a.id}
                className={`rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${style.ring}`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    size={20}
                    className="mt-0.5 shrink-0 text-slate-500"
                  />
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${style.badge}`}
                      >
                        {style.label}
                      </span>
                      {a.nodeId && onSelectNode && (
                        <button
                          onClick={() => onSelectNode(a.nodeId)}
                          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {a.nodeName} を表示
                        </button>
                      )}
                      {a.nodeId && !onSelectNode && (
                        <span className="text-xs text-slate-400">
                          {a.nodeName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {a.message}
                    </p>
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Lightbulb size={14} className="mt-0.5 shrink-0" />
                      <span>{a.tip}</span>
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className: string;
}) {
  return (
    <div className={`rounded-xl p-4 text-center ${className}`}>
      <p className="text-3xl font-bold">{count}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}
