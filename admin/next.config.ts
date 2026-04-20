import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    const backendUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};
export default config;
