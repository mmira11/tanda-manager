export default function LangToggle({ lang, onToggle, tone = 'light', label = 'Toggle language' }) {
  const shell = tone === 'dark'
    ? 'border-white/15 bg-panel'
    : 'border-coral/30 bg-white'
  const active = 'bg-coral text-ink'
  const idle = tone === 'dark' ? 'text-stone-400' : 'text-stone-500'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className={`shrink-0 flex items-center text-xs font-bold rounded-full overflow-hidden border min-h-11 ${shell}`}
    >
      <span className={`px-2.5 py-2 min-w-9 text-center ${lang === 'en' ? active : idle}`}>EN</span>
      <span className={`px-2.5 py-2 min-w-9 text-center ${lang === 'es' ? active : idle}`}>ES</span>
    </button>
  )
}
