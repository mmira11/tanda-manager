import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const POLL_MS = 10000

function isNotFound(error) {
  if (!error) return false
  return error.code === 'P0002' || /not found/i.test(error.message || '')
}

export function useMemberBoard(token) {
  const [board, setBoard] = useState(null)
  const [status, setStatus] = useState('loading')

  const load = useCallback(async () => {
    if (!token || token.length < 16) {
      setBoard(null)
      setStatus('notfound')
      return
    }
    const { data, error } = await supabase.rpc('get_member_board', { p_token: token })
    if (error) {
      if (isNotFound(error)) {
        setBoard(null)
        setStatus('notfound')
      } else {
        // A failed poll should not wipe a board the member is already looking at.
        setStatus(current => (current === 'ready' ? current : 'error'))
      }
      return
    }
    if (data == null) {
      setBoard(null)
      setStatus('notfound')
      return
    }
    setBoard(data)
    setStatus('ready')
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisible)

    // No Realtime channel (N8): the old public broadcast channel let anyone send or listen.
    // Polling every 10 s plus a refetch when the tab regains focus keeps the page current.
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return { board, status }
}
