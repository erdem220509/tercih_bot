import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advisorContinuationFloorByScore,
  advisorSelectionBand,
  advisorSuggestionStep,
  classifyAdvisorFit,
  descendingRankWindowPages,
  enforceAdvisorFitLabels,
  ensureAdvisorRecommendationCoverage,
  filterFreshAdvisorRows,
  findAdvisorPrograms,
  inferAdvisorRankOverride,
  inferAdvisorIntent,
  isGreetingOnly,
  requestedAdvisorRecommendationCount,
  resolveAdvisorConversationProfile,
  resolveAdvisorIntent,
  selectAdvisorRecommendations,
  shouldReturnAdvisorRecommendationMetadata,
} from '../server.mjs'

function recommendation(code, rank, university = `University ${code}`) {
  return {
    code: String(code),
    university,
    scoreType: 'SAY',
    rank,
  }
}

test('descending rank windows fetch enough final pages to fill the requested limit', () => {
  assert.deepEqual(descendingRankWindowPages(242, 500), [0])
  assert.deepEqual(descendingRankWindowPages(1000, 500), [1])
  assert.deepEqual(descendingRankWindowPages(1123, 500), [1, 2])
})

test('selection bands scale with the candidate ranking', () => {
  const lowRankBand = advisorSelectionBand(1500)
  assert.equal(lowRankBand.reachMin, 700)
  assert.equal(lowRankBand.reachMax, 1100)

  const highRankBand = advisorSelectionBand(30000)
  assert.equal(highRankBand.reachMin, 24000)
  assert.equal(highRankBand.reachMax, 27000)

  const lowSaferBand = advisorSelectionBand(2000)
  assert.equal(lowSaferBand.safeTarget, 2500)
  assert.equal(lowSaferBand.safeMax, 3200)

  const highSaferBand = advisorSelectionBand(30000)
  assert.equal(highSaferBand.safeTarget, 33000)
  assert.equal(highSaferBand.safeMax, 37500)

  assert.equal(advisorSuggestionStep(2000), 300)
  assert.equal(advisorSuggestionStep(30000), 2400)
})

test('fit classification treats elite cutoffs as reach for a 2000-ranked candidate', () => {
  assert.equal(classifyAdvisorFit(2000, 113), 'reach')
  assert.equal(classifyAdvisorFit(2000, 299), 'reach')
  assert.equal(classifyAdvisorFit(2000, 337), 'reach')
  assert.equal(classifyAdvisorFit(2000, 788), 'reach')
  assert.equal(classifyAdvisorFit(2000, 898), 'reach')
  assert.equal(classifyAdvisorFit(2000, 1700), 'match')
  assert.equal(classifyAdvisorFit(2000, 2300), 'match')
  assert.equal(classifyAdvisorFit(2000, 2301), 'safe')
})

test('visible recommendation labels are corrected from structured fit metadata', () => {
  const answer = [
    '**KOÇ ÜNİVERSİTESİ (İSTANBUL)** — Bilgisayar Mühendisliği',
    '**2025 taban sıralaması:** 113 — **Uygun**',
    '',
    '**BİLKENT ÜNİVERSİTESİ (ANKARA)** — Bilgisayar Mühendisliği',
    '**2025 taban sıralaması:** 2.050 — **Uygun**',
    '',
    '“Uygun” etiketi bir karşılaştırma bandıdır.',
  ].join('\n')
  const recommendations = [
    { university: 'KOÇ ÜNİVERSİTESİ', fit: 'reach' },
    { university: 'BİLKENT ÜNİVERSİTESİ', fit: 'match' },
  ]

  const corrected = enforceAdvisorFitLabels(answer, recommendations, 'tr')
  assert.match(corrected, /113 — \*\*İddialı\*\*/)
  assert.match(corrected, /2\.050 — \*\*Uygun\*\*/)
  assert.match(corrected, /“Uygun” etiketi/)
})

