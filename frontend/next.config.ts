import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin Turbopack root to this app so parent lockfiles don't shift the workspace root.
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  serverExternalPackages: ["pdfjs-dist", "canvas"],
  turbopack: {
    root: appRoot,
    // Explicitly resolve CSS-imported packages to frontend/node_modules.
    // Without this, Turbopack's CSS @import resolver walks up the filesystem
    // and finds D:\Projects\mindexa\package.json (no node_modules there),
    // causing "Can't resolve 'tailwindcss'" even though it is installed in
    // frontend/node_modules.
    resolveAlias: {
      tailwindcss: path.join(
        appRoot,
        "node_modules",
        "tailwindcss",
        "index.css",
      ),
      "tw-animate-css": path.join(
        appRoot,
        "node_modules",
        "tw-animate-css",
        "dist",
        "tw-animate.css",
      ),
      "shadcn/tailwind.css": path.join(
        appRoot,
        "node_modules",
        "shadcn",
        "tailwind.css",
      ),
    },
  },
  async rewrites() {
    const backendOrigin =
      process.env.BACKEND_INTERNAL_URL?.trim() || "http://localhost:8000";

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: "/health/:path*",
        destination: `${backendOrigin}/health/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${backendOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
