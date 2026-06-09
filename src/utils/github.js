const REPO = 'mmira11/tanda-manager'
const BRANCH = 'gh-pages'
const FILE_PATH = 'tanda-data.json'
const TOKEN_KEY = 'tanda_github_token'

export function loadGitHubToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function saveGitHubToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function sanitizeForPublic(store) {
  return {
    config: {
      organizerName: store.config.organizerName,
      organizerPhone: store.config.organizerPhone,
      initialized: store.config.initialized,
    },
    participants: store.participants.map(({ slot, name }) => ({ slot, name })),
    rounds: store.rounds,
  }
}

function toBase64(str) {
  // encodeURIComponent → unescape handles non-ASCII chars before btoa
  return btoa(unescape(encodeURIComponent(str)))
}

export async function publishToGitHub(token, store) {
  const content = toBase64(JSON.stringify(sanitizeForPublic(store), null, 2))
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // Fetch current SHA so we can update rather than create a conflicting file
  let sha
  const getRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
    { headers }
  )
  if (getRes.ok) {
    sha = (await getRes.json()).sha
  } else if (getRes.status !== 404) {
    const err = await getRes.json().catch(() => ({}))
    throw new Error(err.message || `GitHub API error ${getRes.status}`)
  }

  const putRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Publish tanda data',
        content,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }
  )

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}))
    throw new Error(err.message || `GitHub API error ${putRes.status}`)
  }
}

export async function fetchPublicData() {
  // raw.githubusercontent.com bypasses GitHub Pages CDN caching
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE_PATH}?t=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('No public data found')
  return res.json()
}