test('a populated YÖK shortlist replaces an answer that falsely claims it is empty', () => {
  const recommendations = [
    {
      university: 'MERSİN ÜNİVERSİTESİ',
      program: 'Tıp',
      city: 'Mersin',
      rank: 13043,
      fit: 'reach',
    },
    {
      university: 'PAMUKKALE ÜNİVERSİTESİ',
      program: 'Tıp',
      city: 'Denizli',
      rank: 13350,
      fit: 'safe',
    },
  ]

  const corrected = ensureAdvisorRecommendationCoverage(
    'Resmî YÖK Atlas kısa listesi boş geldi.',
    recommendations,
    'recommend',
    'tr',
  )

  assert.match(corrected, /MERSİN ÜNİVERSİTESİ/)
  assert.match(corrected, /PAMUKKALE ÜNİVERSİTESİ/)
  assert.doesNotMatch(corrected, /boş geldi/)
})

test('general recommendations contain at most one nearby reach option', () => {
  const rows = [
    recommendation(1, 300),
    recommendation(2, 850),
    recommendation(3, 1000),
    recommendation(4, 1435),
    recommendation(5, 1448),
    recommendation(6, 1505),
    recommendation(7, 2100),
  ]

  const selected = selectAdvisorRecommendations(rows, { SAY: 1500 }, 'recommend')
  const reachOptions = selected.filter(({ fit }) => fit === 'reach')

  assert.equal(selected.length, 5)
  assert.equal(reachOptions.length, 1)
  assert.ok(reachOptions[0].rank >= 700 && reachOptions[0].rank <= 1100)
  assert.ok(!selected.some(({ rank }) => rank === 300))
})

test('initial recommendations fill five places with the closest reasonable fallbacks', () => {
  const rows = [
    recommendation(1, 1435),
    recommendation(2, 2225),
    recommendation(3, 2615),
    recommendation(4, 3500),
    recommendation(5, 4200),
    recommendation(6, 7000),
  ]

  const selected = selectAdvisorRecommendations(rows, { SAY: 2000 }, 'recommend', 5)

  assert.equal(selected.length, 5)
  assert.equal(selected.filter(({ fit }) => fit === 'reach').length, 1)
  assert.ok(!selected.some(({ rank }) => rank === 7000))
})

test('default five follows reach, match, match, match, safer when available', () => {
  const rows = [
    recommendation(1, 1500),
    recommendation(2, 1750),
    recommendation(3, 2000),
    recommendation(4, 2250),
    recommendation(5, 2500),
    recommendation(6, 2800),
  ]

  const selected = selectAdvisorRecommendations(rows, { SAY: 2000 }, 'recommend', 5)

  assert.deepEqual(selected.map(({ fit }) => fit), ['reach', 'match', 'match', 'match', 'safe'])
})

test('safer recommendations exhaust nearby options before moving farther away', () => {
  const rows = [
    recommendation(1, 2050),
    recommendation(2, 2500),
    recommendation(3, 2600),
    recommendation(4, 3000),
    recommendation(5, 7000),
    recommendation(6, 11000),
  ]

  const nearby = selectAdvisorRecommendations(rows, { SAY: 2000 }, 'safer', 4)
  const expanded = selectAdvisorRecommendations(rows, { SAY: 2000 }, 'safer', 5)

  assert.deepEqual(nearby.map(({ rank }) => rank), [2050, 2500, 2600, 3000])
  assert.ok(expanded.some(({ rank }) => rank === 7000))
  assert.ok(!expanded.some(({ rank }) => rank === 11000))
})

test('continued safer recommendations start after the previous safer cutoff', () => {
  const rows = [
    recommendation(1, 2050),
    recommendation(2, 2800),
    recommendation(3, 3500),
    recommendation(4, 4000),
    recommendation(5, 12000),
  ]

  const selected = selectAdvisorRecommendations(
    rows,
    { SAY: 2000 },
    'safer',
    3,
    { SAY: 3000 },
  )

  assert.deepEqual(selected.map(({ rank }) => rank), [2050, 3500, 4000])
})

test('continuation ignores recommendations created for a temporary ranking override', () => {
  const rows = [
    recommendation(1, 5923),
    recommendation(2, 19260),
  ]
  const contexts = [
    { code: '1', scoreType: 'SAY', candidateRank: 2000 },
    { code: '2', scoreType: 'SAY', candidateRank: 15000 },
  ]

  assert.deepEqual(
    advisorContinuationFloorByScore(rows, { SAY: 2000 }, contexts),
    { SAY: 5923 },
  )
  assert.deepEqual(
    advisorContinuationFloorByScore(rows, { SAY: 15000 }, contexts),
    { SAY: 19260 },
  )
})

