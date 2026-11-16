import { isValidUsPhone } from './messaging'

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
  return member?.paid !== true && isValidUsPhone(member?.phone)
}

function fallbackRounds(board) {
  if (!board || Array.isArray(board)) return []
  const current = board.current_round
  const me = board.me
  const steps = []
  if (current?.round_number != null) {
    steps.push({
      number: current.round_number,
      collect_date: current.collect_date ?? null,
      payout_date: current.payout_date ?? null,
      recipient_first_name: current.recipient_first_name || '',
    })
  }
  const ownNumber = me?.slot
  const listed = steps.some(step => Number(step.number) === Number(ownNumber))
  if (me?.payout_date && ownNumber != null && !listed) {
    steps.push({
      number: ownNumber,
      collect_date: null,
      payout_date: me.payout_date,
      recipient_first_name: me.display_first_name || '',
    })
  } else if (!steps.length && me?.payout_date) {
    steps.push({
      number: ownNumber || 1,
      collect_date: null,
      payout_date: me.payout_date,
      recipient_first_name: me.display_first_name || '',
    })
  }
  return steps
}

// Prefer the rounds array from get_member_board. If that migration is not applied
// yet, keep the current round and this member's payout turn so the stepper is not blank.
export function memberRoundSteps(rounds, currentRound, board) {
  const provided = Array.isArray(rounds) && rounds.length > 0 ? rounds : fallbackRounds(board)
  const current = currentRound ?? board?.current_round?.round_number ?? null
  return provided
    .map(round => ({
      round: Number(round.number),
      collectDate: round.collect_date,
      payoutDate: round.payout_date,
      name: round.recipient_first_name || '',
      state: roundStepState(Number(round.number), current),
    }))
    .sort((a, b) => a.round - b.round)
}
