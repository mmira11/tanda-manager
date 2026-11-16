function Icon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'home') {
    return <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" /></svg>
  }
  if (name === 'rounds') {
    return <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><path {...common} d="M8 3v3M16 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></svg>
  }
  if (name === 'profile') {
    return <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><path {...common} d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0" /></svg>
  }
  if (name === 'members') {
    return <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><path {...common} d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 19a5 5 0 0 1 9 0M14 19a4.5 4.5 0 0 1 6.5-4" /></svg>
  }
  if (name === 'settings') {
    return <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><path {...common} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><path {...common} d="M19.4 13.5a7.8 7.8 0 0 0 .1-3l1.8-1.4-1.8-3.1-2.2.7a8 8 0 0 0-2.6-1.5L14.2 3h-4.4L9.3 5.2A8 8 0 0 0 6.7 6.7l-2.2-.7L2.7 9.1 4.5 10.5a7.8 7.8 0 0 0 .1 3L2.7 14.9l1.8 3.1 2.2-.7a8 8 0 0 0 2.6 1.5L9.8 21h4.4l.5-2.2a8 8 0 0 0 2.6-1.5l2.2.7 1.8-3.1-1.9-1.4z" /></svg>
  }
  return <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true"><circle cx="12" cy="12" r="8" {...common} /><path {...common} d="M12 8v4l2.5 2" /></svg>
}

export default function TabBar({ tabs, active, onChange, tone = 'light', label }) {
  const bar = tone === 'dark'
    ? 'bg-panel border-white/10 text-stone-500'
    : 'bg-white border-stone-200 text-stone-400'
  const on = tone === 'dark' ? 'text-mint' : 'text-teal'
  return (
    <nav className={`fixed bottom-0 inset-x-0 border-t z-20 tab-bar ${bar}`} aria-label={label}>
      <div className={`max-w-lg mx-auto grid`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(tab => {
          const selected = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={selected ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-[11px] font-semibold ${selected ? on : ''}`}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
