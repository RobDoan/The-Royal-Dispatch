import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();
const config: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['the-royal-dispatch.quybits.com'],
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
export default withNextIntl(config);
