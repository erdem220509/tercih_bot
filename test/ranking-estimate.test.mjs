import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateProgramRanking,
  programGuideQuota,
  programPlacementHistory,
  programRankHistory,
} from '../src/rankingEstimate.js'

function program(ranks, quotas = [60, 60, 60, 60]) {
  return {
    yil: 2026,
    kilavuzKodu: String(Math.random()),
    birimGrupAdi: 'Example Program',
    birimAdi: 'Example Program',
    puanTuru: 'SAY',
    universiteTuru: 'DEVLET',
    basariSirasi3: ranks[0],
    basariSirasi2: ranks[1],
    basariSirasi1: ranks[2],
    basariSirasi: ranks[3],
    gk3: quotas[1],
    gk2: quotas[2],
    gk1: quotas[3],
    kontenjan: quotas[3],
  }
}

test('ranking history uses every available year from 2022 through 2025', () => {
  assert.deepEqual(
    programRankHistory(program([6200, 5800, 5400, 5100])).map(({ year, rank }) => [year, rank]),
    [[2022, 6200], [2023, 5800], [2024, 5400], [2025, 5100]],
  )
})

test('placement quotas use historical gk fields and keep the guide quota separate', () => {
  const row = program([6200, 5800, 5400, 5100])
  row.gk1 = 10
  row.kontenjan = 3

  assert.deepEqual(
    programPlacementHistory(row).map(({ year, quota }) => [year, quota]),
    [[2022, null], [2023, 60], [2024, 60], [2025, 10]],
  )
  assert.equal(row.kontenjan, 3)
  assert.deepEqual(programGuideQuota(row), { year: 2026, quota: 3 })
})

test('quota years follow the guide year supplied by YÖK Atlas', () => {
  const row = program([6200, 5800, 5400, 5100])
  row.yil = 2025
  row.gk1 = 40
  row.kontenjan = 50

  assert.deepEqual(
    programPlacementHistory(row).map(({ year, quota }) => [year, quota]),
    [[2021, null], [2022, 60], [2023, 60], [2024, 40]],
  )
  assert.deepEqual(programGuideQuota(row), { year: 2025, quota: 50 })
})

test('stable programs receive a useful range instead of an extremely wide span', () => {
  const row = program([6200, 5800, 5400, 5100])
  const estimate = estimateProgramRanking(row, [row])

  assert.ok(estimate.rank < 5100)
  assert.ok(estimate.range)
  assert.ok(estimate.range[0] > 3000)
  assert.ok(estimate.range[1] < 7000)
  assert.ok(estimate.range[1] / estimate.range[0] < 1.6)
})

test('volatile histories receive a bounded low-confidence scenario range', () => {
  const row = program([5000, 10000, 3000, 9000])
  const estimate = estimateProgramRanking(row, [row])

  assert.equal(estimate.confidence, 'low')
  assert.equal(estimate.rangeKind, 'scenario')
  assert.ok(estimate.range)
  assert.ok(estimate.range[1] / estimate.range[0] < 1.6)
})

test('programs without three recent ranked years do not receive an estimate', () => {
  const row = program([null, null, 5400, 5100])
  assert.equal(estimateProgramRanking(row, [row]), null)
})
