function normalizeOrigin(value: string | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

const backendOrigin = normalizeOrigin(
  process.env.VERCEL_BACKEND_ORIGIN ||
    process.env.APP_BACKEND_ORIGIN,
);

const uploadsOrigin = normalizeOrigin(
  process.env.VERCEL_UPLOADS_ORIGIN ||
    process.env.APP_UPLOADS_ORIGIN ||
    backendOrigin,
);

const supabaseOrigin = normalizeOrigin(
  process.env.VERCEL_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL,
);

const blogStorageBucket = String(
  process.env.VERCEL_BLOG_STORAGE_BUCKET ||
    process.env.BLOG_STORAGE_BUCKET ||
    "blog-assets",
).trim();

const blogUploadsOrigin =
  supabaseOrigin && blogStorageBucket
    ? `${supabaseOrigin}/storage/v1/object/public/${encodeURIComponent(blogStorageBucket)}/posts`
    : "";

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

export const config = {
  buildCommand: "npm run build",
  framework: "vite",
  outputDirectory: "dist/public",
  functions: {
    "api/http.ts": {
      maxDuration: 180,
      includeFiles: "node_modules/{sharp/**,@img/sharp-linux-x64/**,@img/sharp-libvips-linux-x64/**}",
    },
  },
  crons: [
    { path: "/api/cron/stateful-jobs/fast-core", schedule: "*/5 * * * *" },
    { path: "/api/cron/stateful-jobs/user-followup", schedule: "* * * * *" },
    { path: "/api/cron/stateful-jobs/lead-sync", schedule: "*/10 * * * *" },
    { path: "/api/cron/broadcast-campaigns", schedule: "* * * * *" },
    { path: "/api/cron/status-posts", schedule: "* * * * *" },
    { path: "/api/cron/wa-gateway-reconcile", schedule: "* * * * *" },
    { path: "/api/cron/google-calendar-sync", schedule: "*/5 * * * *" },
    { path: "/api/cron/google-contacts-sync", schedule: "*/10 * * * *" },
  ],
  headers: [
    { source: "/sw.js", headers: noStoreHeaders },
    { source: "/site.webmanifest", headers: noStoreHeaders },
    { source: "/pwa-version.json", headers: noStoreHeaders },
    { source: "/favicon.png", headers: noStoreHeaders },
    { source: "/favicon.svg", headers: noStoreHeaders },
    { source: "/pwa-192.png", headers: noStoreHeaders },
    { source: "/pwa-512.png", headers: noStoreHeaders },
    { source: "/pwa-badge.png", headers: noStoreHeaders },
  ],
  rewrites: [
    { source: "/api", destination: "/api/http?__pathname=/api" },
    { source: "/api/:path*", destination: "/api/http?__pathname=/api/:path*" },
    { source: "/health", destination: "/api/http?__pathname=/health" },
    { source: "/healthz", destination: "/api/http?__pathname=/healthz" },
    { source: "/uploads/blog-assets/default-blog.svg", destination: "/blog-assets/default-blog.svg" },
    ...(blogUploadsOrigin
      ? [
          {
            source: "/uploads/blog-assets/:path*",
            destination: `${blogUploadsOrigin}/:path*`,
          },
        ]
      : []),
    ...(uploadsOrigin
      ? [
          {
            source: "/uploads/:path*",
            destination: `${uploadsOrigin}/uploads/:path*`,
          },
        ]
      : []),
    { source: "/(.*)", destination: "/index.html" },
  ],
};
