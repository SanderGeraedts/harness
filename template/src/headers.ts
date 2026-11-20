// The headers the host sends with every file, written to dist/_headers at build time
// (vite.config.ts). They are made here and not kept in netlify.toml, because the content
// security policy of a production build names the backend's origin, and the backend's
// address is never in the repository (G-0019).

/** Nothing but this origin; a build that syncs may also reach its backend, and nothing else. */
export function contentSecurityPolicy(backendUrl: string): string {
  const connect = ["'self'", ...(backendUrl ? [new URL(backendUrl).origin] : [])].join(' ')
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** The `_headers` file. `backendUrl` is empty in every build but a production one that syncs. */
export function headersFile(backendUrl: string): string {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(backendUrl)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '',
  ].join('\n')
}
