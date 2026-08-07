"use client";

import { useMemo, useState } from "react";
import { Copy, Check, Download, FileText } from "lucide-react";
import {
  collectCalculatedFields,
  collectInputs,
  collectOutputs,
  type ParsedFlow,
} from "@/utils/tflParser";

interface Props {
  flow: ParsedFlow;
}

/** Markdown のテーブル用にセル内容をエスケープする。 */
function esc(s: string | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** フロー全体をスキャンして Markdown 形式の仕様ドキュメントを生成する。 */
export function generateMarkdown(flow: ParsedFlow): string {
  const inputs = collectInputs(flow);
  const outputs = collectOutputs(flow);
  const calcs = collectCalculatedFields(flow);

  const lines: string[] = [];
  lines.push(`# フロー仕様書: ${flow.fileName ?? "Tableau Prep Flow"}`);
  lines.push("");
  lines.push(
    `> 自動生成 (TPFA) — ステップ数: ${
      Object.keys(flow.nodes).length
    } / 入力: ${inputs.length} / 計算フィールド: ${calcs.length} / 出力: ${outputs.length}`
  );
  lines.push("");

  // --- データ入力元 ---
  lines.push("## 1. データ入力元");
  lines.push("");
  if (inputs.length === 0) {
    lines.push("_入力ステップはありません。_");
  } else {
    lines.push("| ステップ名 | 接続種類 | ソース / パス |");
    lines.push("| --- | --- | --- |");
    for (const n of inputs) {
      const m = n.metaData ?? {};
      lines.push(
        `| ${esc(n.name)} | ${esc(
          String(m.connectionType ?? "-")
        )} | ${esc(
          String(m.filePath ?? m.connectionName ?? "-")
        )} |`
      );
    }
  }
  lines.push("");

  // --- 計算フィールド ---
  lines.push("## 2. 計算フィールド一覧");
  lines.push("");
  if (calcs.length === 0) {
    lines.push("_計算フィールドはありません。_");
  } else {
    lines.push("| ステップ | フィールド名 | 数式 (Formula) |");
    lines.push("| --- | --- | --- |");
    for (const c of calcs) {
      lines.push(
        `| ${esc(c.stepName)} | ${esc(c.field)} | \`${esc(c.formula)}\` |`
      );
    }
  }
  lines.push("");

  // --- 出力先 ---
  lines.push("## 3. 出力先情報");
  lines.push("");
  if (outputs.length === 0) {
    lines.push("_出力ステップはありません。_");
  } else {
    lines.push("| ステップ名 | 出力タイプ | 出力先 |");
    lines.push("| --- | --- | --- |");
    for (const n of outputs) {
      const m = n.metaData ?? {};
      lines.push(
        `| ${esc(n.name)} | ${esc(
          String(m.outputType ?? m.nodeType ?? "-")
        )} | ${esc(String(m.outputPath ?? "-"))} |`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

/** クリップボードへコピー（互換性のため execCommand フォールバックを実装）。 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // フォールバックへ
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function DocumentViewer({ flow }: Props) {
  const markdown = useMemo(() => generateMarkdown(flow), [flow]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(markdown);
    if (ok) {
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopied(false);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(flow.fileName ?? "flow").replace(/\.[^.]+$/, "")}_spec.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tpfa-scroll mx-auto flex h-full max-w-4xl flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText size={20} className="text-slate-500" />
          仕様ドキュメント (Markdown)
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download size={15} aria-hidden />
            .md 保存
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied
              ? "コピーしました"
              : copyError
                ? "コピーに失敗しました"
                : "Markdownをコピー"}
          </button>
        </div>
      </div>

      <pre className="tpfa-scroll flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {markdown}
      </pre>
    </div>
  );
}
