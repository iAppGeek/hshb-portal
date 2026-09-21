/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  reactCompiler: true,
  // The route badge sits bottom-left, over the sidebar's Sign out button.
  // Compile and runtime errors still show without it.
  devIndicators: false,
}

module.exports = nextConfig
