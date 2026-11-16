import { avatarColor, canNudge, initials } from '../../utils/presentation'
import { buildNudgeSmsUrl } from '../../utils/messaging'
import { formatDate } from '../../utils/rounds'

function Badge({ paid }) {
  const tone = paid ? 'bg-mint text-ink' : 'bg-amberwarm text-ink'
  return (
    <span className={`absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full border-2 border-panel flex items-center justify-center ${tone}`} aria-hidden="true">
      {paid ? (
        <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M3.5 8.2 6.4 11 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" className="w-3 h-3"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 5.2V8l1.8 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      )}
    </span>
  )
}

export default function MemberAvatarGrid({ members, contribution, zelle, collectDate, t, onSelect, readOnly }) {
  const when = collectDate ? formatDate(collectDate) : ''
  return (
    <ul className="grid grid-cols-5 gap-x-2 gap-y-4">
      {members.map(member => {
        const nudge = canNudge(member)
          ? buildNudgeSmsUrl(member.phone, { name: member.name, amount: contribution, zelle, when })
          : null
        const state = member.paid ? t.paidState : t.unpaidState
        return (
          <li key={member.slot} className="flex flex-col items-center min-w-0">
            <button
              type="button"
              onClick={() => onSelect(member)}
              aria-label={`${member.name || t.paymentFor(member.slot)}, ${state}`}
              className="relative"
            >
              <span
                className={`w-12 h-12 rounded-full ring-2 flex items-center justify-center text-xs font-bold text-white ${member.paid ? 'ring-mint' : 'ring-amberwarm'}`}
                style={{ backgroundColor: avatarColor(member.name) }}
              >
                {initials(member.name)}
              </span>
              <Badge paid={member.paid} />
            </button>
            <span className="mt-1 w-full text-center text-[11px] text-stone-300 truncate">{member.name}</span>
            {nudge && !readOnly && (
              <a href={nudge} className="mt-1 flex w-full items-center justify-center min-h-8 rounded-full bg-amberwarm text-ink text-[10px] font-bold leading-none whitespace-nowrap">
                {t.nudge}
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
