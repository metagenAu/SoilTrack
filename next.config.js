/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    serverComponentsExternalPackages: ['xlsx'],
  },
  transpilePackages: ['shpjs', 'but-unzip'],
  webpack(config, { isServer }) {
    // but-unzip has nested conditional exports where "node" appears before
    // "browser" under the "import" condition. Ensure the client bundle
    // resolves the browser entry instead of the Node.js one.
    if (!isServer) {
      config.resolve.conditionNames = ['browser', 'import', 'require', 'default']
    }
    return config
  },
}

module.exports = nextConfig
