import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { getCurrentRound } from '../../utils/rounds'
import RoundPanel from './RoundPanel'
import RosterEditor from './RosterEditor'
import HistoryLog from './HistoryLog'
import DataControls from './DataControls'

const TABS = [
  { id: 'round',    label: 'This Round', icon: '💰' },
  { id: 'roster',   label: 'Roster',     icon: '👥' },
  { id: 'history',  label: 'History',    icon: '📋' },
  { id: 'settings', label: 'Settings',   icon: '⚙️' },
]

export default function AdminDashboard({ email, onNewCycle }) {
  const { store, cycles, selectCycle, error, clearError } = useStore()
  const [tab, setTab] = useState('round')
  const [selectedRound, setSelectedRound] = useState(() => getCurrentRound(store.rounds).round)

  const editRound = (roundNum) => {
    setSelectedRound(roundNum)
    setTab('round')
  }

  return (
    <div className="min-h-screen bg-gold-50">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda Manager</h1>
            <p className="text-xs text-gray-500">Admin · {store.config.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {cycles.length > 0 && (
              <select
                aria-label="Cycle"
                value={store.config.cycleId}
                onChange={e => selectCycle(e.target.value)}
                className="text-xs border border-gray-200 rounded-full px-2 py-1.5 bg-white max-w-[11rem]"
              >
                {cycles.map(cycle => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name} · {cycle.status}
                  </option>
                ))}
              </select>
            )}
            {onNewCycle && (
              <button
                type="button"
                onClick={onNewCycle}
                className="text-xs text-gold-700 font-semibold bg-white px-3 py-1.5 rounded-full border border-gold-200 hover:bg-gold-50"
              >
                New cycle
              </button>
            )}
            <a
              href={import.meta.env.BASE_URL || '/'}
              className="text-xs text-gold-600 font-semibold bg-gold-50 px-3 py-1.5 rounded-full border border-gold-200 hover:bg-gold-100 transition-colors"
            >
              Home
            </a>
          </div>
        </div>
      </div>

      {/* Scrollable content with bottom padding for tab bar */}
      <div className="max-w-2xl mx-auto p-4 pb-28">
        {store.config.status === 'archived' && (
          <div className="mb-4 bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700">
            Archived cycle. History lists every round, including the last one.
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <p className="text-sm text-red-700 flex-1">Couldn't save: {error}</p>
            <button onClick={clearError} className="text-xs font-semibold text-red-700">Dismiss</button>
          </div>
        )}
        {tab === 'round'    && <RoundPanel selectedRound={selectedRound} onSelectRound={setSelectedRound} readOnly={store.config.status === 'archived'} />}
        {tab === 'roster'   && <RosterEditor readOnly={store.config.status === 'archived'} />}
        {tab === 'history'  && <HistoryLog onEditRound={editRound} />}
        {tab === 'settings' && <DataControls email={email} />}
      </div>

      {/* Fixed bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
                tab === t.id ? 'text-gold-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="text-xs font-medium">{t.label}</span>
              {tab === t.id && <div className="w-4 h-0.5 bg-gold-500 rounded-full" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
