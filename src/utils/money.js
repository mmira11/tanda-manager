// 200 → "$200", 2400 → "$2,400", 87.5 → "$87.50"
export function formatMoney(amount) {
  const n = Number(amount) || 0
  return Number.isInteger(n)
    ? `$${n.toLocaleString('en-US')}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
