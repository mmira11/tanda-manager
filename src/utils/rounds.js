export function getCurrentRound(rounds, today = new Date()) {
  const d = new Date(today)
  d.setHours(0, 0, 0, 0)
  const active = rounds.find(r => {
    const p = new Date(r.payoutDate)
    p.setHours(0, 0, 0, 0)
    return p >= d
  })
  return active || rounds[rounds.length - 1]
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
  const diff = new Date(isoDate + 'T00:00:00').getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, done: true }
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    done: false,
  }
}
