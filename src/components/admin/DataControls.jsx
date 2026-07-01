import { useRef, useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { usePublish } from '../../hooks/usePublish'

export default function DataControls() {
  const { store, exportData, importData, resetData, saveConfig } = useStore()
  const fileRef = useRef(null)
  const [importStatus, setImportStatus] = useState(null)
  const {
    githubToken,
    updateToken,
    status: publishStatus,
    error: publishError,
    hasUnpublishedChanges,
    publish,
  } = usePublish(store)
  const [editingPin, setEditingPin] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')

  function handleExport() {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tanda-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    localStorage.setItem('tanda_last_backup', String(Date.now()))
  }

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        importData(ev.target.result)
        setImportStatus({ ok: true, msg: 'Data restored successfully!' })
      } catch {
        setImportStatus({ ok: false, msg: 'Invalid backup file. Import failed.' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleReset() {
    if (window.confirm('Reset ALL data? Export a backup first — this cannot be undone.')) {
      resetData()
    }
  }

  function handlePinSave() {
    if (newPin.length < 4) { setPinError('PIN must be at least 4 digits'); return }
    if (newPin !== newPinConfirm) { setPinError('PINs do not match'); return }
    saveConfig({ pin: newPin })
    setEditingPin(false)
    setNewPin('')
    setNewPinConfirm('')
    setPinError('')
  }

  return (
    <div className="space-y-4">
      {/* Organizer info */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-3">Account Info</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Organizer</span>
            <span className="font-medium">{store.config.organizerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Your phone (Zelle)</span>
            <span className="font-medium">{store.config.organizerPhone || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Your slot</span>
            <span className="font-medium">#{store.config.organizerSlot}</span>
          </div>
        </div>
      </div>

      {/* Change PIN */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Admin PIN</h3>
          <button
            onClick={() => { setEditingPin(!editingPin); setPinError('') }}
            className="text-xs text-gold-600 font-semibold hover:text-gold-700"
          >
            {editingPin ? 'Cancel' : 'Change PIN'}
          </button>
        </div>
        {editingPin ? (
          <div className="space-y-3 mt-3">
            <input
              type="password" inputMode="numeric" maxLength={8}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-center text-xl tracking-widest focus:outline-none focus:border-gold-500"
              value={newPin} onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
              placeholder="New PIN"
            />
            <input
              type="password" inputMode="numeric" maxLength={8}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-center text-xl tracking-widest focus:outline-none focus:border-gold-500"
              value={newPinConfirm} onChange={e => { setNewPinConfirm(e.target.value.replace(/\D/g, '')); setPinError('') }}
              placeholder="Confirm new PIN"
            />
            {pinError && <p className="text-red-500 text-xs">{pinError}</p>}
            <button
              onClick={handlePinSave}
              className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              Save New PIN
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">PIN is set. Tap "Change PIN" to update it.</p>
        )}
      </div>

      {/* Public board sync */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-1">Public Board</h3>
        <p className="text-xs text-gray-500 mb-3">
          Publishes current tanda state to the public board. Requires a GitHub personal access token
          with <strong>repo</strong> scope.
        </p>
        <input
          type="password"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500 transition-colors mb-3"
          placeholder="GitHub token (ghp_…)"
          value={githubToken}
          onChange={e => updateToken(e.target.value)}
        />
        {hasUnpublishedChanges && (
          <p className="text-xs text-orange-600 font-semibold mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block flex-shrink-0" />
            Unpublished changes
          </p>
        )}
        <button
          onClick={publish}
          disabled={!githubToken || publishStatus === 'loading'}
          className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold py-3 rounded-xl border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {publishStatus === 'loading' ? 'Publishing…' : '↑ Publish to Public Board'}
        </button>
        {publishStatus === 'ok' && (
          <p className="text-xs text-emerald-600 text-center mt-2 font-medium">
            Published! Public board will refresh in a few seconds.
          </p>
        )}
        {publishStatus === 'error' && (
          <p className="text-xs text-red-600 text-center mt-2">{publishError}</p>
        )}
      </div>

      {/* Data backup */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-1">Data & Backup</h3>
        <p className="text-xs text-gray-500 mb-4">
          Your data lives only in this browser. Export regularly and save to Google Drive.
        </p>
        <div className="space-y-3">
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 bg-gold-50 hover:bg-gold-100 text-gold-700 font-semibold py-3 rounded-xl border border-gold-200 transition-colors"
          >
            ↓ Download Backup (JSON)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-3 rounded-xl border border-blue-200 transition-colors"
          >
            ↑ Restore from Backup
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          {importStatus && (
            <div className={`text-sm text-center p-2.5 rounded-xl ${
              importStatus.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {importStatus.msg}
            </div>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-red-100">
        <h3 className="font-semibold text-red-700 mb-1">Danger Zone</h3>
        <p className="text-xs text-gray-500 mb-3">Resets all participants, payments, and notes. Cannot be undone.</p>
        <button
          onClick={handleReset}
          className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 rounded-xl border border-red-200 transition-colors"
        >
          Reset All Data
        </button>
      </div>
    </div>
  )
}
