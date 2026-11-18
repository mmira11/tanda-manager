export default function RoundStepper({ rounds, label }) {
  return (
    <ol aria-label={label} className="scrollbar-none flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
      {rounds.map(step => {
        const circle = step.state === 'current'
          ? 'bg-teal text-white'
          : step.state === 'past'
            ? 'bg-teal/10 text-teal'
            : 'bg-stone-100 text-stone-400'
        return (
          <li key={step.round} data-state={step.state} aria-label={String(step.round)} className="flex flex-col items-center min-w-10 shrink-0">
            <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${circle}`}>
              {step.round}
            </span>
            {step.state === 'past' && (
              <svg viewBox="0 0 16 16" className="w-4 h-4 text-teal mt-1" aria-hidden="true">
                <path d="M3 8.2 6.2 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {step.state === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-coral mt-1.5" aria-hidden="true" />}
            {step.state === 'future' && <span className="w-1.5 h-1.5 mt-1.5" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}
