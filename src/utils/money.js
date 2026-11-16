// 200 → "$200", 2400 → "$2,400", 87.5 → "$87.50"
export function isWholeCents(amount) {
  const n = Number(amount)
  // numeric(10,2) stores at most 99,999,999.99, which is below 1e8.
  if (!Number.isFinite(n) || n <= 0 || n >= 1e8) return false
  const cents = Math.round(n * 100)
  return Math.abs(n * 100 - cents) < 1e-6
}

export function formatMoney(amount) {
  const n = Number(amount) || 0
  return Number.isInteger(n)
    ? `$${n.toLocaleString('en-US')}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
