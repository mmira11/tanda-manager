// src/components/public/RecipientSpotlight.jsx
import { formatDate, isPayoutWindow } from '../../utils/rounds'

const CONFETTI_COLORS = ['#fff', '#fde68a', '#f59e0b', '#34d399', '#93c5fd']

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    left: `${(i * 41) % 100}%`,
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    animationDelay: `${(i % 8) * 0.18}s`,
  }))
  return (
    <div className="absolute inset-x-0 top-0 h-full overflow-hidden pointer-events-none" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="confetti-piece" style={style} />
      ))}
    </div>
  )
}

export default function RecipientSpotlight({ round, recipientName, t, pot, totalRounds }) {
  const celebrate = isPayoutWindow(round) || round.payoutSent
  const initial = (recipientName || '?')[0].toUpperCase()

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 rounded-3xl p-6 text-white shadow-xl">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/10 rounded-full translate-y-10 -translate-x-10 pointer-events-none" />
      <div className="absolute top-1/2 right-8 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />
      {/* shimmer sweep */}
      <div className="absolute inset-y-0 w-24 bg-white/15 blur-md animate-shimmer pointer-events-none" aria-hidden="true" />
      {celebrate && <Confetti />}

      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <span className="bg-white/25 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            {t.round} {round.round} {t.of} {totalRounds}
          </span>
        </div>

        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-white/25 border-2 border-white/60 shadow-inner flex items-center justify-center flex-shrink-0">
            <span className="text-3xl font-black drop-shadow-sm">{initial}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white/80 text-sm font-medium">🎉 {t.recipient}</p>
            <h2 className="text-4xl font-black tracking-tight drop-shadow-sm truncate">
              {recipientName || '—'}
            </h2>
          </div>
        </div>
        <div className="text-6xl font-black mb-5 drop-shadow tracking-tight">
          ${(pot ?? 0).toLocaleString()}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-3">
            <p className="text-white/70 text-xs font-medium">{t.collection}</p>
            <p className="font-bold text-sm mt-0.5">{formatDate(round.collectDate)}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-3">
            <p className="text-white/70 text-xs font-medium">{t.payout}</p>
            <p className="font-bold text-sm mt-0.5">{formatDate(round.payoutDate)}</p>
          </div>
        </div>

        {round.payoutSent && (
          <div className="mt-4 bg-white/25 rounded-2xl p-4 text-center border border-white/30">
            <div className="text-2xl mb-1">🎊</div>
            <p className="font-bold">{t.payoutDone}</p>
            <p className="text-white/80 text-sm">{t.congrats}, {recipientName}!</p>
          </div>
        )}
      </div>
    </div>
  )
}
