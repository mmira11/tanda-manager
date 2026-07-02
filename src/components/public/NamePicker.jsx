// src/components/public/NamePicker.jsx — one-time "find my name" chooser
import { useState } from 'react'

export default function NamePicker({ participants, t, onPick }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white border-2 border-dashed border-gold-300 text-gold-700 font-semibold text-sm py-2.5 rounded-2xl hover:bg-gold-50 transition-colors"
      >
        {t.findMyName}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gold-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">{t.whoAreYou}</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
          {t.close}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {participants.filter(p => p.name).map(p => (
          <button
            key={p.slot}
            onClick={() => onPick(p.slot)}
            className="text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gold-50 hover:text-gold-700 rounded-xl py-2.5 px-3 text-left truncate transition-colors"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}
