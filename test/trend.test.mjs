import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTrendPoints } from '../src/trend.js'

test('trend points ignore missing ranks and stay inside the chart viewport', () => {
  const points = buildTrendPoints([3050, null, 2890, 3110])

  assert.deepEqual(points.map(({ index }) => index), [0, 2, 3])
  assert.ok(points.every(({ x }) => x >= 4 && x <= 76))
  assert.ok(points.every(({ y }) => y >= 6 && y <= 28))
})

test('trend points require at least two published rankings', () => {
  assert.deepEqual(buildTrendPoints([null, null, 2600, null]), [])
})
