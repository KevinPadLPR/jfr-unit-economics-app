import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // src/lib/db.ts reads data/dev.sqlite via a dynamic fs path (process.cwd()
  // + "data/dev.sqlite"), which Next's automatic output file tracing can't
  // detect statically — without this, the file gets left out of the Vercel
  // serverless bundle and every page 500s in production despite building fine.
  outputFileTracingIncludes: {
    "/**/*": ["./data/dev.sqlite"],
  },
  // One app, not two: the client's own cattle-management office app (public/client-app, a
  // git submodule) is the single front door. Our own dashboard pages moved to /dashboard/*
  // specifically so they don't collide with this -- the Dashboard tab's iframe inside
  // client-app's index.html points at /dashboard, never at "/".
  async rewrites() {
    return [{ source: "/", destination: "/client-app/index.html" }];
  },
};

export default nextConfig;
