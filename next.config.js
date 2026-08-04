/** @type {import('next').NextConfig} */
const pkg = require("./package.json");

const nextConfig = {
  // Permite rodar um segundo `next dev` (agente/preview) sem disputar o mesmo
  // diretório de build do servidor principal. Sem a variável, nada muda.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? pkg.version,
  },
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
    // Required in Next.js 14.x to activate instrumentation.ts (register() hook).
    // Without this, CartRecoveryScheduler and AutoSimulatorScheduler never start.
    // Becomes unnecessary (but harmless) after upgrading to Next.js 15.
    instrumentationHook: true,
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
    // Keep the PDF parser + its native canvas dep out of the bundle so they load
    // from node_modules at runtime (native binary can't be webpack-bundled).
    serverComponentsExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
  },

  // ── Security headers ──────────────────────────────────────────────────────
  // Applied to every route. Does not break app functionality.
  async headers() {
    return [
      {
        // Prevent browsers (especially mobile) from caching API responses
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // Force HTTPS for two years after the first visit. Without this, a
          // network attacker can serve the first http:// request of a session
          // and strip the redirect. No includeSubDomains: other subdomains of
          // foocci.com.br are not verified to serve HTTPS, and HSTS mistakes
          // lock browsers out for the full max-age.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // Prevent cross-origin framing (clickjacking). SAMEORIGIN instead of
          // DENY allows the Waiter Lab iframe to embed /pedido/* on the same host.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Restrict referrer information leakage
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable unused browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=()",
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
