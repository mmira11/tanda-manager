// src/components/admin/PublishBanner.jsx — cross-tab publish + backup nudge
import { useStore } from '../../context/StoreContext'
import { usePublish } from '../../hooks/usePublish'

const FOURTEEN_DAYS = 14 * 86400000

export default function PublishBanner({ onGoToSettings }) {
  const { store } = useStore()
  const { githubToken, status, error, hasUnpublishedChanges, publish } = usePublish(store)

  const lastBackup = parseInt(localStorage.getItem('tanda_last_backup') || '0')
  const backupStale = !lastBackup || Date.now() - lastBackup > FOURTEEN_DAYS
  const backupLabel = lastBackup
    ? `${Math.floor((Date.now() - lastBackup) / 86400000)} days ago`
    : 'never'

  if (!hasUnpublishedChanges && !backupStale && status !== 'ok' && status !== 'error') return null

  return (
    <div className="mb-4 space-y-2">
      {hasUnpublishedChanges && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />
          <p className="text-sm text-amber-800 font-medium flex-1">Unpublished changes</p>
          {githubToken ? (
            <button
              onClick={publish}
              disabled={status === 'loading'}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Publishing…' : 'Publish'}
            </button>
          ) : (
            <button
              onClick={onGoToSettings}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Set up publishing
            </button>
          )}
        </div>
      )}
      {status === 'ok' && !hasUnpublishedChanges && (
        <p className="text-xs text-emerald-600 font-medium px-1">Published! Public board is up to date.</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 px-1">{error}</p>
      )}
      {backupStale && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2">
          <p className="text-xs text-gray-500 flex-1">
            Last full backup: <strong>{backupLabel}</strong> — published data doesn't include phone numbers.
          </p>
          <button
            onClick={onGoToSettings}
            className="text-xs font-semibold text-gold-600 hover:text-gold-700 flex-shrink-0"
          >
            Back up
          </button>
        </div>
      )}
    </div>
  )
}
