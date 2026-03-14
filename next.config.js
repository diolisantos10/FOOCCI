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
    ],
  },

  // Expose only non-secret env vars to the browser (prefix NEXT_PUBLIC_)
  // Secret vars are accessed server-side only via process.env
  experimental: {
    // Enable server actions for future use
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

module.exports = nextConfig;
