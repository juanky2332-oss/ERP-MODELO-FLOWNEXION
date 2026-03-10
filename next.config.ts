import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
<<<<<<< HEAD
      bodySizeLimit: '10mb',
=======
      bodySizeLimit: '4.5mb',
>>>>>>> 8d993d9 (fix(mail): Resolve 413 attachment limits and serverless timeouts)
    },
  },
};

export default nextConfig;
