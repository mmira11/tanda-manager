// src/components/admin/MembersView.jsx — one compact row per member: language, payout
// round, whether their private link went out, and Send link. Everything else (edit, View
// as member, new link, turn off, move, remove) lives in the ⋯ sheet.
import { useEffect, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { memberLink } from '../../utils/memberLink'
import { bilingual, buildGroupSmsUrl, isValidUsPhone, organizerFallback, smsUrlWithBody } from '../../utils/messaging'
import { formatMoney } from '../../utils/money'
import { avatarColor, initials } from '../../utils/presentation'

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint'
const field = 'w-full min-h-11 rounded-xl border border-white/15 bg-ink px-3 text-sm text-stone-100'
const ghost = `min-h-11 px-3 rounded-xl border border-white/15 text-sm font-semibold text-stone-100 ${focus}`

export function linkMessage(person, cycleName) {
  const url = memberLink(person.accessToken)
  const en = `Hi ${person.name}! Here's your private link for ${cycleName}: ${url}\nIt shows your payment and your payout day. Please don't share it.`
  const es = `¡Hola ${person.name}! Este es tu enlace privado para ${cycleName}: ${url}\nAhí ves tu pago y tu turno. Por favor no lo compartas.`
  return person.language === 'es' ? `${es}\n\n${en}` : `${en}\n\n${es}`
}

async function copyText(text, label) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt(label, text)
    return false
  }
}

function linkState(person) {
  if (person.linkRevoked) return 'link off'
  return person.linkSentAt ? 'link sent' : 'link not sent'
}

