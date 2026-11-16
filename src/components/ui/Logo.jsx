export default function Logo({ className = 'w-11 h-11', tone = 'light' }) {
  const fill = tone === 'dark' ? 'bg-mint text-ink' : 'bg-teal text-white'
  return (
    <span className={`inline-flex items-center justify-center rounded-full shrink-0 ${fill} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
        <path d="M4.2 13.2c.2-2.4 1.6-4 3.6-4 1.1 0 1.9.5 2.6 1.4.2.3.4.3.6 0 .7-.9 1.5-1.4 2.6-1.4 2 0 3.4 1.6 3.6 4 .3 3.1-3.2 5.6-6.5 7.4-3.3-1.8-6.8-4.3-6.5-7.4z" fill="currentColor" />
        <path d="M3 11.2c.6-.9 1.5-1.5 2.6-1.6M21 11.2c-.6-.9-1.5-1.5-2.6-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2.2 13.4c1.2.2 2.2 1 2.8 2.1M21.8 13.4c-1.2.2-2.2 1-2.8 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}
