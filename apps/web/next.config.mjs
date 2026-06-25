/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server build for Docker/EasyPanel (lean runtime image).
  output: 'standalone',
  transpilePackages: ['@nexus/shared'],
  // Trust the reverse proxy (EasyPanel/Traefik) so request URLs/redirects use
  // the public https origin, not the internal container address.
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default nextConfig;
