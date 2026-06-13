import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-expect-error - Next 15+ deprecates eslint config in NextConfig but Vercel might still need it
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
