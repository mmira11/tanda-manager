import { buildRounds } from './rounds'

const AVATAR_COLORS = ['#14857F', '#0F6B66', '#C46B4A', '#3D6B8C', '#7A5C3E', '#2F6F4E', '#8C4A6F', '#4E5B8C']

export function paymentStats(records, contribution) {
  const list = records || []
  const total = list.length
  const paid = list.filter(item => item === true || item?.paid === true).length
  const percent = total === 0 ? 0 : Math.round((paid / total) * 100)
  const amount = Number(contribution) || 0
  return {
    paid,
    total,
    percent,
    collected: paid * amount,
    pot: total * amount,
  }
}

export function roundStepState(roundNumber, currentRound) {
  if (currentRound == null || Number.isNaN(Number(currentRound))) return 'future'
  if (roundNumber < currentRound) return 'past'
  if (roundNumber === currentRound) return 'current'
  return 'future'
}

export function daysUntil(isoDate, today = new Date()) {
  if (!isoDate) return null
  const target = new Date(`${isoDate}T12:00:00`)
  const now = new Date(today)
  now.setHours(12, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

export function compactCountdown(time) {
  if (!time || time.done) return ''
  const hours = Math.max(0, time.hours || 0)
  const minutes = Math.max(0, time.minutes || 0)
  if (time.days > 0) return `${time.days}d ${hours}h`
  return `${hours}h ${minutes}m`
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function avatarColor(name) {
  const text = String(name || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function canNudge(member) {
  return member?.paid !== true && Boolean(String(member?.phone || '').trim())
}

// The member RPC does not list every round. Slot order is payout order, and each
// round is one interval after the cycle start, so the schedule can be derived.
export function memberRounds(board) {
  const progress = [...(board?.progress || [])].sort((a, b) => a.slot - b.slot)
  const start = board?.cycle?.start_date
  const interval = Number(board?.cycle?.interval_days)
  if (!start || !Number.isInteger(interval) || interval < 1 || progress.length === 0) return []
  const current = board?.current_round?.round_number ?? null
  return buildRounds(start, interval, progress.length).map(plan => ({
    round: plan.roundNumber,
    collectDate: plan.collectDate,
    payoutDate: plan.payoutDate,
    name: progress.find(person => person.slot === plan.roundNumber)?.display_first_name || '',
    state: roundStepState(plan.roundNumber, current),
  }))
}
