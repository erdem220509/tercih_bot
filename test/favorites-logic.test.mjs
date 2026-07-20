import assert from 'node:assert/strict'
import test from 'node:test'
import { favoriteProgramKey, favoriteProgramLabel } from '../src/favorites.js'

test('fee and scholarship variants from one university have independent favorite keys', () => {
  const scholarship = {
    kilavuzKodu: '1001001',
    universiteAdi: 'Örnek Üniversitesi',
    birimAdi: 'Bilgisayar Mühendisliği',
    bursOraniAdi: 'Burslu',
  }
  const halfPaid = {
    ...scholarship,
    kilavuzKodu: '1001002',
    bursOraniAdi: '%50 İndirimli',
  }
  const paid = {
    ...scholarship,
    kilavuzKodu: '1001003',
    bursOraniAdi: 'Ücretli',
  }

  assert.deepEqual(
    [scholarship, halfPaid, paid].map(favoriteProgramKey),
    ['1001001', '1001002', '1001003'],
  )
  assert.match(favoriteProgramLabel(halfPaid), /%50 İndirimli/)
})
