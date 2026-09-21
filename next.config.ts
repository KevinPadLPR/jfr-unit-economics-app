import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // src/lib/db.ts reads data/dev.sqlite via a dynamic fs path (process.cwd()
  // + "data/dev.sqlite"), which Next's automatic output file tracing can't
  // detect statically — without this, the file gets left out of the Vercel
  // serverless bundle and every page 500s in production despite building fine.
  outputFileTracingIncludes: {
    "/**/*": ["./data/dev.sqlite"],
  },
};

export default nextConfig;
