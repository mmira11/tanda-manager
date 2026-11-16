import Logo from '../ui/Logo'
import LangToggle from '../ui/LangToggle'
import ProgressRing from './ProgressRing'
import MemberAvatarGrid from './MemberAvatarGrid'
import NeedsReviewCard from './NeedsReviewCard'

export default function DashboardView({
  t,
  lang,
  onToggleLang,
  cycleName,
  roundLabel,
  collectedLabel,
  potLabel,
  paid,
  total,
  payoutLine,
  countdownLabel,
  members,
  contribution,
  zelle,
  collectDate,
  reviews,
  readOnly,
  onSelectMember,
}) {
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Logo tone="dark" />
        <div className="min-w-0 flex-1">
          <h1 className="leading-tight">
            <span className="block truncate text-sm font-bold text-stone-50">{cycleName}</span>
            {roundLabel && <span className="block text-xs font-semibold text-stone-400">{roundLabel}</span>}
          </h1>
        </div>
        <LangToggle lang={lang} onToggle={onToggleLang} tone="dark" label={t.toggleLanguage} />
      </header>

      <section className="bg-panel rounded-3xl border border-white/10 px-4 py-6">
        <ProgressRing value={paid} max={total} label={t.paidOf(paid, total)}>
          <p className="text-sm font-bold text-stone-50 leading-tight">
            <span>{collectedLabel}</span>
            <span className="text-stone-400 font-medium"> {t.ofWord} </span>
            <span>{potLabel}</span>
          </p>
          <p className="text-xs font-semibold text-mint mt-1">{t.paidOf(paid, total)}</p>
        </ProgressRing>
        {payoutLine && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stone-100 min-w-0">{payoutLine}</p>
            {countdownLabel && (
              <span className="shrink-0 rounded-full bg-amberwarm text-ink text-xs font-bold px-2.5 py-1">{countdownLabel}</span>
            )}
          </div>
        )}
      </section>

      <MemberAvatarGrid
        members={members}
        contribution={contribution}
        zelle={zelle}
        collectDate={collectDate}
        t={t}
        readOnly={readOnly}
        onSelect={onSelectMember}
      />

      <NeedsReviewCard items={reviews} t={t} />
    </div>
  )
}
