// src/hooks/usePublish.js — shared publish state/logic for admin surfaces
import { useState, useCallback } from 'react'
import { loadGitHubToken, saveGitHubToken, publishToGitHub } from '../utils/github'

export function usePublish(store) {
  const [githubToken, setGithubToken] = useState(loadGitHubToken)
  const [status, setStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [error, setError] = useState('')
  const [lastPublished, setLastPublished] = useState(
    () => parseInt(localStorage.getItem('tanda_last_published') || '0')
  )

  const updateToken = useCallback((val) => {
    setGithubToken(val)
    saveGitHubToken(val)
  }, [])

  const publish = useCallback(async () => {
    if (!githubToken) return
    setStatus('loading')
    setError('')
    try {
      await publishToGitHub(githubToken, store)
      const ts = store.lastModified
      localStorage.setItem('tanda_last_published', String(ts))
      setLastPublished(ts)
      setStatus('ok')
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }, [githubToken, store])

  return {
    githubToken,
    updateToken,
    status,
    error,
    lastPublished,
    hasUnpublishedChanges: store.lastModified > lastPublished,
    publish,
  }
}
