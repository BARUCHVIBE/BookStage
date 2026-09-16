import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The largest accepted files are private contracts/production documents
    // (10 MiB). Keep enough room for multipart headers while the endpoints
    // continue enforcing their own, narrower per-file limits.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
