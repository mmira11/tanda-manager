// Full URL for a member's private board. Uses the current origin so localhost and
// GitHub Pages both copy a link that opens on that host, under the Vite base path.
// Home-screen icons open the app's start page (/tanda-manager/), not the link the member
// opened. So the member's own phone remembers their link once it loads, and the start page
// sends them back to it. Forgotten again if the link stops working (revoked or expired).
const SAVED_KEY = 'tanda_member_token'

export function rememberMemberToken(token) {
  try { if (token) localStorage.setItem(SAVED_KEY, token) } catch { /* private mode */ }
}

export function savedMemberToken() {
  try { return localStorage.getItem(SAVED_KEY) || null } catch { return null }
}

export function forgetMemberToken(token) {
  try { if (localStorage.getItem(SAVED_KEY) === token) localStorage.removeItem(SAVED_KEY) } catch { /* private mode */ }
}

// "Not you?" on a shared phone or tablet: drop whatever link this device remembers.
export function forgetThisDevice() {
  try { localStorage.removeItem(SAVED_KEY) } catch { /* private mode */ }
}

export function memberLink(token) {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return new URL(`m/${encodeURIComponent(token)}`, `${window.location.origin}${prefix}`).href
}
