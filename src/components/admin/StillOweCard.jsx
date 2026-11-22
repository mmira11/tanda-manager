// src/components/admin/StillOweCard.jsx — Today's to-do list: who still owes this round,
// each with a one-tap Nudge (a friendly SMS) and Mark paid. Grok Bot drafts the scheduled
// reminders; you send them. Nudge is for a quick personal text.
import { avatarColor, initials } from '../../utils/presentation'
import { buildNudgeSmsUrl, isValidUsPhone } from '../../utils/messaging'

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint'
const chip = `shrink-0 inline-flex items-center justify-center min-h-11 px-2.5 rounded-xl text-sm font-semibold ${focus}`

export default function StillOweCard({
  t,
  members,
  recipientSlot,
  contribution,
  zelle,
  collectDate,
  readOnly,
  onSelect,
  onTogglePaid,
}) {
  // The recipient is settled automatically. They are not a person who still owes.
  const unpaid = members.filter(member => !member.paid && member.slot !== recipientSlot)

  return (
    <section className="bg-panel rounded-3xl border border-white/10 px-4 pt-4 pb-2" aria-labelledby="owe-title">
      <h2 id="owe-title" className="text-base font-bold text-stone-50">
        {unpaid.length ? t.stillOwe(unpaid.length) : t.everyonePaid}
      </h2>

      {unpaid.length > 0 && (
        <ul className="mt-2" aria-label={t.stillOwe(unpaid.length)}>
          {unpaid.map(member => {
            const hasPhone = isValidUsPhone(member.phone)
            const nudge = !readOnly && hasPhone
              ? buildNudgeSmsUrl(member.phone, { name: member.name, amount: contribution, zelle, collectDate })
              : null
            const note = member.slot === recipientSlot ? t.receivesThisRound : !hasPhone ? t.noPhoneOnFile : ''
            return (
              <li key={member.slot} className="flex flex-wrap items-center gap-1.5 border-t border-white/5 first:border-t-0 py-2">
                <button
                  type="button"
                  onClick={() => onSelect?.(member)}
                  className={`flex items-center gap-2.5 min-w-[5.5rem] flex-1 text-left min-h-11 rounded-xl ${focus}`}
                >
                  <span
                    className="w-9 h-9 rounded-full text-xs font-bold text-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: avatarColor(member.name) }}
                    aria-hidden="true"
                  >
                    {initials(member.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-stone-50">{member.name}</span>
                    {note && <span className="block text-xs text-stone-400">{note}</span>}
                  </span>
                </button>
                {nudge && (
                  <a href={nudge} aria-label={t.nudgeName(member.name)} className={`${chip} border border-white/15 text-stone-50`}>
                    Nudge
                  </a>
                )}
                {!readOnly && (
                  <button type="button" onClick={() => onTogglePaid?.(member)} className={`${chip} bg-mint/15 text-mint`}>
                    {t.markPaid}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!readOnly && <p className="text-xs text-stone-400 mt-1 mb-2">{t.remindersByGrokbot}</p>}
    </section>
  )
}
