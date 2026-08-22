import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Branding covers allow 5 MB. Vinext otherwise treats multipart POSTs
    // above its 1 MB Server Action default as a progressive action first.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
