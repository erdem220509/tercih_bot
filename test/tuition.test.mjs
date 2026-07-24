import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateProgramTuition } from '../src/tuition.js'

const foundationProgram = {
  universiteTuru: 'VAKIF',
  bursOraniAdi: 'Ücretli',
  ucret: 3_000_000,
  yil: 2026,
}

test('full-price foundation programs display the official annual tuition', () => {
  assert.deepEqual(calculateProgramTuition(foundationProgram), {
    fullTuition: 3_000_000,
    discountPercent: 0,
    payableTuition: 3_000_000,
    academicYear: '2026–2027',
  })
})

test('listed discounts are deducted from the full tuition', () => {
  assert.equal(calculateProgramTuition({
    ...foundationProgram,
    bursOraniAdi: '%50 İndirimli',
  }).payableTuition, 1_500_000)

  assert.equal(calculateProgramTuition({
    ...foundationProgram,
    bursOraniAdi: '%25 İndirimli',
  }).payableTuition, 2_250_000)
})

test('fully funded programs calculate a zero payable tuition', () => {
  assert.equal(calculateProgramTuition({
    ...foundationProgram,
    bursOraniAdi: 'Burslu',
  }).payableTuition, 0)
})

test('missing fees, unknown scholarships, and public universities are not displayed', () => {
  assert.equal(calculateProgramTuition({ ...foundationProgram, ucret: null }), null)
  assert.equal(calculateProgramTuition({ ...foundationProgram, bursOraniAdi: 'Diğer' }), null)
  assert.equal(calculateProgramTuition({ ...foundationProgram, universiteTuru: 'DEVLET' }), null)
})
