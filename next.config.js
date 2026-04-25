/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for catching bugs early
  reactStrictMode: true,

  // Image domains – expand as needed (e.g. S3, Cloudinary)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "cdn.neemo.com.br",
      },
    ],
  },

  // Expose only non-secret env vars to the browser (prefix NEXT_PUBLIC_)
  // Secret vars are accessed server-side only via process.env
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        // Add your production domain here: e.g. "app.foocci.com.br"
        ...(process.env.NEXTAUTH_URL
          ? (() => { try { return [new URL(process.env.NEXTAUTH_URL).host]; } catch { return []; } })()
          : []),
      ],
      bodySizeLimit: "100mb",
    },
    // Prevent Next.js from bundling pdf-parse (avoids test-fixture read at import time)
    serverComponentsExternalPackages: ["pdf-parse"],
  },

  // ── Security headers ──────────────────────────────────────────────────────
  // Applied to every route. Does not break app functionality.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent framing (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Restrict referrer information leakage
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable unused browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // DNS prefetch control
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // Basic XSS protection for older browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
