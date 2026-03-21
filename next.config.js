/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Railway (and Docker) deployment
  output: "standalone",

  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },

  experimental: {
    serverActions: {
      // Remove localhost restriction — Next.js validates host/origin by default
      // allowedOrigins should be set to the production domain if needed
    },
  },
};

module.exports = nextConfig;
