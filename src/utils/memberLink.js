// Full URL for a member's private board. Uses the current origin so localhost and
// GitHub Pages both copy a link that opens on that host, under the Vite base path.
export function memberLink(token) {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return new URL(`m/${encodeURIComponent(token)}`, `${window.location.origin}${prefix}`).href
}
