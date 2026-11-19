// The Tanda mark: a ring of members around a $, the gold dot is whose turn it is.
// Same design as the app icon (scripts/make-icons.cjs draws the PNGs).
const DOTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * 2 * Math.PI - Math.PI / 2
  return { x: 50 + 24 * Math.cos(a), y: 50 + 24 * Math.sin(a) }
})

export default function Logo({ className = 'w-11 h-11', tone = 'light' }) {
  const dark = tone === 'dark'
  const fill = dark ? 'bg-mint text-ink' : 'bg-teal text-white'
  const gap = dark ? '#2DD4BF' : '#127A74'
  return (
    <span className={`inline-flex items-center justify-center rounded-full shrink-0 ${fill} ${className}`} aria-hidden="true">
      <svg viewBox="18 18 64 64" className="w-[78%] h-[78%]">
        <circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
        {DOTS.map((d, i) => (i === 0
          ? <circle key={i} cx={d.x} cy={d.y} r="7.5" fill="#F5B942" stroke={gap} strokeWidth="3" />
          : <circle key={i} cx={d.x} cy={d.y} r="5" fill="currentColor" />))}
        <text x="50" y="58" textAnchor="middle" fontWeight="800" fontSize="22" fill="currentColor" fontFamily="Inter, system-ui, sans-serif">$</text>
      </svg>
    </span>
  )
}
