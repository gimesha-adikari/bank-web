import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  logging: {
    // Verification and reset links can carry tokens in the API query string.
    incomingRequests: { ignore: [/^\/api\/v1\/[^?]*\?/] }
  }
};

export default nextConfig;
