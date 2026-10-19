import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // stops Next from picking up a stray package-lock.json in a parent folder
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    // reference photo uploads go through a server action (max 8 × 10 MB per batch, see actions.ts)
    serverActions: { bodySizeLimit: "40mb" },
  },
};

export default nextConfig;
