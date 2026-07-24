const PLACEMENT_FIELDS = [
  ['basariSirasi3', 'minPuan3', null],
  ['basariSirasi2', 'minPuan2', 'gk3'],
  ['basariSirasi1', 'minPuan1', 'gk2'],
  ['basariSirasi', 'minPuan', 'gk1'],
]

function programGuideYear(row) {
  const year = Number(row?.yil)
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : 2026
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

function median(values) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2
}

function quantile(values, probability) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  const index = Math.ceil(clamp(probability, 0, 1) * ordered.length) - 1
  return ordered[Math.max(0, index)]
}

function weightedMean(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
  return totalWeight
    ? items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : 0
}

function roundedRank(value) {
  const rank = Math.max(1, Number(value) || 1)
  const step = rank < 10_000 ? 10 : rank < 100_000 ? 50 : rank < 500_000 ? 100 : 1000
  return Math.max(1, Math.round(rank / step) * step)
}

export function programPlacementHistory(row) {
  const guideYear = programGuideYear(row)
  return PLACEMENT_FIELDS.map(([rankKey, scoreKey, quotaKey], index) => ({
    year: guideYear - (PLACEMENT_FIELDS.length - index),
    rank: Number(row?.[rankKey]) > 0 ? Number(row[rankKey]) : null,
    score: Number(row?.[scoreKey]) > 0 ? Number(row[scoreKey]) : null,
    quota: quotaKey && Number(row?.[quotaKey]) > 0 ? Number(row[quotaKey]) : null,
  }))
}

export function programGuideQuota(row) {
  return {
    year: programGuideYear(row),
    quota: Number(row?.kontenjan) > 0 ? Number(row.kontenjan) : null,
  }
}

export function programRankHistory(row) {
  return programPlacementHistory(row).filter(({ rank }) => rank)
}

function annualLogChanges(history) {
  const changes = []
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1]
    const current = history[index]
    const yearGap = current.year - previous.year
    if (yearGap <= 0) continue
    changes.push({
      year: current.year,
      value: Math.log(current.rank / previous.rank) / yearGap,
    })
  }
  return changes
}

function recentWeightedTrend(history) {
  const changes = annualLogChanges(history)
  if (!changes.length) return 0
  const center = median(changes.map(({ value }) => value)) || 0
  const weights = { 2023: 0.20, 2024: 0.30, 2025: 0.50 }
  return weightedMean(changes.map(({ year, value }) => ({
    value: clamp(value, center - 0.18, center + 0.18),
    weight: weights[year] || 0.15,
  })))
}

function programVolatility(history) {
  const changes = annualLogChanges(history).map(({ value }) => value)
  if (changes.length < 2) return 0.16
  const center = median(changes) || 0
  return (median(changes.map((value) => Math.abs(value - center))) || 0) * 1.4826
}

function quotaVolatility(row) {
  const quotas = [...programPlacementHistory(row).map(({ quota }) => quota), Number(row?.kontenjan)]
    .filter((quota) => quota > 0)
  if (quotas.length < 2) return 0
  const changes = quotas.slice(1).map((quota, index) => Math.abs(Math.log(quota / quotas[index])))
  return median(changes) || 0
}

function nextQuotaAdjustment(row) {
  const currentQuota = Number(row?.kontenjan)
  const previousQuota = Number(row?.gk1)
  if (!(currentQuota > 0 && previousQuota > 0)) return 0
  return clamp(Math.log(currentQuota / previousQuota) * 0.35, -0.16, 0.16)
}

function rowGroupKey(row, includeUniversityType = true) {
  const parts = [row?.birimGrupAdi || row?.birimAdi || '', row?.puanTuru || '']
  if (includeUniversityType) parts.push(row?.universiteTuru || '')
  return parts.join('|').toLocaleLowerCase('tr-TR')
}

function backtestError(row) {
  const history = programRankHistory(row)
  if (history.length < 4) return null
  const training = history.slice(0, -1)
  const actual = history.at(-1)
  const predictedLogRank = Math.log(training.at(-1).rank) + recentWeightedTrend(training) * 0.72
  return Math.abs(Math.log(actual.rank) - predictedLogRank)
}

function comparableRows(row, rows) {
  const candidates = (Array.isArray(rows) ? rows : []).filter((candidate) => candidate !== row)
  const strictKey = rowGroupKey(row)
  const broadKey = rowGroupKey(row, false)
  const strict = candidates.filter((candidate) => rowGroupKey(candidate) === strictKey)
  if (strict.length >= 5) return strict
  return candidates.filter((candidate) => rowGroupKey(candidate, false) === broadKey)
}

function usableTrend(rows) {
  const values = rows
    .map((row) => programRankHistory(row))
    .filter((history) => history.length >= 3)
    .map(recentWeightedTrend)
  return median(values)
}

export function estimateProgramRanking(row, allRows = []) {
  const history = programRankHistory(row)
  if (history.length < 3 || history.at(-1).year !== 2025) return null

  const peers = comparableRows(row, allRows)
  const scoreTypePeers = (Array.isArray(allRows) ? allRows : [])
    .filter((candidate) => candidate !== row && candidate?.puanTuru === row?.puanTuru)
  const components = [{ value: recentWeightedTrend(history), weight: 0.60 }]
  const peerTrend = usableTrend(peers)
  const scoreTypeTrend = usableTrend(scoreTypePeers)
  if (peerTrend != null) components.push({ value: peerTrend, weight: 0.28 })
  if (scoreTypeTrend != null) components.push({ value: scoreTypeTrend, weight: 0.12 })

  const projectedTrend = clamp(
    weightedMean(components) * 0.78 + nextQuotaAdjustment(row),
    -0.28,
    0.28,
  )
  const latestRank = history.at(-1).rank
  const estimate = roundedRank(latestRank * Math.exp(projectedTrend))

  const peerErrors = peers.map(backtestError).filter((value) => value != null)
  const scoreTypeErrors = scoreTypePeers.map(backtestError).filter((value) => value != null)
  const empiricalError = peerErrors.length >= 8
    ? quantile(peerErrors, 0.80)
    : scoreTypeErrors.length >= 15
      ? quantile(scoreTypeErrors, 0.80)
      : 0.14
  const quotaPenalty = quotaVolatility(row) > 0.18 ? 0.035 : 0
  const measuredHalfWidth = Math.max(0.06, empiricalError || 0, programVolatility(history) * 1.35) + quotaPenalty
  const displayHalfWidth = clamp(measuredHalfWidth, 0.06, 0.20)
  const confidence = measuredHalfWidth <= 0.10 && history.length === 4 && peers.length >= 5
    ? 'high'
    : measuredHalfWidth <= 0.18
      ? 'medium'
      : 'low'

  return {
    year: 2026,
    rank: estimate,
    range: [
      roundedRank(estimate * Math.exp(-displayHalfWidth)),
      roundedRank(estimate * Math.exp(displayHalfWidth)),
    ],
    rangeKind: confidence === 'low' ? 'scenario' : 'likely',
    confidence,
    yearsUsed: history.map(({ year }) => year),
  }
}
