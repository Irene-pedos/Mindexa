import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendOrigin = process.env.BACKEND_INTERNAL_URL?.trim() || "http://localhost:8000";

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: "/health/:path*",
        destination: `${backendOrigin}/health/:path*`,
      },
    ];
  },
};

export default nextConfig;