test('free-form messages are routed to the correct interaction', () => {
  assert.equal(inferAdvisorIntent('Bana sıralamama yakın 5 tercih daha verir misin?'), 'more')
  assert.equal(inferAdvisorIntent('Sıralamama uygun yukarıdakilerden farklı 5 üniversite öner'), 'more')
  assert.equal(inferAdvisorIntent('Give me 3 more suggestions'), 'more')
  assert.equal(inferAdvisorIntent('Şehir tercihim neyi değiştirir?'), 'city')
  assert.equal(inferAdvisorIntent('Daha güvenli seçeneklerim neler?'), 'safer')
  assert.equal(inferAdvisorIntent('Bu bölümleri karşılaştır'), 'compare')
  assert.equal(inferAdvisorIntent('Merhaba'), 'chat')
  assert.equal(inferAdvisorIntent('Bugün nasılsın, biraz sohbet edelim'), 'chat')
  assert.equal(inferAdvisorIntent('Hangi üniversitenin kampüsü daha güzel?'), 'chat')
  assert.equal(inferAdvisorIntent('Hangi üniversiteyi seçmeliyim?'), 'recommend')
  assert.equal(inferAdvisorIntent('Sadece rastgele 5 üniversite istiyorum'), 'recommend')
  assert.equal(inferAdvisorIntent('Rastgele üniversiteler söyle, fikir almak istiyorum'), 'recommend')
  assert.equal(inferAdvisorIntent('15 bin sıralamayla hangi üniversitelere girebilirim?'), 'recommend')
  assert.equal(isGreetingOnly('Merhaba! 😊'), true)
})

test('conversation details are reused instead of being asked for again', () => {
  const history = [
    { role: 'user', content: '15 bin sıralamayla hangi üniversitelere girebilirim?' },
    { role: 'assistant', content: 'Hangi puan türü?' },
    { role: 'user', content: 'sayısal' },
    { role: 'assistant', content: 'Hangi bölüm?' },
    { role: 'user', content: 'bilgisayar mühendsiliği' },
    { role: 'assistant', content: 'Hangi dil?' },
    { role: 'user', content: 'ingilizce' },
  ]
  const resolved = resolveAdvisorConversationProfile(
    { ranks: {}, language: 'ALL', universityType: 'ALL', selectedPrograms: [] },
    history,
    '15000',
  )

  assert.equal(resolved.profile.ranks.SAY, 15000)
  assert.equal(resolved.profile.language, 'EN')
  assert.match(resolved.contextText, /bilgisayar mühendsiliği/)
  assert.equal(resolveAdvisorIntent('15000', 'chat', [], history), 'recommend')
})

test('an explicitly named program is recovered from conversation text despite a small typo', () => {
  const catalog = [
    { birimGrupId: 1, birimGrupAdi: 'Bilgisayar Mühendisliği', puanTuru: 'SAY' },
    { birimGrupId: 2, birimGrupAdi: 'Yazılım Mühendisliği', puanTuru: 'SAY' },
    { birimGrupId: 3, birimGrupAdi: 'Tıp', puanTuru: 'SAY' },
  ]
  const programs = findAdvisorPrograms(
    catalog,
    { ranks: { SAY: 15000 }, selectedPrograms: [] },
    'sayısal 15000 bilgisayar mühendsiliği ingilizce',
  )

  assert.deepEqual(programs.map(({ birimGrupId }) => birimGrupId), [1])
})

test('a ranking in the latest message creates a one-message override without mutating the profile', () => {
  const profile = {
    ranks: { SAY: 2000 },
    selectedPrograms: [],
  }

  assert.deepEqual(
    inferAdvisorRankOverride('15000 sıralamama göre üniversite öner', profile),
    { scoreType: 'SAY', rank: 15000 },
  )
  assert.deepEqual(
    inferAdvisorRankOverride('15 bin SAY sıralamayla seçenek göster', profile),
    { scoreType: 'SAY', rank: 15000 },
  )
  assert.deepEqual(
    inferAdvisorRankOverride('SAY sıralamam 15.000, yeni öneriler ver', profile),
    { scoreType: 'SAY', rank: 15000 },
  )
  assert.deepEqual(
    inferAdvisorRankOverride(
      'Kod yazmayı ve matematiği seviyorum. 2000 SAY sıralamama göre 5 üniversite öner.',
      profile,
    ),
    { scoreType: 'SAY', rank: 2000 },
  )
  assert.equal(
    inferAdvisorRankOverride('Sıralamama göre 5 üniversite öner.', profile),
    null,
  )
  assert.deepEqual(
    inferAdvisorRankOverride(
      '15000 sıralamama göre üniversite öner',
      { ranks: { SAY: 2000, EA: 4000 }, selectedPrograms: [] },
      ['SAY'],
    ),
    { scoreType: 'SAY', rank: 15000 },
  )
  assert.deepEqual(profile.ranks, { SAY: 2000 })
})

