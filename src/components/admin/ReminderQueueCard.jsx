import { buildSmsUrl, buildWhatsAppUrl, isValidUsPhone } from '../../utils/messaging'
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
  zelle,
  collectDate,
  contribution,
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

      <ul className="space-y-2">
        {items.map(item => {
          const smsUrl = !item.paid && isValidUsPhone(item.phone)
            ? buildSmsUrl(item.phone, item.name, zelle || '', collectDate, contribution)
            : null
          const waUrl = !item.paid && isValidUsPhone(item.phone)
            ? buildWhatsAppUrl(item.phone, item.name, zelle || '', collectDate, contribution)
            : null
          return (
            <li key={item.id} className={`rounded-2xl border border-white/10 p-3 ${item.paid ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-stone-50">{item.name}</p>
                {item.paid && (
                  <span className="shrink-0 rounded-full bg-white/10 text-stone-300 text-xs font-semibold px-2 py-1">{t.paidState}</span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-stone-300 whitespace-pre-wrap break-words">{item.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
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
                <button type="button" onClick={() => onSkip?.(item.id)} className={`${tap} border border-white/15 text-stone-200`} aria-label={t.skipReminder(item.name)}>
                  {t.skip}
                </button>
              </div>
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
