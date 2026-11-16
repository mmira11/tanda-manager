export default function ProgressRing({ value, max, label, children }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  return (
    <div className="relative w-44 h-44 mx-auto" role="img" aria-label={label}>
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#2A3136" strokeWidth="10" />
        <circle
          className="progress-ring"
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#2DD4BF"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
        {children}
      </div>
    </div>
  )
}
