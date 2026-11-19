// src/components/admin/DashboardView.jsx — the organizer's "today" screen, status first:
// round + countdown, money collected and the payout, anything to review, then who owes.
import Logo from '../ui/Logo'
import MemberAvatarGrid from './MemberAvatarGrid'
import NeedsReviewCard from './NeedsReviewCard'
import StillOweCard from './StillOweCard'

export default function DashboardView({
  t,
  cycleName,
  roundLabel,
  collectedLabel,
  potLabel,
  paid,
  total,
  payoutLine,
  countdownLabel,
  members,
  recipientSlot,
  recipientName,
  payoutSent,
  onTogglePayout,
  onTogglePaid,
  contribution,
  zelle,
  collectDate,
  reviews,
  participants,
  rounds,
  locale,
  timeZone,
  onMatchReview,
  onDismissReview,
  readOnly,
  onSelectMember,
  reminderItems,
  reminderWindowLabel,
  onMarkSent,
  onSkipReminder,
  onMarkAllReminders,
  onBuildReminders,
  reminderBuilding,
  reminderNotice,
}) {
  const percent = total > 0 ? Math.round((paid / total) * 100) : 0
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Logo tone="dark" />
        <div className="min-w-0 flex-1">
          <h1 className="leading-tight">
            <span className="block truncate text-xs font-semibold text-stone-400">{cycleName}</span>
            {roundLabel && <span className="block text-xl font-extrabold tracking-tight text-stone-50">{roundLabel}</span>}
          </h1>
        </div>
        {countdownLabel && (
          <span className="shrink-0 rounded-full bg-amberwarm text-ink text-xs font-bold px-3 py-1.5">{countdownLabel}</span>
        )}
      </header>

      <section className="bg-panel rounded-3xl border border-white/10 p-5" aria-label={t.paidOf(paid, total)}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-3xl font-extrabold tracking-tight text-stone-50">
            {collectedLabel}
            <span className="text-base font-semibold text-stone-400"> {t.ofWord} {potLabel}</span>
          </p>
          <p className="shrink-0 text-sm font-bold text-mint">{t.paidOf(paid, total)}</p>
        </div>
        <div
          className="mt-3 h-2.5 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t.paidOf(paid, total)}
        >
          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${percent}%` }} />
        </div>
        {payoutLine && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-stone-100 min-w-0">{payoutLine}</p>
            {onTogglePayout && recipientName && (
              <button
                type="button"
                onClick={onTogglePayout}
                disabled={readOnly}
                aria-pressed={payoutSent ? 'true' : 'false'}
                aria-label={t.payoutToggle(recipientName, payoutSent)}
                className={`shrink-0 min-h-11 px-3.5 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                  payoutSent ? 'bg-mint text-ink' : 'border border-white/15 text-stone-50'
                }`}
              >
                {payoutSent ? t.payoutSentDone : t.markPayoutSent}
              </button>
            )}
          </div>
        )}
      </section>

      {members.length > 0 && (
        <MemberAvatarGrid
          members={members}
          contribution={contribution}
          zelle={zelle}
          collectDate={collectDate}
          t={t}
          readOnly={readOnly}
          onSelect={onSelectMember}
        />
      )}

      <NeedsReviewCard
        items={reviews}
        t={t}
        participants={participants}
        rounds={rounds}
        locale={locale}
        timeZone={timeZone}
        readOnly={readOnly}
        onMatch={onMatchReview}
        onDismiss={onDismissReview}
      />

      <StillOweCard
        t={t}
        members={members}
        recipientSlot={recipientSlot}
        contribution={contribution}
        zelle={zelle}
        collectDate={collectDate}
        readOnly={readOnly}
        reminderItems={reminderItems}
        reminderWindowLabel={reminderWindowLabel}
        onSelect={onSelectMember}
        onTogglePaid={onTogglePaid}
        onMarkSent={onMarkSent}
        onSkipReminder={onSkipReminder}
        onMarkAllReminders={onMarkAllReminders}
        onBuildReminders={onBuildReminders}
        reminderBuilding={reminderBuilding}
        reminderNotice={reminderNotice}
      />
    </div>
  )
}
