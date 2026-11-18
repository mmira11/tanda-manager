// Full-screen moment shown once per round: when a member's payment lands, and when the
// round's pot is theirs. "Seen" is remembered on this phone so it doesn't repeat.
const COLORS = ['#F4795B', '#127A74', '#F5B942', '#FB7185', '#2DD4BF', '#C44832']

function seenKey(kind, round) {
  return `tanda_seen_${kind}_${round}`
}

export function alreadySeen(kind, round) {
  try { return localStorage.getItem(seenKey(kind, round)) === '1' } catch { return true }
}

export function markSeen(kind, round) {
  try { localStorage.setItem(seenKey(kind, round), '1') } catch { /* private mode */ }
}

function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 7) * 0.12}s`,
    color: COLORS[i % COLORS.length],
  }))
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{ left: p.left, animationDelay: p.delay, backgroundColor: p.color }} />
      ))}
    </div>
  )
}

export default function Celebration({ emoji, title, body, button, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/50 p-6" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      <div className="celebrate-in relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-7 text-center shadow-xl">
        <Confetti />
        <div className="text-6xl" aria-hidden="true">{emoji}</div>
        <h2 id="celebrate-title" className="mt-3 text-2xl font-extrabold text-stone-900">{title}</h2>
        <p className="mt-2 text-stone-600">{body}</p>
        <button type="button" onClick={onClose} className="mt-6 w-full min-h-12 rounded-2xl bg-teal text-white font-bold">
          {button}
        </button>
      </div>
    </div>
  )
}
