import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // `npm run build` also writes .next/standalone: a self-contained server the Mac app bundles
  output: "standalone",
  // this folder is the app, even when it sits next to other projects with their own lockfiles
  outputFileTracingRoot: path.resolve("."),
  turbopack: { root: path.resolve(".") },
  // every picture is a data URL from IndexedDB, so the image optimiser (and sharp) is never needed
  images: { unoptimized: true },
};

export default nextConfig;
