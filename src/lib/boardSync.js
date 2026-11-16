// Tells open member pages to refetch get_member_board. The payload is empty on purpose:
// anon clients must not receive payment rows. Member pages also poll, so a missed
// broadcast still catches up.
import { supabase } from './supabase'

export const BOARD_CHANNEL = 'tanda-board'

let channel = null
let ready = false

export function notifyBoardChanged() {
  if (typeof supabase.channel !== 'function') return
  try {
    if (!channel) {
      channel = supabase.channel(BOARD_CHANNEL)
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        ready = true
        const sent = channel.send({ type: 'broadcast', event: 'changed', payload: {} })
        if (sent?.catch) sent.catch(() => {})
      })
      return
    }
    if (!ready || typeof channel.send !== 'function') return
    const sent = channel.send({ type: 'broadcast', event: 'changed', payload: {} })
    if (sent?.catch) sent.catch(() => {})
  } catch {
    // Polling on the member page still picks up the change.
  }
}
