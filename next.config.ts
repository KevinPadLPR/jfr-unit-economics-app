import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Brand assets in public/brand/*.svg are served through next/image.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
