import type { NextConfig } from "next";

// Fully static: Caddy serves ./out directly, no Node process on the server.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
