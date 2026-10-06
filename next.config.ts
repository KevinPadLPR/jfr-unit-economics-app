import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One app, not two: the client's own cattle-management office app (public/client-app, a
  // git submodule) is the single front door. Our own dashboard pages moved to /dashboard/*
  // specifically so they don't collide with this -- the Dashboard tab's iframe inside
  // client-app's index.html points at /dashboard, never at "/".
  async rewrites() {
    return [{ source: "/", destination: "/client-app/index.html" }];
  },
};

export default nextConfig;
