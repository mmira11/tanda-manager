import { useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { buildGroupSmsUrl } from '../../utils/messaging'

function hasPaymentHistory(store, slot) {
  return store.rounds.some(r => r.payments[slot] === true)
}

function ParticipantRow({ participant, editMode, isFirst, isLast, store }) {
  const { updateParticipant, reorderMember, removeMember } = useStore()
  const [name, setName] = useState(participant.name)
  const [phone, setPhone] = useState(participant.phone)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setName(participant.name)
    setPhone(participant.phone)
  }, [participant.name, participant.phone])

  useEffect(() => {
    if (!editMode) setConfirming(false)
  }, [editMode])

  const hasHistory = hasPaymentHistory(store, participant.slot)

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className={`grid gap-2 items-center py-2.5 ${editMode ? 'grid-cols-[2rem_1fr_1fr_auto]' : 'grid-cols-[2rem_1fr_1fr]'}`}>
        <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {participant.slot}
        </span>
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
          value={name}
          placeholder={`Slot ${participant.slot}`}
          readOnly={editMode}
          onChange={e => setName(e.target.value)}
          onBlur={() => !editMode && updateParticipant(participant.slot, { name: name.trim() })}
        />
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
          value={phone}
          placeholder="Phone"
          inputMode="tel"
          readOnly={editMode}
          onChange={e => setPhone(e.target.value)}
          onBlur={() => !editMode && updateParticipant(participant.slot, { phone: phone.trim() })}
        />
        {editMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => reorderMember(participant.slot, 'up')}
              disabled={isFirst}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              onClick={() => reorderMember(participant.slot, 'down')}
              disabled={isLast}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-sm"
              aria-label="Remove member"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="mb-3 p-3 border-2 border-red-200 rounded-xl bg-red-50 space-y-2">
          <p className="text-sm text-gray-700">
            {hasHistory
              ? `⚠️ ${participant.name || `Slot ${participant.slot}`} has payment history. Removing them will delete all recorded payments.`
              : `Remove ${participant.name || `Slot ${participant.slot}`} from the roster? This cannot be undone.`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => removeMember(participant.slot)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
            >
              Remove
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 bg-white border border-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RosterEditor() {
  const { store, addMember } = useStore()
  const [editMode, setEditMode] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  function handleFormReset() {
    setShowAddForm(false)
    setNewName('')
    setNewPhone('')
  }

  function handleAddSave() {
    if (!newName.trim()) return
    addMember(newName.trim(), newPhone.trim())
    handleFormReset()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Participant Roster</h3>
          <button
            onClick={() => setEditMode(m => !m)}
            className={`text-sm font-semibold px-3 py-1 rounded-lg transition-colors ${
              editMode
                ? 'bg-gold-500 text-white hover:bg-gold-600'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {editMode ? 'Done' : 'Edit Roster'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {editMode
            ? 'Use ↑↓ to reorder or × to remove a member.'
            : 'Edit any name or phone — changes save when you tap outside the field.'}
        </p>
        <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 mb-2 px-0.5">
          <span />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone (Zelle)</span>
        </div>
        <div>
          {store.participants.map((p, i) => (
            <ParticipantRow
              key={p.slot}
              participant={p}
              editMode={editMode}
              isFirst={i === 0}
              isLast={i === store.participants.length - 1}
              store={store}
            />
          ))}
        </div>

        {!editMode && (showAddForm ? (
          <div className="mt-4 p-4 border-2 border-gold-200 rounded-xl bg-gold-50 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {store.participants.length + 1}
              </span>
              <span className="text-xs text-gray-400">Slot auto-assigned</span>
            </div>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-white transition-colors"
              value={newName}
              placeholder="Name"
              onChange={e => setNewName(e.target.value)}
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-white transition-colors"
              value={newPhone}
              placeholder="Phone (Zelle)"
              inputMode="tel"
              onChange={e => setNewPhone(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddSave}
                disabled={!newName.trim()}
                className="flex-1 bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={handleFormReset}
                className="flex-1 bg-white border border-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 w-full border-2 border-gold-400 text-gold-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-50 transition-colors"
          >
            + Add Member
          </button>
        ))}
      </div>

      {(() => {
        const withPhone = store.participants.filter(p => p.phone?.trim())
        const orgPhone = store.config?.organizerPhone || ''
        const body = `Welcome to Tanda 2026! 🎉 Collection is every Friday — please send $200 to ${orgPhone || 'the organizer'} via Zelle on collection day. Looking forward to a great tanda with everyone!`
        const groupUrl = buildGroupSmsUrl(withPhone, body)
        return (
          <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-1">Group Message</h3>
            <p className="text-xs text-gray-500 mb-4">
              Open your SMS app with all members pre-loaded and a welcome message ready to send.
            </p>
            <a
              href={groupUrl ?? undefined}
              onClick={!groupUrl ? e => e.preventDefault() : undefined}
              className={`flex items-center justify-center gap-2 w-full font-semibold py-2.5 rounded-xl text-sm transition-colors ${
                groupUrl
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <span>💬</span>
              Start Group Chat ({withPhone.length})
            </a>
            {withPhone.length < 2 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Add phone numbers to at least 2 members to enable.
              </p>
            )}
          </div>
        )
      })()}

      <div className="bg-gold-50 border border-gold-200 rounded-2xl p-4 text-sm text-gray-700">
        <strong>Tip:</strong> Phone numbers are used for SMS and WhatsApp reminders only.
        They're stored on this device and never shared.
      </div>
    </div>
  )
}