function MemberSheet({ person, index, count, readOnly, hasHistory, onClose }) {
  const { updateParticipant, reorderMember, removeMember, regenerateLink, revokeLink } = useStore()
  const [name, setName] = useState(person.name)
  const [phone, setPhone] = useState(person.phone)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => { setName(person.name); setPhone(person.phone) }, [person.name, person.phone])

  const dirty = name.trim() !== person.name || phone.trim() !== person.phone
  const badPhone = phone.trim() && !isValidUsPhone(phone)

  function save() {
    if (!name.trim()) return
    updateParticipant(person.slot, { name: name.trim(), phone: phone.trim() })
    setNotice('Saved')
  }

  async function copyLink() {
    const copied = await copyText(memberLink(person.accessToken), 'Copy this personal link')
    if (copied) setNotice('Link copied')
  }

  function newLink() {
    if (!window.confirm(`Make a new link for ${person.name}? Their old link stops working. Send them the new one.`)) return
    regenerateLink(person.slot)
    updateParticipant(person.slot, { linkSentAt: null })
    setNotice('New link made. Send it from the list.')
  }

  function turnOff() {
    if (!window.confirm(`Turn off ${person.name}'s link? It stops working right away. Make a new link to let them back in.`)) return
    revokeLink(person.slot)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-sheet-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-panel border-t border-white/10 rounded-t-3xl p-5 pb-8 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="member-sheet-title" className="text-lg font-bold text-stone-50 truncate">{person.name}</h2>
          <button type="button" onClick={onClose} className={`${ghost} border-0`}>Done</button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-400" htmlFor={`name-${person.slot}`}>First name</label>
          <input id={`name-${person.slot}`} className={field} value={name} readOnly={readOnly} onChange={e => setName(e.target.value)} />
          <label className="block text-xs font-semibold text-stone-400" htmlFor={`phone-${person.slot}`}>Phone</label>
          <input id={`phone-${person.slot}`} className={field} value={phone} readOnly={readOnly} inputMode="tel" onChange={e => setPhone(e.target.value)} />
          {badPhone && <p className="text-xs font-semibold text-amberwarm">Check this number: it needs 10 digits.</p>}
          {!readOnly && dirty && (
            <button type="button" onClick={save} disabled={!name.trim()} className={`w-full min-h-11 rounded-xl bg-mint text-ink text-sm font-bold disabled:opacity-40 ${focus}`}>
              Save
            </button>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-stone-400 mb-2">Their page opens in</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Language">
            {[['en', 'English'], ['es', 'Español']].map(([code, label]) => (
              <button
                key={code}
                type="button"
                disabled={readOnly}
                aria-pressed={person.language === code ? 'true' : 'false'}
                onClick={() => updateParticipant(person.slot, { language: code })}
                className={`min-h-11 rounded-xl text-sm font-semibold ${focus} ${person.language === code ? 'bg-coral text-ink' : 'border border-white/15 text-stone-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!person.linkRevoked && (
            <a href={`${memberLink(person.accessToken)}?preview=1`} target="_blank" rel="noopener noreferrer" className={`${ghost} flex items-center justify-center`}>
              View as member
            </a>
          )}
          {!person.linkRevoked && <button type="button" onClick={copyLink} className={ghost}>Copy link</button>}
          {!readOnly && !person.linkRevoked && (
            <button type="button" onClick={() => updateParticipant(person.slot, { linkSentAt: person.linkSentAt ? null : new Date().toISOString() })} className={ghost}>
              {person.linkSentAt ? 'Mark not sent' : 'Mark sent'}
            </button>
          )}
          {!readOnly && <button type="button" onClick={newLink} className={ghost}>New link</button>}
          {!readOnly && (
            <button type="button" disabled={index === 0} onClick={() => reorderMember(person.slot, 'up')} className={`${ghost} disabled:opacity-30`}>
              Move earlier
            </button>
          )}
          {!readOnly && (
            <button type="button" disabled={index === count - 1} onClick={() => reorderMember(person.slot, 'down')} className={`${ghost} disabled:opacity-30`}>
              Move later
            </button>
          )}
        </div>
        {notice && <p role="status" className="text-xs text-stone-400">{notice}</p>}

        {!readOnly && (
          <div className="border-t border-white/10 pt-4 space-y-2">
            {!person.linkRevoked && (
              <button type="button" onClick={turnOff} className={`w-full min-h-11 rounded-xl border border-red-400/40 text-sm font-semibold text-red-300 ${focus}`}>
                Turn off link
              </button>
            )}
            {confirmRemove ? (
              <div className="rounded-2xl border border-red-400/40 p-3 space-y-2">
                <p className="text-sm text-stone-200">
                  Remove {person.name}?{hasHistory ? ' Their payment history is kept.' : ''} Their link stops working and their payout round will need someone new.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { removeMember(person.slot); onClose() }} className={`min-h-11 rounded-xl bg-red-500 text-white text-sm font-bold ${focus}`}>Remove</button>
                  <button type="button" onClick={() => setConfirmRemove(false)} className={ghost}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className={`w-full min-h-11 rounded-xl text-sm font-semibold text-red-300 ${focus}`}>
                Remove from tanda…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AddMemberForm({ onDone }) {
  const { addMember } = useStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <form
      className="bg-panel rounded-2xl border border-mint/40 p-4 space-y-2"
      onSubmit={e => { e.preventDefault(); if (!name.trim()) return; addMember(name.trim(), phone.trim()); onDone() }}
    >
      <p className="text-sm font-bold text-stone-50">Add a member</p>
      <p className="text-xs text-stone-400">They get the next payout round, after the last one.</p>
      <input aria-label="New member first name" className={field} placeholder="First name" value={name} onChange={e => setName(e.target.value)} />
      <input aria-label="New member phone" className={field} placeholder="Phone" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" disabled={!name.trim()} className={`min-h-11 rounded-xl bg-mint text-ink text-sm font-bold disabled:opacity-40 ${focus}`}>Add</button>
        <button type="button" onClick={onDone} className={ghost}>Cancel</button>
      </div>
    </form>
  )
}

export default function MembersView({ readOnly = false }) {
  const { store, updateParticipant } = useStore()
  const { participants, rounds, config } = store
  const [openSlot, setOpenSlot] = useState(null)
  const [adding, setAdding] = useState(false)
  const [copiedSlot, setCopiedSlot] = useState(null)

  const sent = participants.filter(p => p.linkSentAt && !p.linkRevoked).length
  const withPhone = participants.filter(p => p.phone?.trim())
  const money = formatMoney(config.contribution)
  const zelle = config.organizerPhone || ''
  const welcome = bilingual(
    `Welcome to ${config.name}! 🎉 Collection is every ${config.intervalDays} days. Please send ${money} to ${zelle || organizerFallback('en')} via Zelle on collection day. I'll text each of you your own private link. Looking forward to a great tanda with everyone!`,
    `¡Bienvenidos a ${config.name}! 🎉 El cobro es cada ${config.intervalDays} días. Por favor envíen ${money} a ${zelle || organizerFallback('es')} por Zelle el día de cobro. A cada quien le mando su enlace privado. ¡Qué gusto hacer esta tanda juntos!`,
  )
  const groupUrl = buildGroupSmsUrl(withPhone, welcome)
  const open = participants.find(p => p.slot === openSlot) || null
  const openIndex = participants.findIndex(p => p.slot === openSlot)
  const roundsFor = slot => rounds.filter(r => r.recipientSlot === slot).map(r => r.round)

  async function sendWithoutPhone(person) {
    const copied = await copyText(linkMessage(person, config.name), 'Copy this message with their link')
    if (copied) setCopiedSlot(person.slot)
    if (!readOnly) updateParticipant(person.slot, { linkSentAt: new Date().toISOString() })
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-400 truncate">{config.name}</p>
          <h1 className="text-xl font-extrabold tracking-tight text-stone-50">Members · {participants.length}</h1>
        </div>
        {!readOnly && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={ghost}>+ Add</button>
        )}
      </header>

      {adding && <AddMemberForm onDone={() => setAdding(false)} />}

      {!readOnly && (
        <section className="bg-panel rounded-2xl border border-mint/30 p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[10rem]">
            <p className="text-sm font-bold text-stone-50">Links sent: {sent} of {participants.length}</p>
            <p className="text-xs text-stone-400">Send each person their own link. Never post links in the group.</p>
          </div>
          <a
            href={groupUrl ?? undefined}
            onClick={!groupUrl ? e => e.preventDefault() : undefined}
            aria-disabled={!groupUrl}
            className={`min-h-11 px-3 rounded-xl text-sm font-bold flex items-center ${groupUrl ? 'bg-mint text-ink' : 'bg-white/10 text-stone-400'} ${focus}`}
          >
            Group text
          </a>
        </section>
      )}

      <ul className="bg-panel rounded-2xl border border-white/10 px-3" aria-label="Members">
        {participants.map(person => {
          const turns = roundsFor(person.slot)
          const canSms = isValidUsPhone(person.phone)
          return (
            <li key={person.slot} className="flex flex-wrap items-center gap-1.5 py-2.5 border-b border-white/5 last:border-0">
              <span
                className="w-9 h-9 rounded-full text-xs font-bold text-white flex items-center justify-center shrink-0"
                style={{ backgroundColor: avatarColor(person.name) }}
                aria-hidden="true"
              >
                {initials(person.name)}
              </span>
              <div className="flex-1 min-w-[5.5rem]">
                <p className="text-[15px] font-semibold text-stone-50 truncate">
                  {person.name}
                  <span className={`ml-1.5 align-middle rounded-full px-1.5 py-0.5 text-[10px] font-bold ${person.language === 'es' ? 'bg-coral/20 text-coral' : 'bg-white/10 text-stone-400'}`}>
                    {person.language.toUpperCase()}
                  </span>
                </p>
                <p className={`text-xs ${person.linkRevoked ? 'text-red-300' : 'text-stone-400'}`}>
                  {turns.length ? `Round ${turns.join(', ')}` : 'No payout round'} · {linkState(person)}
                </p>
              </div>
              {!readOnly && !person.linkRevoked && (canSms ? (
                <a
                  href={smsUrlWithBody(person.phone, linkMessage(person, config.name))}
                  onClick={() => updateParticipant(person.slot, { linkSentAt: new Date().toISOString() })}
                  aria-label={`Send ${person.name} their link`}
                  className={`shrink-0 min-h-11 px-2.5 rounded-xl text-sm font-bold flex items-center ${person.linkSentAt ? 'border border-white/15 text-stone-200' : 'bg-mint text-ink'} ${focus}`}
                >
                  {person.linkSentAt ? 'Resend' : 'Send link'}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => sendWithoutPhone(person)}
                  aria-label={`Copy ${person.name}'s link message`}
                  className={`shrink-0 min-h-11 px-2.5 rounded-xl text-sm font-bold border border-white/15 text-stone-200 ${focus}`}
                >
                  {copiedSlot === person.slot ? 'Copied' : 'Copy link'}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpenSlot(person.slot)}
                aria-label={`More for ${person.name}`}
                className={`shrink-0 min-h-11 min-w-10 rounded-xl text-lg font-bold text-stone-400 ${focus}`}
              >
                ⋯
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-stone-400 px-1">⋯ has edit, language, View as member, new link, turn off link, move and remove.</p>

      {open && (
        <MemberSheet
          person={open}
          index={openIndex}
          count={participants.length}
          readOnly={readOnly}
          hasHistory={rounds.some(r => r.payments[open.slot] === true)}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  )
}
