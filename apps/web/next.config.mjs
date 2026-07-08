/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig = {
  output: "standalone",
  images: {
    unoptimized: true
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_TARGET}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
