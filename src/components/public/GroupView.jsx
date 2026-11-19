// src/components/public/GroupView.jsx — the "Group" tab on a member's page: this round's
// status for everyone plus the payout order. It uses only what get_member_board already
// returns to every member (first names, this round's paid flags, the schedule), so it
// shows the group nothing new.
import { formatMoney } from '../../utils/money'
import { formatDate } from '../../utils/rounds'
import { avatarColor, initials, paymentStats } from '../../utils/presentation'

function Avatar({ name }) {
  return (
    <span
      className="w-10 h-10 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0"
      style={{ backgroundColor: avatarColor(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export default function GroupView({ board, t, locale, rounds, isMine, complete = false }) {
  const progress = board.progress || []
  const round = board.current_round
  const stats = paymentStats(progress, board.cycle?.contribution)
  const mySlot = board.me?.slot
  // Paid people sink to the bottom so the list reads as "who's still pending".
  const people = [...progress].sort((a, b) => (a.paid === b.paid ? a.slot - b.slot : a.paid ? 1 : -1))
  const pct = stats.pot > 0 ? Math.round((stats.collected / stats.pot) * 100) : 0

  return (
    <>
      <section className="bg-white rounded-3xl shadow-sm p-5" aria-labelledby="group-round-title">
        <h2 id="group-round-title" className="font-bold text-lg text-stone-900">
          {round ? t.roundOf(round.round_number, rounds.length || round.round_number) : t.groupTitle}
        </h2>
        {round?.recipient_first_name && !complete && (
          <p className="text-sm text-stone-600 mt-0.5">
            {t.groupRecipient(round.recipient_first_name, formatMoney(stats.pot), formatDate(round.payout_date, locale))}
          </p>
        )}

        {stats.total > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold text-stone-900">{t.groupCollected(formatMoney(stats.collected), formatMoney(stats.pot))}</span>
              <span className="font-semibold text-teal">{t.paidOf(stats.paid, stats.total)}</span>
            </div>
            <div
              className="mt-2 h-3 rounded-full bg-[#EFE9DF] overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={t.paidOf(stats.paid, stats.total)}
            >
              <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <ul className="mt-4 divide-y divide-stone-100" aria-label={t.groupWhoPaid}>
          {people.length === 0 && <li className="py-3 text-sm text-stone-500">{t.noRounds}</li>}
          {people.map(person => (
            <li key={person.slot} className="py-2.5 flex items-center gap-3">
              <Avatar name={person.display_first_name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900 truncate">
                  {person.display_first_name}
                  {person.slot === mySlot && (
                    <span className="ml-2 align-middle rounded-full bg-coral text-ink text-[11px] font-bold px-2 py-0.5">{t.youBadge}</span>
                  )}
                </p>
                {person.is_recipient && <p className="text-xs text-teal font-semibold">🎁 {t.groupReceivesThisRound}</p>}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                  person.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {person.paid ? `✓ ${t.paid}` : t.pending}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-3xl shadow-sm p-5" aria-labelledby="group-order-title">
        <h2 id="group-order-title" className="font-bold text-lg text-stone-900">{t.groupOrderTitle}</h2>
        <ol className="mt-3 space-y-1.5">
          {rounds.map(item => (
            <li
              key={item.round}
              aria-current={item.state === 'current' ? 'step' : undefined}
              className={`rounded-2xl px-3 py-2.5 flex items-center gap-3 ${item.state === 'current' ? 'bg-teal/10 ring-1 ring-teal/30' : ''}`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                item.state === 'future' ? 'bg-stone-100 text-stone-500' : 'bg-teal text-white'
              }`}
              >
                {item.state === 'past' ? '✓' : item.round}
              </span>
              <p className={`flex-1 min-w-0 truncate font-semibold ${item.state === 'past' ? 'text-stone-400' : 'text-stone-900'}`}>
                {item.name || '—'}
                {isMine(item) && (
                  <span className="ml-2 align-middle rounded-full bg-coral text-ink text-[11px] font-bold px-2 py-0.5">{t.youBadge}</span>
                )}
              </p>
              <span className={`text-xs shrink-0 ${item.state === 'past' ? 'text-stone-400' : 'text-stone-500'}`}>
                {formatDate(item.payoutDate, locale)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