test('only explicit continuation wording excludes earlier recommendations', () => {
  assert.equal(
    resolveAdvisorIntent('15000 sıralamama göre üniversite öner', 'chat', ['1001', '1002']),
    'recommend',
  )
  assert.equal(
    resolveAdvisorIntent('15000 sıralamama göre üniversite öner', 'chat', []),
    'recommend',
  )
  assert.equal(
    resolveAdvisorIntent('hayır fark etmiyor sadece üniversite göster', 'chat', ['1001', '1002']),
    'recommend',
  )
  assert.equal(
    resolveAdvisorIntent('başka 5 üniversite daha göster', 'chat', ['1001', '1002']),
    'more',
  )
})

test('fresh recommendation rows exclude earlier universities, including other fee variants', () => {
  const rows = [
    recommendation(1, 12000, 'Example University'),
    recommendation(2, 14000, 'Example University'),
    recommendation(3, 15000, 'Another University'),
  ]

  assert.deepEqual(
    filterFreshAdvisorRows(rows, ['1'], ['Example University']).map(({ code }) => code),
    ['3'],
  )
})

test('requested recommendation counts default to five and stay between one and eight', () => {
  assert.equal(requestedAdvisorRecommendationCount('Profilime göre seçenek öner', 'recommend'), 5)
  assert.equal(requestedAdvisorRecommendationCount('Başka 3 üniversite göster', 'more'), 3)
  assert.equal(requestedAdvisorRecommendationCount('Give me 3 more suggestions', 'more'), 3)
  assert.equal(requestedAdvisorRecommendationCount('Show 7 additional recommendations', 'more'), 7)
  assert.equal(requestedAdvisorRecommendationCount('8 üniversite daha göster', 'more'), 8)
  assert.equal(requestedAdvisorRecommendationCount('10000 üniversite öner', 'recommend'), 8)
  assert.equal(requestedAdvisorRecommendationCount('2000 sıralama ile seçenek öner', 'recommend'), 5)
  assert.equal(requestedAdvisorRecommendationCount('Üç farklı tercih göster', 'more'), 3)
  assert.equal(requestedAdvisorRecommendationCount('Bunları karşılaştır', 'compare'), 0)
})

test('recommendation selection honors requested counts and returns ascending ranks', () => {
  const rows = [
    recommendation(1, 25500),
    recommendation(2, 29800),
    recommendation(3, 30000),
    recommendation(4, 30200),
    recommendation(5, 33000),
    recommendation(6, 34000),
    recommendation(7, 35000),
    recommendation(8, 36000),
    recommendation(9, 37000),
  ]

  const three = selectAdvisorRecommendations(rows, { SAY: 30000 }, 'more', 3)
  const eight = selectAdvisorRecommendations(rows, { SAY: 30000 }, 'more', 8)

  assert.equal(three.length, 3)
  assert.equal(eight.length, 8)
  assert.deepEqual(
    eight.map(({ rank }) => rank),
    [...eight.map(({ rank }) => rank)].sort((a, b) => a - b),
  )
  assert.ok(eight.filter(({ fit }) => fit === 'reach').length <= 1)
})

test('recommendation metadata returns only for explicit recommendation interactions', () => {
  assert.equal(shouldReturnAdvisorRecommendationMetadata('recommend'), true)
  assert.equal(shouldReturnAdvisorRecommendationMetadata('more'), true)
  assert.equal(shouldReturnAdvisorRecommendationMetadata('safer'), true)
  assert.equal(shouldReturnAdvisorRecommendationMetadata('compare'), false)
  assert.equal(shouldReturnAdvisorRecommendationMetadata('city'), false)
  assert.equal(shouldReturnAdvisorRecommendationMetadata('chat'), false)
})
