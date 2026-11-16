import { useState, useEffect } from 'react'
import { useStore } from '../../context/StoreContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../utils/rounds'
import { useLang } from '../../context/LangContext'
import { formatMoney } from '../../utils/money'
import ImportBackup from './ImportBackup'

const input = 'w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-500 transition-colors'

export default function DataControls({ email }) {
  const { store, exportData, saveConfig } = useStore()
  const { locale } = useLang()
  const { config, participants } = store
  const [organizerName, setOrganizerName] = useState(config.organizerName)
  const [organizerPhone, setOrganizerPhone] = useState(config.organizerPhone)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setOrganizerName(config.organizerName)
    setOrganizerPhone(config.organizerPhone)
  }, [config.organizerName, config.organizerPhone])

  const dirty = organizerName !== config.organizerName || organizerPhone !== config.organizerPhone

  async function handleSaveOrganizer() {
    await saveConfig({ organizerName: organizerName.trim(), organizerPhone: organizerPhone.trim() })
    setSaved(true)
  }

  function handleExport() {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tanda-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const row = (label, value) => (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-3">Cycle</h3>
        <div className="space-y-1 text-sm">
          {row('Name', config.name)}
          {row('First collection', formatDate(config.startDate, locale))}
          {row('Days between rounds', config.intervalDays)}
          {row('Contribution', `${formatMoney(config.contribution)} per person`)}
          {row('Pot', `${formatMoney(config.contribution * participants.length)} per round`)}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-1">Organizer</h3>
        <p className="text-xs text-gray-500 mb-3">Used in reminder messages.</p>
        <div className="space-y-3">
          <input className={input} placeholder="Organizer name" aria-label="Organizer name"
            value={organizerName} onChange={e => { setOrganizerName(e.target.value); setSaved(false) }} />
          <input className={input} placeholder="Zelle number" aria-label="Organizer Zelle" inputMode="tel"
            value={organizerPhone} onChange={e => { setOrganizerPhone(e.target.value); setSaved(false) }} />
          <button
            onClick={handleSaveOrganizer}
            disabled={!dirty}
            className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
          >
            Save organizer
          </button>
          {saved && !dirty && <p className="text-xs text-emerald-600 text-center font-medium">Saved</p>}
        </div>
      </div>

      <ImportBackup />

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-1">Export</h3>
        <p className="text-xs text-gray-500 mb-3">
          Data is saved in Supabase as you go. Download a JSON copy of this cycle for your records.
        </p>
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 bg-gold-50 hover:bg-gold-100 text-gold-700 font-semibold py-3 rounded-xl border border-gold-200 transition-colors"
        >
          ↓ Download Export (JSON)
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-1">Account</h3>
        <p className="text-sm text-gray-500 mb-3">Signed in as <strong>{email}</strong></p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full border-2 border-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
