import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default bottom-left indicator sits on top of the sidebar's sign-out button.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // Server Actions default to a 1MB body limit; PDF imports need headroom.
    serverActions: { bodySizeLimit: "15mb" },
  },
  // pdf-parse (via pdfjs-dist) reads its own binary/worker assets at runtime
  // and must not be bundled into the server chunk.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
