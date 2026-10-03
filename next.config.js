// Netlify only applies the [[headers]] in netlify.toml to files it serves
// from its CDN, not to server-rendered pages, so Next sets them on every
// response it handles. Keep this list in sync with netlify.toml.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  reactCompiler: true,
  // Bottom-left (the default) covers the sidebar's Sign out button.
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
