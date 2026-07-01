import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import RoundPanel from './RoundPanel'
import RosterEditor from './RosterEditor'
import HistoryLog from './HistoryLog'
import DataControls from './DataControls'
import PublishBanner from './PublishBanner'

const TABS = [
  { id: 'round',    label: 'This Round', icon: '💰' },
  { id: 'roster',   label: 'Roster',     icon: '👥' },
  { id: 'history',  label: 'History',    icon: '📋' },
  { id: 'settings', label: 'Settings',   icon: '⚙️' },
]

export default function AdminDashboard() {
  const { store } = useStore()
  const [tab, setTab] = useState('round')

  return (
    <div className="min-h-screen bg-gold-50">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tanda Manager</h1>
            <p className="text-xs text-gray-500">Admin · {store.config.organizerName}</p>
          </div>
          <a
            href="/tanda-manager/"
            className="text-xs text-gold-600 font-semibold bg-gold-50 px-3 py-1.5 rounded-full border border-gold-200 hover:bg-gold-100 transition-colors"
          >
            Public Board ↗
          </a>
        </div>
      </div>

      {/* Scrollable content with bottom padding for tab bar */}
      <div className="max-w-2xl mx-auto p-4 pb-28">
        {tab !== 'settings' && <PublishBanner onGoToSettings={() => setTab('settings')} />}
        {tab === 'round'    && <RoundPanel />}
        {tab === 'roster'   && <RosterEditor />}
        {tab === 'history'  && <HistoryLog />}
        {tab === 'settings' && <DataControls />}
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
