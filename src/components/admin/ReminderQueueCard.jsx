import { isValidUsPhone, smsUrlWithBody, whatsAppUrlWithBody } from '../../utils/messaging'
import { actionableReminders } from '../../utils/reminderQueue'

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint'
const tap = `inline-flex items-center justify-center min-h-11 px-3 rounded-xl text-sm font-semibold ${focus}`

export function BuildReminderButton({ t, onBuild, building, notice }) {
  if (!onBuild) return null
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onBuild}
        disabled={building}
        className={`w-full min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-stone-100 disabled:opacity-40 ${focus}`}
      >
        {building ? t.reminderBuilding : t.buildReminderList}
      </button>
      {notice && <p role="status" className="text-xs text-stone-400">{notice}</p>}
    </div>
  )
}

export default function ReminderQueueCard({
  t,
  items,
  windowLabel,
  onMarkSent,
  onSkip,
  onMarkAll,
  onBuild,
  building,
}) {
  const pending = actionableReminders(items)
  if (pending.length === 0) return null
  const pendingIds = pending.map(item => item.id)

  return (
    <section aria-label={t.sendRemindersNow} className="rounded-3xl border border-amberwarm/80 bg-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-stone-50">{t.sendRemindersNow}</h2>
          {windowLabel && <p className="text-xs font-semibold text-stone-400 mt-0.5">{windowLabel}</p>}
        </div>
        <span
          className="shrink-0 min-w-11 min-h-11 px-2 rounded-full bg-amberwarm text-ink text-sm font-bold inline-flex items-center justify-center"
          aria-label={t.reminderCount(pending.length)}
        >
          {pending.length}
        </span>
      </div>

      <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
        {items.map(item => {
          const canSend = !item.paid && isValidUsPhone(item.phone)
          const smsUrl = canSend ? smsUrlWithBody(item.phone, item.message) : null
          const waUrl = canSend ? whatsAppUrlWithBody(item.phone, item.message) : null
          return (
            <li key={item.id} className={`px-3 py-2.5 ${item.paid ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-50">{item.name}</p>
                {item.paid ? (
                  <span className="shrink-0 rounded-full bg-white/10 text-stone-300 text-xs font-semibold px-2 py-1">{t.paidState}</span>
                ) : (
                  <div className="flex shrink-0 gap-1.5">
                    {smsUrl && (
                      <a href={smsUrl} onClick={() => onMarkSent?.(item.id)} className={`${tap} border border-white/15 text-stone-50`} aria-label={t.reminderSms(item.name)}>
                        SMS
                      </a>
                    )}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onMarkSent?.(item.id)}
                        className={`${tap} bg-mint text-ink`}
                        aria-label={t.reminderWhatsApp(item.name)}
                      >
                        WhatsApp
                      </a>
                    )}
                    <button type="button" onClick={() => onSkip?.(item.id)} className={`${tap} text-stone-400`} aria-label={t.skipReminder(item.name)}>
                      {t.skip}
                    </button>
                  </div>
                )}
              </div>
              {!item.paid && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-stone-400 min-h-8 flex items-center">Show message</summary>
                  <p className="mt-1 text-xs leading-relaxed text-stone-300 whitespace-pre-wrap break-words">{item.message}</p>
                </details>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => onMarkAll?.(pendingIds)}
        className={`w-full min-h-11 rounded-xl bg-mint text-ink text-sm font-semibold ${focus}`}
      >
        {t.markAllDone}
      </button>
      {onBuild && (
        <button
          type="button"
          onClick={onBuild}
          disabled={building}
          className={`w-full min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-stone-100 disabled:opacity-40 ${focus}`}
        >
          {building ? t.reminderBuilding : t.buildReminderList}
        </button>
      )}
    </section>
  )
}
