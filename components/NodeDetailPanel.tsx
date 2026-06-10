"use client";

import { X } from "lucide-react";
import type { FlowNode } from "@/utils/tflParser";
import { getNodeTheme } from "@/utils/flowTheme";

interface Props {
  node: FlowNode | null;
  onClose: () => void;
}

/**
 * ノードをクリックした際に、そのステップで作成された計算フィールドや
 * 接続ソースなどの詳細を表示するサイドパネル。
 */
export default function NodeDetailPanel({ node, onClose }: Props) {
  if (!node) return null;
  const theme = getNodeTheme(node.type);
  const Icon = theme.icon;
  const meta = node.metaData ?? {};
  const actions = node.actions ?? [];
  const calcFields = actions.filter((a) => a.kind === "calculatedField");
  const otherActions = actions.filter((a) => a.kind !== "calculatedField");

  return (
    <aside className="tpfa-scroll absolute right-0 top-0 z-10 flex h-full w-80 flex-col overflow-y-auto border-l border-slate-200 bg-white/95 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div
        className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700"
        style={{ borderTopColor: theme.color }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: theme.bg, color: theme.color }}
          >
            <Icon size={18} />
          </span>
          <div className="overflow-hidden">
            <p className="truncate text-sm font-semibold">{node.name}</p>
            <span
              className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${theme.badgeClass}`}
            >
              {theme.label}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="閉じる"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4 text-sm">
        {node.description && (
          <Section title="説明">
            <p className="text-slate-600 dark:text-slate-300">
              {node.description}
            </p>
          </Section>
        )}

        {/* 接続ソース / 出力先 */}
        {(meta.connectionType ||
          meta.connectionName ||
          meta.filePath ||
          meta.outputPath) && (
          <Section title={node.type === "Output" ? "出力先" : "接続ソース"}>
            <dl className="space-y-1">
              {meta.connectionType && (
                <Row label="種類" value={String(meta.connectionType)} />
              )}
              {meta.connectionName && (
                <Row label="名称" value={String(meta.connectionName)} />
              )}
              {meta.filePath && (
                <Row label="パス" value={String(meta.filePath)} mono />
              )}
              {meta.outputPath && (
                <Row label="出力" value={String(meta.outputPath)} mono />
              )}
            </dl>
          </Section>
        )}

        {/* 結合情報 */}
        {meta.joinType && (
          <Section title="結合設定">
            <Row label="タイプ" value={String(meta.joinType).toUpperCase()} />
            {meta.joinConditions?.map((c, i) => (
              <Row key={i} label={`条件 ${i + 1}`} value={c} mono />
            ))}
          </Section>
        )}

        {/* 計算フィールド */}
        {calcFields.length > 0 && (
          <Section title={`計算フィールド (${calcFields.length})`}>
            <ul className="space-y-2">
              {calcFields.map((a, i) => (
                <li
                  key={i}
                  className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {a.field}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-emerald-700 dark:text-emerald-400">
                    {a.formula}
                  </pre>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* その他のアクション */}
        {otherActions.length > 0 && (
          <Section title={`その他の操作 (${otherActions.length})`}>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              {otherActions.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-400">•</span>
                  <span>{a.detail ?? a.formula ?? a.kind}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* フィールド一覧 */}
        {meta.fields && meta.fields.length > 0 && (
          <Section title={`フィールド (${meta.fields.length})`}>
            <ul className="flex flex-wrap gap-1">
              {meta.fields.map((f, i) => (
                <li
                  key={i}
                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                  title={f.type}
                >
                  {f.name}
                  {f.type && (
                    <span className="ml-1 text-slate-400">{f.type}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="メタ情報">
          <Row label="ノードID" value={node.id} mono />
          {meta.nodeType && <Row label="nodeType" value={String(meta.nodeType)} mono />}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2 text-xs">
      <dt className="w-16 shrink-0 text-slate-400">{label}</dt>
      <dd
        className={`break-all text-slate-700 dark:text-slate-200 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
