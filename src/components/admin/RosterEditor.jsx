import { useState } from 'react'
import { useStore } from '../../context/StoreContext'

function ParticipantRow({ participant }) {
  const { updateParticipant } = useStore()
  const [name, setName] = useState(participant.name)
  const [phone, setPhone] = useState(participant.phone)

  return (
    <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 items-center py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
        {participant.slot}
      </span>
      <input
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
        value={name}
        placeholder={`Slot ${participant.slot}`}
        onChange={e => setName(e.target.value)}
        onBlur={() => updateParticipant(participant.slot, { name: name.trim() })}
      />
      <input
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-400 bg-gray-50 focus:bg-white transition-colors w-full"
        value={phone}
        placeholder="Phone"
        inputMode="tel"
        onChange={e => setPhone(e.target.value)}
        onBlur={() => updateParticipant(participant.slot, { phone: phone.trim() })}
      />
    </div>
  )
}

export default function RosterEditor() {
  const { store, addMember } = useStore()
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
        <h3 className="font-semibold text-gray-900 mb-1">Participant Roster</h3>
        <p className="text-xs text-gray-500 mb-4">
          Edit any name or phone — changes save when you tap outside the field.
        </p>
        <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 mb-2 px-0.5">
          <span />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone (Zelle)</span>
        </div>
        <div>
          {store.participants.map(p => (
            <ParticipantRow key={p.slot} participant={p} />
          ))}
        </div>

        {showAddForm ? (
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
        )}
      </div>

      <div className="bg-gold-50 border border-gold-200 rounded-2xl p-4 text-sm text-gray-700">
        <strong>Tip:</strong> Phone numbers are used for SMS and WhatsApp reminders only.
        They're stored on this device and never shared.
      </div>
    </div>
  )
}
