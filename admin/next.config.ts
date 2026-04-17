import type { NextConfig } from 'next';

const config: NextConfig = {
  async rewrites() {
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
