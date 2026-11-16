import { useState } from 'react'
import { useStore } from '../../context/StoreContext'
import { ImportError, formatImportSummary, inspectBackup } from '../../utils/importBackup'
import { formatDate } from '../../utils/rounds'

const input = 'w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold-500 transition-colors'

export default function ImportBackup({ onCancel }) {
  const { importBackup } = useStore()
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState(null)
  const [contribution, setContribution] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [saving, setSaving] = useState(false)

  async function onFile(event) {
    const file = event.target.files?.[0]
    setError('')
    setSummary(null)
    setPreview(null)
    setRaw('')
    if (!file) return
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
      })
      const info = inspectBackup(text)
      setRaw(text)
      setPreview(info)
      setName(info.suggestedName)
      setContribution(info.contribution == null ? '' : String(info.contribution))
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Could not read that file.')
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await importBackup(raw, { contribution: Number(contribution), name })
      setSummary(result)
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Import failed. Nothing was saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Import backup</h3>
          <p className="text-xs text-gray-500 mt-1">
            Reads an old tanda JSON export and saves it as an archived cycle. The PIN and any GitHub token are ignored.
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-500">
            Cancel
          </button>
        )}
      </div>

      <input
        type="file"
        accept="application/json,.json"
        aria-label="Backup file"
        onChange={onFile}
        className="block w-full text-sm text-gray-600"
      />

      {preview && (
        <div className="bg-gold-50 border border-gold-200 rounded-xl p-3 text-sm text-gray-700 space-y-1">
          <p>{preview.memberCount} members · {preview.roundCount} rounds · {preview.paymentCount} payments · {preview.paidCount} paid</p>
          <p>Starts {formatDate(preview.startDate)}</p>
        </div>
      )}

      <input
        className={input}
        aria-label="Imported cycle name"
        placeholder="Cycle name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input
        className={input}
        aria-label="Contribution per person"
        placeholder="Contribution per person"
        inputMode="decimal"
        value={contribution}
        onChange={e => setContribution(e.target.value)}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && (
        <p className="text-sm text-emerald-700 whitespace-pre-line">{formatImportSummary(summary)}</p>
      )}

      <button
        type="submit"
        disabled={!preview || saving}
        className="w-full bg-gold-500 hover:bg-gold-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
      >
        {saving ? 'Importing…' : 'Import as archived cycle'}
      </button>
    </form>
  )
}
