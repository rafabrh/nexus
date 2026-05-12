/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexus/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default nextConfig;
