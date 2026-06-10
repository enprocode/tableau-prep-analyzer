import type { FlowNodeType } from "./tflParser";
import {
  Database,
  Brush,
  GitMerge,
  Rows3,
  Sigma,
  Repeat2,
  FileOutput,
  Code2,
  Box,
  type LucideIcon,
} from "lucide-react";

/**
 * ノードタイプごとの配色・ラベル・アイコンを一元管理する。
 * Tableau Prep 風の配色（Input=青 / Clean=緑 / Join=オレンジ / Output=赤）。
 */
export interface NodeTheme {
  label: string;
  /** バッジ・枠線などのメインカラー (hex) */
  color: string;
  /** ノード背景用の淡い色 (hex) */
  bg: string;
  /** Tailwind のテキスト/背景/ボーダー ユーティリティ */
  badgeClass: string;
  icon: LucideIcon;
}

export const NODE_THEME: Record<FlowNodeType, NodeTheme> = {
  Input: {
    label: "入力 (Input)",
    color: "#2563eb",
    bg: "#eff6ff",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-300",
    icon: Database,
  },
  Clean: {
    label: "クレンジング (Clean)",
    color: "#16a34a",
    bg: "#f0fdf4",
    badgeClass: "bg-green-100 text-green-700 border-green-300",
    icon: Brush,
  },
  Join: {
    label: "結合 (Join)",
    color: "#ea580c",
    bg: "#fff7ed",
    badgeClass: "bg-orange-100 text-orange-700 border-orange-300",
    icon: GitMerge,
  },
  Union: {
    label: "ユニオン (Union)",
    color: "#9333ea",
    bg: "#faf5ff",
    badgeClass: "bg-purple-100 text-purple-700 border-purple-300",
    icon: Rows3,
  },
  Aggregate: {
    label: "集計 (Aggregate)",
    color: "#0891b2",
    bg: "#ecfeff",
    badgeClass: "bg-cyan-100 text-cyan-700 border-cyan-300",
    icon: Sigma,
  },
  Pivot: {
    label: "ピボット (Pivot)",
    color: "#c026d3",
    bg: "#fdf4ff",
    badgeClass: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300",
    icon: Repeat2,
  },
  Output: {
    label: "出力 (Output)",
    color: "#dc2626",
    bg: "#fef2f2",
    badgeClass: "bg-red-100 text-red-700 border-red-300",
    icon: FileOutput,
  },
  Script: {
    label: "スクリプト (Script)",
    color: "#475569",
    bg: "#f8fafc",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    icon: Code2,
  },
  Other: {
    label: "その他 (Other)",
    color: "#64748b",
    bg: "#f8fafc",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
    icon: Box,
  },
};

export function getNodeTheme(type: string): NodeTheme {
  return NODE_THEME[(type as FlowNodeType)] ?? NODE_THEME.Other;
}
