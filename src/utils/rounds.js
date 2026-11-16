export function getCurrentRound(rounds, today = new Date()) {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const active = rounds.find(r => {
    const p = new Date(r.payoutDate + 'T12:00:00')
    p.setHours(0, 0, 0, 0)
    return p >= d
  })
  return active || rounds[rounds.length - 1]
}

export function clampRound(n, rounds) {
  if (!rounds || rounds.length === 0) return null
  return rounds.some(r => r.round === n) ? n : getCurrentRound(rounds).round
}

export function getPaidCount(payments) {
  return Object.values(payments).filter(Boolean).length
}

export function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function getDayName(iso, locale = 'en-US') {
  return new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long' })
}

export function getCountdownTo(isoDate) {
  const diff = new Date(isoDate + 'T20:00:00').getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, done: true }
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    done: false,
  }
}

export function getTandaSpan(rounds) {
  if (!rounds || rounds.length === 0) return null
  const start = rounds[0].collectDate
  const end = rounds[rounds.length - 1].payoutDate
  return { start, end, year: new Date(end + 'T12:00:00').getFullYear() }
}

export function formatSpanLabel(span, locale = 'en-US') {
  if (!span) return ''
  const fmt = iso =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  return `${fmt(span.start)} – ${fmt(span.end)}, ${span.year}`
}

export function isTandaComplete(rounds, now = new Date()) {
  const span = getTandaSpan(rounds)
  if (!span) return false
  return now > new Date(span.end + 'T23:59:59')
}

// Past rounds, newest first. A finished tanda (archived, or past its last payout day)
// includes the final round — History used to drop it because that round was still "current".
export function historyRounds(rounds, { status, today = new Date() } = {}) {
  if (!rounds?.length) return []
  const ordered = [...rounds].sort((a, b) => a.round - b.round)
  if (status === 'archived' || isTandaComplete(ordered, today)) return ordered.reverse()
  const current = getCurrentRound(ordered, today)
  return ordered.filter(r => r.round < current.round).reverse()
}

export function isPayoutWindow(round, now = new Date()) {
  const open = new Date(round.collectDate + 'T20:00:00')
  const close = new Date(round.payoutDate + 'T23:59:59')
  return now >= open && now <= close
}

export function formatRelativeTime(thenMs, nowMs, lang = 'en') {
  if (!thenMs) return ''
  const mins = Math.floor((nowMs - thenMs) / 60000)
  if (mins < 1) return lang === 'es' ? 'Actualizado justo ahora' : 'Updated just now'
  return lang === 'es' ? `Actualizado hace ${mins} min` : `Updated ${mins} min ago`
}

export function resolveMySlot(saved, participants) {
  const n = Number(saved)
  if (!saved || !Number.isInteger(n)) return null
  return participants.some(p => p.slot === n) ? n : null
}

// Calendar-day math on 'YYYY-MM-DD' strings, done in UTC so DST never shifts the date.
export function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Round N collects on start + (N-1) × interval and pays out the next day.
export function buildRounds(startDate, intervalDays, count) {
  return Array.from({ length: count }, (_, i) => {
    const collectDate = addDays(startDate, i * intervalDays)
    return { roundNumber: i + 1, collectDate, payoutDate: addDays(collectDate, 1) }
  })
}
