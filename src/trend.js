export function buildTrendPoints(values) {
  const slots = Array.isArray(values) ? values : []
  const valid = slots
    .map((raw, index) => ({ index, value: Number(raw) }))
    .filter(({ value }) => Number.isFinite(value) && value > 0)
  if (valid.length < 2) return []

  const ranks = valid.map(({ value }) => value)
  const minimum = Math.min(...ranks)
  const maximum = Math.max(...ranks)
  const range = maximum - minimum || 1

  return valid.map(({ index, value }) => ({
    index,
    x: 4 + (index * 72) / Math.max(1, slots.length - 1),
    y: 6 + ((value - minimum) / range) * 22,
  }))
}
