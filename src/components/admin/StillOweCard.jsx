// src/components/admin/StillOweCard.jsx — the organizer's one list for this round:
// who still owes (with remind and mark-paid on each row), then who has paid.
// Queued reminders for the open window are folded into the matching rows, so SMS /
// WhatsApp / Skip live next to the person instead of in a separate card.
import { avatarColor, canNudge, initials } from '../../utils/presentation'
import { buildNudgeSmsUrl, isValidUsPhone, smsUrlWithBody, whatsAppUrlWithBody } from '../../utils/messaging'
import { actionableReminders } from '../../utils/reminderQueue'

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint'
const chip = `inline-flex items-center justify-center min-h-11 px-3 rounded-xl text-sm font-semibold ${focus}`

function Avatar({ name, size = 'w-9 h-9 text-xs' }) {
  return (
    <span
      className={`${size} rounded-full font-bold text-white flex items-center justify-center shrink-0`}
      style={{ backgroundColor: avatarColor(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export default function StillOweCard({
  t,
  members,
  recipientSlot,
  contribution,
  zelle,
  collectDate,
  readOnly,
  reminderItems = [],
  reminderWindowLabel,
  onSelect,
  onTogglePaid,
  onMarkSent,
  onSkipReminder,
  onMarkAllReminders,
  onBuildReminders,
  reminderBuilding,
  reminderNotice,
}) {
  const unpaid = members.filter(member => !member.paid)
  const paid = members.filter(member => member.paid)
  const queued = actionableReminders(reminderItems)
  const queuedBySlot = Object.fromEntries(queued.map(item => [item.slot, item]))

  return (
    <section className="bg-panel rounded-3xl border border-white/10 px-4 pt-4 pb-2" aria-labelledby="owe-title">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="owe-title" className="text-base font-bold text-stone-50">
            {unpaid.length ? t.stillOwe(unpaid.length) : t.everyonePaid}
          </h2>
          {queued.length > 0 && reminderWindowLabel && (
            <p className="text-xs font-semibold text-amberwarm mt-0.5">{reminderWindowLabel} · {t.reminderCount(queued.length)}</p>
          )}
        </div>
        {!readOnly && queued.length > 0 && (
          <button
            type="button"
            onClick={() => onMarkAllReminders?.(queued.map(item => item.id))}
            className={`${chip} shrink-0 bg-mint text-ink`}
          >
            {t.markAllDone}
          </button>
        )}
      </div>

      {unpaid.length > 0 && (
        <ul className="mt-2" aria-label={t.stillOwe(unpaid.length)}>
          {unpaid.map(member => {
            const item = readOnly ? null : queuedBySlot[member.slot]
            const hasPhone = isValidUsPhone(member.phone)
            const smsUrl = readOnly ? null
              : item && hasPhone ? smsUrlWithBody(member.phone, item.message)
                : canNudge(member) ? buildNudgeSmsUrl(member.phone, { name: member.name, amount: contribution, zelle, collectDate })
                  : null
            const waUrl = item && hasPhone ? whatsAppUrlWithBody(member.phone, item.message) : null
            const note = member.slot === recipientSlot ? t.receivesThisRound
              : !hasPhone ? t.noPhoneOnFile
                : item ? t.reminderReady : ''
            return (
              <li key={member.slot} className="border-t border-white/5 first:border-t-0 py-2">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => onSelect?.(member)} className={`flex items-center gap-3 min-w-0 flex-1 text-left min-h-11 rounded-xl ${focus}`}>
                    <Avatar name={member.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-stone-50">{member.name}</span>
                      {note && <span className={`block text-xs ${note === t.reminderReady ? 'text-amberwarm' : 'text-stone-400'}`}>{note}</span>}
                    </span>
                  </button>
                  {!readOnly && (
                    <button type="button" onClick={() => onTogglePaid?.(member)} className={`${chip} shrink-0 bg-mint/15 text-mint`}>
                      {t.markPaid}
                    </button>
                  )}
                </div>
                {(smsUrl || waUrl || item) && (
                  <div className="flex gap-1.5 mt-1.5 pl-12">
                    {smsUrl && (
                      <a
                        href={smsUrl}
                        onClick={item ? () => onMarkSent?.(item.id) : undefined}
                        aria-label={t.remindText(member.name)}
                        className={`${chip} border border-white/15 text-stone-50`}
                      >
                        SMS
                      </a>
                    )}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onMarkSent?.(item.id)}
                        aria-label={t.reminderWhatsApp(member.name)}
                        className={`${chip} border border-white/15 text-stone-50`}
                      >
                        WhatsApp
                      </a>
                    )}
                    {item && (
                      <button type="button" onClick={() => onSkipReminder?.(item.id)} aria-label={t.skipReminder(member.name)} className={`${chip} text-stone-400`}>
                        {t.skip}
                      </button>
                    )}
                  </div>
                )}
                {item && (
                  <details className="mt-1 pl-12">
                    <summary className="cursor-pointer text-xs font-semibold text-stone-400 min-h-8 flex items-center">Show message</summary>
                    <p className="mt-1 text-xs leading-relaxed text-stone-300 whitespace-pre-wrap break-words">{item.message}</p>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!readOnly && unpaid.length > 0 && queued.length === 0 && onBuildReminders && (
        <div className="border-t border-white/5 pt-2 pb-1">
          <button
            type="button"
            onClick={onBuildReminders}
            disabled={reminderBuilding}
            className={`w-full min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-stone-100 disabled:opacity-40 ${focus}`}
          >
            {reminderBuilding ? t.reminderBuilding : t.buildReminderList}
          </button>
          {reminderNotice && <p role="status" className="text-xs text-stone-400 mt-2">{reminderNotice}</p>}
        </div>
      )}

      {paid.length > 0 && (
        <div className="border-t border-white/10 mt-2 pt-3 pb-2">
          <p className="text-xs font-semibold text-stone-400">{t.paidSection(paid.length)}</p>
          <ul className="flex flex-wrap gap-1.5 mt-2" aria-label={t.paidSection(paid.length)}>
            {paid.map(member => (
              <li key={member.slot}>
                <button
                  type="button"
                  onClick={() => onSelect?.(member)}
                  aria-label={`${member.name}, ${t.paidState}`}
                  className={`flex items-center gap-1.5 min-h-11 pl-1 pr-3 rounded-full bg-white/5 text-sm text-stone-200 ${focus}`}
                >
                  <Avatar name={member.name} size="w-8 h-8 text-[10px]" />
                  {member.name}
                  <span className="text-mint" aria-hidden="true">✓</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
