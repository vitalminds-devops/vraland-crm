import path from "node:path";

import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

// 'unsafe-inline' scripts: Next's inline bootstrap and the theme script need it without nonces.
// frame-src blob: previews an uploaded PDF.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  ...(process.env.PLAYWRIGHT_TEST_SERVER === "1" ? { distDir: ".next-test" } : {}),
  output: process.env.PLAYWRIGHT_TEST_SERVER === "1" ? undefined : "standalone",
  poweredByHeader: false,
  // 90 keeps the sign-in page's project photos sharp; everything else uses the default 75.
  images: { qualities: [75, 90] },
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Agent onboarding sends up to 5 files of 15MB in one action.
      bodySizeLimit: "80mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API file routes send their own stricter sandbox CSP.
      {
        source: "/((?!api/).*)",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
    ];
  },
  ...(isProduction
    ? {}
    : {
        allowedDevOrigins: (
          process.env.DEV_ALLOWED_ORIGINS ?? "uninwrapped-squarishly-leonila.ngrok-free.dev"
        )
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      }),
};

export default nextConfig;
