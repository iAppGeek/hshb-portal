/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  reactCompiler: true,
  // Bottom-left (the default) covers the sidebar's Sign out button.
  devIndicators: { position: 'bottom-right' },
}

module.exports = nextConfig
