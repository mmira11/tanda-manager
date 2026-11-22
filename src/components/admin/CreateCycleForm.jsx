// src/components/admin/CreateCycleForm.jsx — first run after sign-in: define a cycle and its payout order.
import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { buildRounds, formatDate } from '../../utils/rounds'
import { useLang } from '../../context/LangContext'
import { formatMoney, isWholeCents } from '../../utils/money'
import { isValidUsPhone } from '../../utils/messaging'
import { parseMemberList, shuffled } from '../../utils/memberList'

const input = 'w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-500 transition-colors'
const emptyMember = () => ({ name: '', phone: '' })

const MAX_INTERVAL_DAYS = 365

// A date input can hand back a 5-digit year, and an autofilled phone number can land in
// the days box; either one makes date math throw, so check before building a preview.
function isValidStartDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(iso + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

function isValidInterval(n) {
  return Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL_DAYS
}

export function validateCycleForm(f) {
  const errors = {}
  if (!f.name.trim()) errors.name = 'Name is required'
  if (!f.startDate) errors.startDate = 'Start date is required'
  else if (!isValidStartDate(f.startDate)) errors.startDate = 'Pick a real date'
  if (!isValidInterval(f.intervalDays)) errors.intervalDays = `Whole number of days, 1 to ${MAX_INTERVAL_DAYS}`
  if (!isWholeCents(f.contribution)) errors.contribution = 'Enter a positive amount in dollars and cents'
  if (f.members.length < 2) errors.members = 'Add at least 2 members'
  else if (f.members.some(m => !m.name.trim())) errors.members = 'Every member needs a first name'
  return errors
}

export default function CreateCycleForm({ onImport, onCancel }) {
  const { createCycle } = useStore()
  const { locale } = useLang()
  const [form, setForm] = useState({
    name: '', startDate: '', intervalDays: '14', contribution: '',
    organizerName: '', organizerPhone: '', members: [emptyMember(), emptyMember()],
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [pasted, setPasted] = useState('')
  const [pasteNote, setPasteNote] = useState('')

  const parsed = {
    ...form,
    intervalDays: Number(form.intervalDays),
    contribution: Number(form.contribution),
  }
  const memberCount = form.members.length
  const plan = isValidStartDate(parsed.startDate) && isValidInterval(parsed.intervalDays) && memberCount > 0
    ? buildRounds(parsed.startDate, parsed.intervalDays, memberCount)
    : null

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function setMember(i, field, value) {
    setForm(f => ({ ...f, members: f.members.map((m, j) => (j === i ? { ...m, [field]: value } : m)) }))
    setErrors(e => ({ ...e, members: undefined }))
  }

  function moveMember(i, delta) {
    setForm(f => {
      const members = [...f.members]
      ;[members[i], members[i + delta]] = [members[i + delta], members[i]]
      return { ...f, members }
    })
  }

  // Pasted people go after anyone already typed; untouched blank rows are dropped.
  function addPasted() {
    const rows = parseMemberList(pasted)
    if (rows.length === 0) { setPasteNote('Nothing to add. Put one person per line.'); return }
    setForm(f => {
      const kept = f.members.filter(m => m.name.trim() || m.phone.trim())
      return { ...f, members: [...kept, ...rows.map(({ name, phone }) => ({ name, phone }))] }
    })
    setErrors(e => ({ ...e, members: undefined }))
    setPasted('')
    const flagged = rows.filter(r => !r.phoneOk || !r.name).length
    setPasteNote(`Added ${rows.length} ${rows.length === 1 ? 'person' : 'people'}.${flagged ? ` Check ${flagged} marked below.` : ''}`)
  }

  function shuffleMembers() {
    setForm(f => ({ ...f, members: shuffled(f.members) }))
  }

  function removeMember(i) {
    setForm(f => ({ ...f, members: f.members.filter((_, j) => j !== i) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validateCycleForm(parsed)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    setSaveError('')
    try {
      await createCycle(parsed)
    } catch (err) {
      setSaveError(err.message || String(err))
      setSaving(false)
    }
  }

  const field = (label, name, props = {}) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input id={name} className={input} value={form[name]} onChange={e => set(name, e.target.value)} {...props} />
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
    </div>
  )

  return (
    <div className="admin-theme min-h-screen bg-ink p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-lg mx-auto space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-2">💰</div>
          <h1 className="text-2xl font-bold text-gray-900">Create a cycle</h1>
          <p className="text-gray-500 text-sm mt-1">Rounds and payment rows are generated from this.</p>
        </div>

        {field('Cycle name', 'name', { placeholder: 'Tanda 2027' })}
        <div className="grid grid-cols-2 gap-3">
          {field('First collection date', 'startDate', { type: 'date' })}
          {field('Days between rounds', 'intervalDays', { type: 'number', min: 1, step: 1, inputMode: 'numeric' })}
        </div>
        {field('Contribution per person ($)', 'contribution', { type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}
        <div className="grid grid-cols-2 gap-3">
          {field('Organizer name (optional)', 'organizerName')}
          {field('Organizer Zelle (optional)', 'organizerPhone', { inputMode: 'tel' })}
        </div>

        <div>
          <label htmlFor="paste-members" className="block text-sm font-medium text-gray-700 mb-1">
            Paste names and phones (optional)
          </label>
          <textarea
            id="paste-members"
            rows={4}
            className={`${input} resize-y`}
            placeholder={'Maria 555-010-0101\nRosa (555) 010-0102\nLuis'}
            value={pasted}
            onChange={e => { setPasted(e.target.value); setPasteNote('') }}
          />
          <p className="text-xs text-gray-500 mt-1">One person per line, from your contacts or group chat. Order here is payout order.</p>
          <button
            type="button"
            onClick={addPasted}
            disabled={!pasted.trim()}
            className="mt-2 w-full border-2 border-gold-400 text-gold-700 font-semibold py-2 rounded-xl text-sm hover:bg-gold-50 disabled:opacity-40"
          >
            Add to list
          </button>
          {pasteNote && <p role="status" className="text-xs text-gray-600 mt-1">{pasteNote}</p>}

          <div className="flex items-center justify-between mt-5 mb-1">
            <p className="text-sm font-medium text-gray-700">Members, in payout order</p>
            {memberCount > 1 && (
              <button type="button" onClick={shuffleMembers} className="text-xs font-semibold text-gold-700 min-h-9 px-1">
                Shuffle order
              </button>
            )}
          </div>
          <div className="space-y-2">
            {form.members.map((m, i) => (
              <div key={i} className="grid grid-cols-[1.75rem_1fr_1fr_auto] gap-2 items-center">
                <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <input className={input} placeholder="First name" aria-label={`Member ${i + 1} first name`}
                  value={m.name} onChange={e => setMember(i, 'name', e.target.value)} />
                <input className={input} placeholder="Phone" aria-label={`Member ${i + 1} phone`} inputMode="tel"
                  value={m.phone} onChange={e => setMember(i, 'phone', e.target.value)} />
                <div className="flex items-center">
                  <button type="button" onClick={() => moveMember(i, -1)} disabled={i === 0}
                    aria-label={`Move member ${i + 1} up`} className="w-6 h-7 text-gray-400 hover:text-gray-700 disabled:opacity-25">↑</button>
                  <button type="button" onClick={() => moveMember(i, 1)} disabled={i === memberCount - 1}
                    aria-label={`Move member ${i + 1} down`} className="w-6 h-7 text-gray-400 hover:text-gray-700 disabled:opacity-25">↓</button>
                  <button type="button" onClick={() => removeMember(i)}
                    aria-label={`Remove member ${i + 1}`} className="w-6 h-7 text-red-400 hover:text-red-600">×</button>
                </div>
                {m.phone.trim() && !isValidUsPhone(m.phone) && (
                  <p className="col-start-2 col-span-3 -mt-1 text-xs font-semibold text-amber-700">
                    Check this number: it needs 10 digits.
                  </p>
                )}
              </div>
            ))}
          </div>
          {errors.members && <p className="text-red-500 text-xs mt-1">{errors.members}</p>}
          <button type="button" onClick={() => setForm(f => ({ ...f, members: [...f.members, emptyMember()] }))}
            className="mt-3 w-full border-2 border-gold-400 text-gold-700 font-semibold py-2 rounded-xl text-sm hover:bg-gold-50">
            + Add member
          </button>
        </div>

        {plan && parsed.contribution > 0 && (
          <div className="bg-gold-50 border border-gold-200 rounded-xl p-3 text-sm text-gray-700">
            {memberCount} rounds · {formatMoney(parsed.contribution * Math.max(memberCount - 1, 0))} pot each round ·
            last payout {formatDate(plan[plan.length - 1].payoutDate, locale)}
          </div>
        )}

        {saveError && <p className="text-red-600 text-sm text-center">{saveError}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
          {saving ? 'Creating…' : 'Create cycle'}
        </button>
        {onImport && (
          <button type="button" onClick={onImport} className="w-full text-sm font-semibold text-gold-700">
            Import a backup instead
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="w-full text-sm font-semibold text-gray-500">
            Cancel
          </button>
        )}
      </form>
    </div>
  )
}
