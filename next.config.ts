import type { NextConfig } from "next";

/**
 * 静的ホスティング（Vercel / GitHub Pages 等）向けに `output: "export"` を有効化。
 * API ルートやサーバーアクションは持たないため、完全静的出力で問題ない。
 */
const nextConfig: NextConfig = {
  output: "export",
  images: {
    // 静的エクスポートでは Image Optimization API が使えないため無効化
    unoptimized: true,
  },
};

export default nextConfig;
