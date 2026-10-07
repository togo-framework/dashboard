/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const origin = process.env.API_ORIGIN ?? "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
  },
};
export default nextConfig;
