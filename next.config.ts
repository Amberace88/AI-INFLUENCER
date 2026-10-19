import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // reference photo uploads go through a server action (max 8 × 10 MB per batch, see actions.ts)
    serverActions: { bodySizeLimit: "40mb" },
  },
};

export default nextConfig;
