import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeReviewRatings,
  reviewSummaryData,
  universityReviewKey,
} from '../functions/app.mjs'

test('review ratings require all four integer categories between one and five', () => {
  assert.deepEqual(normalizeReviewRatings({
    dorms: 4,
    professors: 5,
    campus: 3,
    socialLife: 4,
  }), {
    dorms: 4,
    professors: 5,
    campus: 3,
    socialLife: 4,
  })
  assert.equal(normalizeReviewRatings({ dorms: 4, professors: 5, campus: 3 }), null)
  assert.equal(normalizeReviewRatings({
    dorms: 4,
    professors: 5,
    campus: 3,
    socialLife: 5.5,
  }), null)
})

test('review summaries calculate category and overall averages', () => {
  const summary = reviewSummaryData({
    universityName: 'Örnek Üniversitesi',
    count: 2,
    dormsTotal: 7,
    professorsTotal: 9,
    campusTotal: 8,
    socialLifeTotal: 6,
  })

  assert.equal(summary.count, 2)
  assert.deepEqual(summary.averages, {
    dorms: 3.5,
    professors: 4.5,
    campus: 4,
    socialLife: 3,
  })
  assert.equal(summary.overall, 3.75)
})

test('university review keys are stable across casing and spacing', () => {
  assert.equal(
    universityReviewKey('  İstanbul Teknik Üniversitesi '),
    universityReviewKey('İSTANBUL   TEKNİK ÜNİVERSİTESİ'),
  )
})
