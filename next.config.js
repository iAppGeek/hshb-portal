/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  reactCompiler: true,
  experimental: {
    // Document uploads — must stay >= MAX_UPLOAD_BYTES in
    // src/app/documents/actions.ts, or files above the default 1 MB limit
    // would be rejected before reaching the action.
    serverActions: { bodySizeLimit: '8mb' },
  },
}

module.exports = nextConfig
