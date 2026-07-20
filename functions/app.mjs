import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import OpenAI from 'openai'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

const app = express()
const PORT = Number(process.env.PORT || 8787)
const YOK_API = 'https://yokatlas.yok.gov.tr/api'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || 'medium'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const ADVISOR_WINDOW_MS = 10 * 60 * 1000
const ADVISOR_IP_LIMIT = Math.max(1, Number(process.env.ADVISOR_IP_LIMIT) || 12)
const ADVISOR_GLOBAL_HOURLY_LIMIT = Math.max(
  ADVISOR_IP_LIMIT,
  Number(process.env.ADVISOR_GLOBAL_HOURLY_LIMIT) || 200,
)
const REVIEW_WINDOW_MS = 60 * 60 * 1000
const REVIEW_IP_LIMIT = Math.max(1, Number(process.env.REVIEW_IP_LIMIT) || 5)
const REVIEW_FIELDS = ['dorms', 'professors', 'campus', 'socialLife']
const USE_LOCAL_REVIEW_STORE = !IS_PRODUCTION && !process.env.FIRESTORE_EMULATOR_HOST
const TRUSTED_APP_ORIGINS = new Set(
  String(process.env.APP_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.disable('x-powered-by')
if (process.env.TRUST_PROXY) {
  const proxyHops = Number(process.env.TRUST_PROXY)
  app.set('trust proxy', Number.isInteger(proxyHops) ? proxyHops : process.env.TRUST_PROXY === 'true')
}
app.use(express.json({ limit: '64kb' }))
app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  next()
})

const cache = new Map()
const advisorRateLimit = new Map()
const advisorGlobalRateLimit = { startedAt: Date.now(), count: 0 }
const reviewRateLimit = new Map()
const localReviewStore = new Map()

const INTEREST_PROGRAMS = [
  {
    triggers: ['bilgisayar', 'yazilim', 'kod', 'teknoloji', 'yapay zeka', 'siber', 'oyun', 'computer', 'software', 'coding', 'technology', 'ai'],
    programs: ['Bilgisayar Mühendisliği', 'Yazılım Mühendisliği', 'Yapay Zeka Mühendisliği', 'Yönetim Bilişim Sistemleri'],
  },
  {
    triggers: ['saglik', 'insanlara yardim', 'biyoloji', 'tip', 'hastane', 'health', 'medicine', 'biology', 'helping people'],
    programs: ['Tıp', 'Diş Hekimliği', 'Eczacılık', 'Hemşirelik', 'Fizyoterapi ve Rehabilitasyon'],
  },
  {
    triggers: ['hukuk', 'adalet', 'tartisma', 'siyaset', 'law', 'justice', 'politics', 'debate'],
    programs: ['Hukuk', 'Siyaset Bilimi ve Kamu Yönetimi', 'Uluslararası İlişkiler'],
  },
  {
    triggers: ['ekonomi', 'isletme', 'finans', 'girisim', 'business', 'economics', 'finance', 'entrepreneur'],
    programs: ['İşletme', 'İktisat', 'Ekonomi', 'Uluslararası Ticaret ve Finansman'],
  },
  {
    triggers: ['tasarim', 'cizim', 'mimari', 'yaratici', 'design', 'drawing', 'architecture', 'creative'],
    programs: ['Mimarlık', 'İç Mimarlık', 'Endüstriyel Tasarım', 'Görsel İletişim Tasarımı'],
  },
  {
    triggers: ['psikoloji', 'insan davranisi', 'sosyoloji', 'cocuk', 'psychology', 'human behavior', 'sociology'],
    programs: ['Psikoloji', 'Rehberlik ve Psikolojik Danışmanlık', 'Sosyoloji', 'Çocuk Gelişimi'],
  },
  {
    triggers: ['ogretmek', 'egitim', 'cocuklarla', 'teacher', 'teaching', 'education'],
    programs: ['Sınıf Öğretmenliği', 'İngilizce Öğretmenliği', 'Okul Öncesi Öğretmenliği', 'Matematik Öğretmenliği'],
  },
  {
    triggers: ['dil', 'ceviri', 'ingilizce', 'edebiyat', 'language', 'translation', 'english', 'literature'],
    programs: ['İngilizce Mütercim ve Tercümanlık', 'İngiliz Dili ve Edebiyatı', 'Dilbilimi'],
  },
  {
    triggers: ['matematik', 'fizik', 'kimya', 'arastirma', 'science', 'math', 'physics', 'chemistry', 'research'],
    programs: ['Matematik', 'Fizik', 'Kimya', 'Moleküler Biyoloji ve Genetik'],
  },
]

const DEFAULT_PROGRAMS_BY_SCORE = {
  TYT: ['Bilgisayar Programcılığı', 'Anestezi', 'İlk ve Acil Yardım'],
  SAY: ['Bilgisayar Mühendisliği', 'Tıp', 'Endüstri Mühendisliği'],
  EA: ['Psikoloji', 'Hukuk', 'Yönetim Bilişim Sistemleri'],
  'SÖZ': ['Gastronomi ve Mutfak Sanatları', 'Özel Eğitim Öğretmenliği', 'İletişim'],
  'DİL': ['İngilizce Mütercim ve Tercümanlık', 'İngilizce Öğretmenliği', 'İngiliz Dili ve Edebiyatı'],
}

function cached(key, ttl, loader) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.savedAt < ttl) return Promise.resolve(hit.value)
  return loader().then((value) => {
    cache.set(key, { value, savedAt: Date.now() })
    return value
  })
}

async function yokFetch(route, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${YOK_API}${route}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'Pusula-YKS-Explorer/1.0',
        ...options.headers,
      },
    })
    if (!response.ok) throw new Error(`YÖK Atlas returned ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('ı', 'i')
}

function isGreetingOnly(message) {
  const words = normalizeText(message)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return [
    'merhaba',
    'selam',
    'selamlar',
    'hey',
    'hello',
    'hi',
    'gunaydin',
    'iyi gunler',
    'iyi aksamlar',
    'nasilsin',
    'merhaba nasilsin',
    'selam nasilsin',
  ].includes(words)
}

function inferAdvisorIntent(message, requestedIntent = 'chat') {
  if (requestedIntent !== 'chat') return requestedIntent

  const text = normalizeText(message)
  if (isGreetingOnly(message)) return 'chat'
  if (/\b(daha guvenli|guvenli secenek\w*|safer)\b/.test(text)) return 'safer'

  const recommendationNoun = '(?:tercih\\w*|secenek\\w*|oneri\\w*|program\\w*|universite\\w*|option\\w*|suggestion\\w*|recommendation\\w*|universit\\w*|college\\w*)'
  const asksForMore = (
    new RegExp(`\\b(?:baska|yeni|ek|farkli|onceki|yukaridaki\\w*|different|additional|other)\\b.*\\b${recommendationNoun}\\b`).test(text)
    || new RegExp(`\\b${recommendationNoun}\\s+daha\\b`).test(text)
    || new RegExp(`\\bdaha\\s+(?:\\d+\\s*)?${recommendationNoun}\\b`).test(text)
    || new RegExp(`\\b(?:another|more)\\s+(?:\\d+\\s*)?${recommendationNoun}\\b`).test(text)
    || /\b(?:another|more)\s+\d+\b/.test(text)
  )
  if (asksForMore) return 'more'

  if (/\b(karsilastir\w*|kiyasla\w*|compare|comparison)\b/.test(text)) return 'compare'

  const asksAboutCity = (
    /\b(sehir\w*|city)\b/.test(text)
    && /\b(tercih\w*|degistir\w*|etki\w*|avantaj\w*|dezavantaj\w*|arti\w*|eksi\w*|yasam\w*|compare|karsilastir\w*)\b/.test(text)
  )
  if (asksAboutCity) return 'city'

  const asksForRecommendations = (
    /\b(oner\w*|tavsiye\w*|listele\w*|goster\w*|recommend\w*|suggest\w*|list\w*|show\w*|find\w*)\b/.test(text)
    && /\b(tercih\w*|secenek\w*|program\w*|universite\w*|bolum\w*|option\w*|suggestion\w*|recommendation\w*|universit\w*|college\w*|program\w*)\b/.test(text)
  ) || /\buygun\s+(universite\w*|bolum\w*|program\w*|tercih\w*|secenek\w*)\b/.test(text)
    || (
      /\b(hangi|which)\s+(universite\w*|bolum\w*|program\w*|tercih\w*|secenek\w*|universit\w*|college\w*)\b/.test(text)
      && /\b(uygun\w*|secmeli\w*|yazmali\w*|tercih\w*|choose\w*)\b/.test(text)
    )
  if (asksForRecommendations) return 'recommend'
  return 'chat'
}

function parseAdvisorRanking(message) {
  const text = normalizeText(message).replaceAll(',', '.')
  const numberPattern = '(?<number>\\d{1,3}(?:[.\\s]\\d{3})+|\\d{1,7})'
  const patterns = [
    new RegExp(`${numberPattern}\\s*(?<suffix>bin|k)?\\s*(?:siralam\\w*|sira\\w*|rank\\w*)`),
    new RegExp(`${numberPattern}\\s*(?<suffix>bin|k)?\\s*(?:tyt|say|ea|soz|dil)\\b`),
    new RegExp(`\\b(?:tyt|say|ea|soz|dil)\\b[^\\d]{0,12}${numberPattern}\\s*(?<suffix>bin|k)?`),
    new RegExp(`(?:siralam\\w*|sira\\w*|rank\\w*)[^\\d]{0,24}${numberPattern}\\s*(?<suffix>bin|k)?`),
  ]
  const recommendationNounAfterNumber = /^\s*(?:universite\w*|program\w*|bolum\w*|tercih\w*|secenek\w*|oneri\w*|suggestion\w*|recommendation\w*)\b/
  const match = patterns
    .map((pattern) => text.match(pattern))
    .find((candidate) => {
      if (!candidate?.groups?.number) return false
      const tail = text.slice((candidate.index || 0) + candidate[0].length)
      return !recommendationNounAfterNumber.test(tail)
    })
  if (!match?.groups?.number) return null

  const compact = match.groups.number.replace(/[.\s]/g, '')
  let rank = Number(compact)
  if (match.groups.suffix && rank < 1000) rank *= 1000
  return Number.isInteger(rank) && rank >= 1 && rank <= 3_000_000 ? rank : null
}

function inferAdvisorRankOverride(message, profile = {}, contextScoreTypes = []) {
  const rank = parseAdvisorRanking(message)
  if (!rank) return null

  const text = normalizeText(message)
  const explicitType = text.match(/\b(tyt|say|ea|soz|dil)\b/)?.[1]
  const typeMap = { tyt: 'TYT', say: 'SAY', ea: 'EA', soz: 'SÖZ', dil: 'DİL' }
  let scoreType = typeMap[explicitType]

  if (!scoreType) {
    const previousTypes = [...new Set(contextScoreTypes.map(scoreTypeKey).filter(Boolean))]
    const rankedTypes = Object.entries(profile.ranks || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([type]) => scoreTypeKey(type))
    const selectedTypes = [...new Set(
      (Array.isArray(profile.selectedPrograms) ? profile.selectedPrograms : [])
        .map((program) => scoreTypeKey(program.puanTuru))
        .filter(Boolean),
    )]
    if (previousTypes.length === 1) scoreType = previousTypes[0]
    else if (rankedTypes.length === 1) scoreType = rankedTypes[0]
    else if (selectedTypes.length === 1) scoreType = selectedTypes[0]
  }

  return scoreType ? { scoreType, rank } : null
}

function resolveAdvisorIntent(message, requestedIntent, previousRecommendationCodes = []) {
  const intent = inferAdvisorIntent(message, requestedIntent)
  return intent === 'recommend' && previousRecommendationCodes.length ? 'more' : intent
}

function filterFreshAdvisorRows(rows, previousRecommendationCodes = [], previousRecommendationUniversities = []) {
  const excludedCodes = new Set(previousRecommendationCodes.map(String))
  const excludedUniversities = new Set(previousRecommendationUniversities.map(normalizeText))
  return rows.filter((row) =>
    !excludedCodes.has(String(row.code))
    && !excludedUniversities.has(normalizeText(row.university)))
}

function advisorContinuationFloorByScore(rows, ranks, previousRecommendationContexts = []) {
  const matchingContextCodes = new Set(
    previousRecommendationContexts
      .filter((context) => {
        const scoreType = scoreTypeKey(context.scoreType)
        return Number(context.candidateRank) > 0
          && Number(context.candidateRank) === Number(ranks[scoreType])
      })
      .map((context) => String(context.code)),
  )
  const floorByScore = {}

  for (const row of rows) {
    const candidateRank = Number(ranks[row.scoreType])
    if (
      matchingContextCodes.has(String(row.code))
      && candidateRank > 0
      && row.rank > candidateRank + ADVISOR_MATCH_WINDOW
    ) {
      floorByScore[row.scoreType] = Math.max(
        floorByScore[row.scoreType] || 0,
        row.rank,
      )
    }
  }

  return floorByScore
}

function requestedAdvisorRecommendationCount(message, intent) {
  if (!['recommend', 'safer', 'more'].includes(intent)) return 0

  const text = normalizeText(message)
  const numberWords = {
    bir: 1,
    one: 1,
    iki: 2,
    two: 2,
    uc: 3,
    three: 3,
    dort: 4,
    four: 4,
    bes: 5,
    five: 5,
    alti: 6,
    six: 6,
    yedi: 7,
    seven: 7,
    sekiz: 8,
    eight: 8,
  }
  const countToken = '(\\d[\\d.]*|bir|iki|uc|dort|bes|alti|yedi|sekiz|one|two|three|four|five|six|seven|eight)'
  const patterns = [
    new RegExp(`\\b${countToken}\\s*(?:tane\\s*)?(?:(?:yeni|farkli|baska|different|other|more|additional)\\s*)?(?:universite\\w*|tercih\\w*|secenek\\w*|oneri\\w*|program\\w*|suggestion\\w*|recommendation\\w*)\\b`),
    new RegExp(`\\b(?:baska|daha|another|more)\\s+${countToken}\\b`),
    new RegExp(`\\b${countToken}\\s+(?:more|additional)\\b`),
  ]
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean)
  if (!match) return 5

  const token = match[1]
  const parsed = numberWords[token] || Number(token.replaceAll('.', ''))
  return Math.min(8, Math.max(1, Number.isFinite(parsed) ? parsed : 5))
}

function shouldReturnAdvisorRecommendationMetadata(intent) {
  return ['recommend', 'safer', 'more'].includes(intent)
}

function scoreTypeKey(value) {
  const normalized = String(value || '').toLocaleUpperCase('tr-TR')
  return normalized === 'DIL' ? 'DİL' : normalized
}

function buildSearchPayload({
  programId,
  scoreType,
  page = 0,
  size = 500,
  universityType = null,
  cityCodes = [],
}) {
  const selectedCityCodes = cityCodes.map(Number).filter(Number.isInteger)
  return {
    filters: {
      puanTuru: scoreType,
      universiteId: null,
      birimGrupId: [Number(programId)],
      ilKodu: selectedCityCodes.length ? [...new Set(selectedCityCodes)] : null,
      birimTuruId: scoreType === 'TYT' ? null : 46,
      universiteTuru: universityType || null,
      bursOraniId: null,
      ogrenimTuruId: null,
      kilavuzKodu: null,
      minBasariSirasi: null,
      maxBasariSirasi: null,
    },
    page: Math.max(0, Number(page) || 0),
    size: Math.min(1000, Math.max(20, Number(size) || 500)),
    sortBy: 'basariSirasi',
    direction: 'ASC',
  }
}

function findAdvisorPrograms(catalog, profile, message) {
  const byKey = new Map(catalog.map((program) => [
    `${program.birimGrupId}-${scoreTypeKey(program.puanTuru)}`,
    program,
  ]))
  const selected = (Array.isArray(profile.selectedPrograms) ? profile.selectedPrograms : [])
    .map((program) => byKey.get(`${program.birimGrupId}-${scoreTypeKey(program.puanTuru)}`))
    .filter(Boolean)
  if (selected.length) return selected.slice(0, 5)

  const interestText = normalizeText(`${profile.interests || ''} ${message || ''}`)
  const patterns = INTEREST_PROGRAMS
    .filter((category) => category.triggers.some((trigger) => interestText.includes(normalizeText(trigger))))
    .flatMap((category) => category.programs)

  if (!patterns.length) {
    Object.entries(profile.ranks || {})
      .filter(([, rank]) => Number(rank) > 0)
      .forEach(([type]) => patterns.push(...(DEFAULT_PROGRAMS_BY_SCORE[scoreTypeKey(type)] || [])))
  }

  const matches = []
  const used = new Set()
  for (const pattern of patterns) {
    const needle = normalizeText(pattern)
    const match = catalog.find((program) => normalizeText(program.birimGrupAdi) === needle)
      || catalog.find((program) => normalizeText(program.birimGrupAdi).includes(needle))
    if (match) {
      const key = `${match.birimGrupId}-${match.puanTuru}`
      if (!used.has(key)) {
        used.add(key)
        matches.push(match)
      }
    }
  }
  return matches.slice(0, 5)
}

function advisorDistance(row, ranks) {
  const rank = Number(ranks[scoreTypeKey(row.puanTuru)])
  const cutoff = Number(row.basariSirasi)
  if (!rank || !cutoff) return cutoff || Number.MAX_SAFE_INTEGER
  return Math.abs(Math.log(cutoff / rank))
}

const ADVISOR_MATCH_WINDOW = 300

function classifyAdvisorFit(candidateRank, cutoffRank) {
  const candidate = Number(candidateRank)
  const cutoff = Number(cutoffRank)
  if (!(candidate > 0 && cutoff > 0)) return 'neutral'

  const difference = cutoff - candidate
  if (Math.abs(difference) <= ADVISOR_MATCH_WINDOW) return 'match'
  return difference < 0 ? 'reach' : 'safe'
}

function advisorSelectionBand(candidateRank) {
  const rank = Number(candidateRank)
  if (!(rank > 0)) return null

  const reachMinimumGap = Math.max(400, Math.round(rank * 0.10))
  const reachMaximumGap = Math.max(800, Math.round(rank * 0.20))
  const safeMinimumGap = Math.max(ADVISOR_MATCH_WINDOW + 1, Math.round(rank * 0.10))
  const safeTargetGap = Math.max(500, Math.round(rank * 0.10))
  const safeMaximumGap = Math.max(1200, Math.round(rank * 0.25))

  return {
    reachMin: Math.max(1, rank - reachMaximumGap),
    reachTarget: Math.max(1, rank - reachMinimumGap),
    reachMax: Math.max(1, rank - reachMinimumGap),
    safeMin: rank + safeMinimumGap,
    safeTarget: rank + safeTargetGap,
    safeMax: rank + safeMaximumGap,
  }
}

function advisorSuggestionStep(candidateRank) {
  const rank = Number(candidateRank)
  if (!(rank > 0)) return 300
  return Math.max(300, Math.round(rank * 0.08))
}

function selectAdvisorRecommendations(
  rows,
  ranks,
  intent = 'recommend',
  limit = 5,
  continuationFloorByScore = {},
) {
  const requestedLimit = Math.min(8, Math.max(1, Number(limit) || 5))
  const unique = []
  const used = new Set()

  for (const row of rows) {
    if (!used.has(row.code)) {
      used.add(row.code)
      unique.push(row)
    }
  }

  const comparable = unique
    .map((row) => {
      const candidateRank = Number(ranks[row.scoreType])
      const cutoffRank = Number(row.rank)
      if (!(candidateRank > 0 && cutoffRank > 0)) return null
      const delta = cutoffRank - candidateRank
      return {
        row,
        candidateRank,
        delta,
        band: advisorSelectionBand(candidateRank),
        fit: classifyAdvisorFit(candidateRank, cutoffRank),
      }
    })
    .filter(Boolean)

  if (!comparable.length) {
    const universities = new Set()
    return unique.filter((row) => {
      const university = normalizeText(row.university)
      if (universities.has(university)) return false
      universities.add(university)
      return true
    }).slice(0, requestedLimit).map((row, index) => ({
      ...row,
      fit: 'neutral',
      slot: index + 1,
    }))
  }

  const picked = new Set()
  const pickedUniversities = new Set()
  const selected = []
  const add = (option) => {
    if (!option || picked.has(option.row.code)) return false
    const university = normalizeText(option.row.university)
    if (pickedUniversities.has(university)) return false
    picked.add(option.row.code)
    pickedUniversities.add(university)
    selected.push(option)
    return true
  }
  const closestToCandidate = (candidates) => [...candidates]
    .filter(({ row }) => !picked.has(row.code))
    .sort((a, b) =>
      Math.abs(a.delta) - Math.abs(b.delta)
      || a.row.university.localeCompare(b.row.university, 'tr-TR'))
  const closestToTarget = (candidates, targetKey) => [...candidates]
    .filter(({ row }) => !picked.has(row.code))
    .sort((a, b) =>
      Math.abs(a.row.rank - a.band[targetKey]) - Math.abs(b.row.rank - b.band[targetKey])
      || Math.abs(a.delta) - Math.abs(b.delta)
      || a.row.university.localeCompare(b.row.university, 'tr-TR'))
  const orderSafeByProgression = (candidates) => {
    const ordered = []
    const localUniversities = new Set(pickedUniversities)
    const lastRankByScore = new Map(
      Object.entries(continuationFloorByScore)
        .map(([scoreType, rank]) => [scoreTypeKey(scoreType), Number(rank) || 0]),
    )
    let remaining = candidates.filter(({ row }) =>
      !picked.has(row.code) && !localUniversities.has(normalizeText(row.university)))

    while (remaining.length) {
      remaining.sort((a, b) => {
        const aPreviousRank = lastRankByScore.get(a.row.scoreType) || 0
        const bPreviousRank = lastRankByScore.get(b.row.scoreType) || 0
        const aTarget = Math.max(
          a.band.safeTarget,
          aPreviousRank ? aPreviousRank + advisorSuggestionStep(a.candidateRank) : 0,
        )
        const bTarget = Math.max(
          b.band.safeTarget,
          bPreviousRank ? bPreviousRank + advisorSuggestionStep(b.candidateRank) : 0,
        )
        return Math.abs(a.row.rank - aTarget) - Math.abs(b.row.rank - bTarget)
          || a.row.rank - b.row.rank
          || a.row.university.localeCompare(b.row.university, 'tr-TR')
      })

      const next = remaining.shift()
      const university = normalizeText(next.row.university)
      ordered.push(next)
      localUniversities.add(university)
      lastRankByScore.set(next.row.scoreType, next.row.rank)
      remaining = remaining.filter(({ row }) =>
        row.code !== next.row.code && normalizeText(row.university) !== university)
    }

    return ordered
  }
  const reachCandidates = comparable.filter(({ fit, row, band }) =>
    fit === 'reach' && row.rank >= band.reachMin && row.rank <= band.reachMax)
  const matchCandidates = comparable.filter(({ fit }) => fit === 'match')
  const safeCandidates = comparable.filter(({ fit, row }) => {
    if (fit !== 'safe') return false
    const continuationFloor = Number(continuationFloorByScore[row.scoreType]) || 0
    return !continuationFloor || row.rank > continuationFloor
  })

  if (intent === 'safer') {
    const match = closestToCandidate(
      matchCandidates,
    )[0]
    add(match)

    const orderedSafer = orderSafeByProgression(safeCandidates)
    for (const option of orderedSafer) {
      add(option)
      if (selected.length === requestedLimit) break
    }

    return selected
      .map(({ row, fit, candidateRank }) => ({ ...row, fit, candidateRank }))
      .sort((a, b) =>
        (a.rank || Infinity) - (b.rank || Infinity)
        || a.university.localeCompare(b.university, 'tr-TR'))
      .map((row, index) => ({ ...row, slot: index + 1 }))
  }

  const reachQuota = requestedLimit >= 3 ? 1 : 0
  const safeQuota = requestedLimit >= 2 ? 1 : 0
  const matchQuota = Math.max(0, requestedLimit - reachQuota - safeQuota)

  if (matchQuota > 0) {
    for (const option of closestToCandidate(matchCandidates)) {
      add(option)
      if (selected.filter(({ fit }) => fit === 'match').length === matchQuota) break
    }
  }
  if (reachQuota) add(closestToTarget(reachCandidates, 'reachTarget')[0])
  const orderedSafe = orderSafeByProgression(safeCandidates)
  if (safeQuota) add(orderedSafe[0])

  if (selected.length < requestedLimit) {
    const remainingEligible = [
      ...closestToCandidate(matchCandidates),
      ...orderedSafe,
    ]
    for (const option of remainingEligible) {
      add(option)
      if (selected.length === requestedLimit) break
    }
  }

  return selected
    .map(({ row, fit, candidateRank }) => ({ ...row, fit, candidateRank }))
    .sort((a, b) =>
      (a.rank || Infinity) - (b.rank || Infinity)
      || a.university.localeCompare(b.university, 'tr-TR'))
    .map((row, index) => ({ ...row, slot: index + 1 }))
}

async function getAdvisorCandidates(
  profile,
  message,
  intent,
  previousRecommendationCodes = [],
  previousRecommendationUniversities = [],
  previousRecommendationContexts = [],
  requestedCount = 5,
) {
  if (intent === 'chat' || intent === 'city') {
    return { programs: [], recommendations: [] }
  }

  const catalog = await cached('programs', 12 * 60 * 60 * 1000, () =>
    yokFetch('/tercih-kilavuz/universite-programlar'),
  )
  const programs = findAdvisorPrograms(catalog, profile, message)
  if (!programs.length) return { programs: [], recommendations: [] }

  const cityCodes = (Array.isArray(profile.cityCodes) ? profile.cityCodes : [])
    .map(Number)
    .filter(Number.isInteger)
  const universityType = ['DEVLET', 'VAKIF'].includes(profile.universityType)
    ? profile.universityType
    : null

  const responses = await Promise.all(programs.map((program) => {
    const payload = buildSearchPayload({
      programId: program.birimGrupId,
      scoreType: program.puanTuru,
      universityType,
      cityCodes,
      size: 400,
    })
    const key = `search:${JSON.stringify(payload)}`
    return cached(key, 30 * 60 * 1000, () =>
      yokFetch('/tercih-kilavuz/search', { method: 'POST', body: JSON.stringify(payload) }),
    )
  }))

  const preferredCities = String(profile.cities || '')
    .split(/[,;\n]/)
    .map((city) => normalizeText(city.trim()))
    .filter(Boolean)
  const language = profile.language === 'EN' || profile.language === 'TR' ? profile.language : 'ALL'
  const merged = new Map()

  responses.forEach((data) => {
    ;(data.content || []).forEach((row) => {
      const isEnglish = normalizeText(row.ogrenimDiliAdi).includes('ingiliz')
      const languageMatch = language === 'ALL'
        || (language === 'EN' && isEnglish)
        || (language === 'TR' && !isEnglish)
      const cityMatch = !preferredCities.length
        || preferredCities.some((city) => normalizeText(row.ilAdi).includes(city))
      if (languageMatch && cityMatch) merged.set(String(row.kilavuzKodu), row)
    })
  })

  const ranks = Object.fromEntries(
    Object.entries(profile.ranks || {}).map(([type, rank]) => [scoreTypeKey(type), Number(rank) || null]),
  )
  const rows = [...merged.values()]
    .map((row) => ({
      code: String(row.kilavuzKodu),
      university: row.universiteAdi,
      faculty: row.fymkAdi || row.birimAdi,
      program: row.birimAdi,
      programGroup: row.birimGrupAdi,
      city: row.ilAdi,
      language: row.ogrenimDiliAdi,
      universityType: row.universiteTuru,
      scholarship: row.bursOraniAdi || '',
      scoreType: scoreTypeKey(row.puanTuru),
      rank: Number(row.basariSirasi) || null,
      score: Number(row.minPuan) || null,
      distance: advisorDistance(row, ranks),
    }))
    .sort((a, b) => a.distance - b.distance || (a.rank || Infinity) - (b.rank || Infinity))
  const continuationFloorByScore = intent === 'safer' || intent === 'more'
    ? advisorContinuationFloorByScore(rows, ranks, previousRecommendationContexts)
    : {}
  const freshRows = intent === 'more' || intent === 'safer'
    ? filterFreshAdvisorRows(rows, previousRecommendationCodes, previousRecommendationUniversities)
    : rows
  const recommendations = selectAdvisorRecommendations(
    freshRows,
    ranks,
    intent,
    requestedCount,
    continuationFloorByScore,
  )

  return {
    programs: programs.map((program) => ({
      name: program.birimGrupAdi,
      scoreType: scoreTypeKey(program.puanTuru),
    })),
    recommendations,
  }
}

function advisorPrompt({
  language,
  message,
  history,
  intent,
  requestedCount,
  profile,
  programs,
  recommendations,
}) {
  const locale = language === 'en' ? 'English' : 'natural Turkish'
  return [
    `Reply in ${locale}.`,
    `Requested interaction: ${intent}.`,
    `Requested recommendation count (maximum 8): ${requestedCount || 0}.`,
    `Candidate profile: ${JSON.stringify(profile)}`,
    `Matched program groups: ${JSON.stringify(programs)}`,
    `Official YÖK Atlas shortlist (2025 placement baseline): ${JSON.stringify(recommendations)}`,
    `Recent conversation: ${JSON.stringify(history)}`,
    `Latest candidate message: ${message}`,
  ].join('\n\n')
}

function localizeAdvisorFitLabels(answer, language) {
  const text = String(answer || '')
  if (language !== 'tr') return text

  const preserveCase = (source, translation) => {
    if (source === source.toUpperCase()) return translation.toLocaleUpperCase('tr-TR')
    if (source[0] === source[0].toUpperCase()) {
      return translation[0].toLocaleUpperCase('tr-TR') + translation.slice(1)
    }
    return translation
  }

  return text
    .replace(/\breach\b/gi, (label) => preserveCase(label, 'iddialı'))
    .replace(/\bmatch\b/gi, (label) => preserveCase(label, 'uygun'))
    .replace(/\bsafer\b/gi, (label) => preserveCase(label, 'daha güvenli'))
    .replace(/\bsafe\b/gi, (label) => preserveCase(label, 'daha güvenli'))
}

function advisorFitLabel(fit, language) {
  const labels = language === 'tr'
    ? {
        reach: 'İddialı',
        match: 'Uygun',
        safe: 'Daha güvenli',
        neutral: 'Sıralama değerlendirilmedi',
      }
    : {
        reach: 'Reach',
        match: 'Match',
        safe: 'Safer',
        neutral: 'Ranking not evaluated',
      }
  return labels[fit] || labels.neutral
}

function enforceAdvisorFitLabels(answer, recommendations = [], language = 'tr') {
  const localized = localizeAdvisorFitLabels(answer, language)
  if (!localized || !recommendations.length) return localized

  const knownLabel = /(?:İddialı|Iddialı|Uygun|Daha\s+güvenli|Sıralama\s+değerlendirilmedi|Reach|Match|Safer|Safe|Ranking\s+not\s+evaluated)/giu
  const paragraphs = localized.split(/(\n\s*\n)/)

  return paragraphs.map((paragraph) => {
    if (!paragraph.trim()) return paragraph
    const mentioned = recommendations.filter(({ university }) =>
      university && paragraph.includes(university))
    if (mentioned.length !== 1 || !knownLabel.test(paragraph)) {
      knownLabel.lastIndex = 0
      return paragraph
    }

    knownLabel.lastIndex = 0
    return paragraph.replace(knownLabel, advisorFitLabel(mentioned[0].fit, language))
  }).join('')
}

function sourceFromUrl(url, title = '') {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return {
      url: parsed.href,
      title: String(title || parsed.hostname.replace(/^www\./, '')).slice(0, 160),
    }
  } catch {
    return null
  }
}

function extractWebSources(response) {
  const sources = new Map()
  const add = (url, title) => {
    const source = sourceFromUrl(url, title)
    if (source && !sources.has(source.url)) sources.set(source.url, source)
  }

  for (const item of response.output || []) {
    for (const source of item?.action?.sources || []) {
      add(source.url, source.title)
    }
    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        if (annotation.type !== 'url_citation') continue
        add(
          annotation.url || annotation.url_citation?.url,
          annotation.title || annotation.url_citation?.title,
        )
      }
    }
  }

  return [...sources.values()].slice(0, 8)
}

async function openAIAdvisor(payload) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000 })
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    reasoning: { effort: OPENAI_REASONING_EFFORT },
    instructions: [
      'You are Pusula University Advisor for YKS candidates in Türkiye.',
      'Have a genuine conversation: answer the latest message directly, use conversation history, and never repeat a generic shortlist when the user asks a follow-up.',
      'Act on the requested interaction exactly rather than merely restating the candidate profile.',
      'The candidate profile already includes any ranking stated in the latest message. Treat that latest ranking as authoritative for this reply; never keep using, mention, or apologize for an older ranking.',
      'For a chat intent without a recommendation request, answer conversationally and do not introduce universities or a shortlist.',
      'For a city intent, do not name or repeat the recommendation shortlist. Give a concise city-focused answer, preferably a practical pros/cons comparison covering living costs, housing, transport, campus life, internship/industry access, and how much the city filter narrows program choices.',
      'For a compare intent, compare the supplied universities directly and concisely. Do not repeat each full recommendation description or tell the user that the same cards are being shown again.',
      'For a more intent, discuss only the newly supplied programs. Never repeat programs from the previous shortlist, and do not claim the new list is the old list. Respect the requested count up to eight; if fewer fresh programs are supplied, state that briefly and discuss only those.',
      'When a new ranking is supplied after an earlier shortlist, immediately recommend fresh universities for the new ranking from the supplied shortlist. Do not tell the candidate that the list was prepared for the old ranking.',
      'For recommendation-bearing intents, use only the supplied official YÖK Atlas shortlist when naming a university, program, city, score, cutoff ranking, or fit band. For non-recommendation questions, answer the named topic directly from the conversation and verified sources without creating a new shortlist.',
      'The application has already queried YÖK Atlas to build the supplied shortlist. Never ask the user to upload, paste, or provide a larger official list when shortlist items are present.',
      'The structured shortlist is authoritative for placement figures. Never replace, estimate, or contradict those numbers with web results.',
      'When a shortlist is supplied, it is already the exact card list and display order. Preserve it without adding, removing, substituting, or reordering universities. If it is empty, do not invent or repeat a previous shortlist.',
      'Fit classes are calculated from the candidate ranking for the matching score type using a strict 300-rank window: match is at most 300 ranks in either direction, reach is more than 300 ranks lower/more selective, and safe is more than 300 ranks higher/less selective. A candidate rank of 2,000 versus a cutoff rank of 113 is always reach, never match. Preserve each supplied classification; never infer or recalculate it.',
      'Localize every displayed fit label to the reply language. In Turkish, always write İddialı for reach, Uygun for match, and Daha güvenli for safe/safer. Never show the English words reach, match, safe, or safer anywhere in a Turkish reply, including headings, tables, parentheses, and explanations. In English, use Reach, Match, and Safer.',
      'If a shortlist item has neutral fit because no ranking exists for its score type, write Sıralama değerlendirilmedi in Turkish or Ranking not evaluated in English. Never describe a neutral item as match/Uygun.',
      'For the default five-item profile recommendation, the selector targets one reach, three matches, and one safer option when the official data contains them; missing match slots are filled with the closest safer options. For other requested counts, preserve the supplied composition exactly.',
      'For safer intent, do not repeat the previous general shortlist. Discuss only the newly supplied shortlist.',
      'When giving recommendations, write every supplied shortlist item once in the answer text, in the exact supplied order and count. For each item include the university, program, city, cutoff ranking, and localized fit label. The allowed requested count is one through eight. Do not claim that a fit band or fresh program is absent when one is supplied.',
      'Present recommendations as readable plain Markdown text only. Do not add YÖK Atlas links or imply that separate cards or buttons will appear.',
      'Do not introduce a much more distant cutoff when closer options from the shortlist are available.',
      'Use web search when current university facts, language requirements, fees, scholarships, quotas, facilities, or other time-sensitive details would improve the answer.',
      'Prefer official university, ÖSYM, YÖK, and YÖK Atlas sources. Clearly distinguish sourced current facts from your interpretation.',
      'Never invent placement data, language requirements, quotas, campus facts, or admission guarantees.',
      'Connect recommendations to the candidate’s interests and score-type ranking.',
      'Explain the localized fit labels as comparison bands, not admission probabilities.',
      'Keep the answer warm, practical, and concise. Ask at most one focused follow-up question if important profile information is missing.',
      'End with a brief reminder to verify the current ÖSYM guide and university conditions.',
    ].join(' '),
    input: advisorPrompt(payload),
    tools: [{
      type: 'web_search',
      search_context_size: 'medium',
      user_location: {
        type: 'approximate',
        country: 'TR',
      },
    }],
    tool_choice: 'auto',
    include: ['web_search_call.action.sources'],
    store: false,
    max_output_tokens: 1400,
  })
  return {
    answer: response.output_text?.trim() || '',
    sources: extractWebSources(response),
  }
}

function isTrustedAdvisorOrigin(req) {
  const origin = req.get('origin')
  if (!origin) return !IS_PRODUCTION
  if (!IS_PRODUCTION && /^https?:\/\/localhost(?::\d+)?$/i.test(origin)) return true

  try {
    const parsedOrigin = new URL(origin)
    if (parsedOrigin.host === req.get('host')) return true
    return TRUSTED_APP_ORIGINS.has(parsedOrigin.origin)
  } catch {
    return false
  }
}

function consumeAdvisorQuota(ip) {
  const now = Date.now()

  if (advisorRateLimit.size > ADVISOR_GLOBAL_HOURLY_LIMIT * 2) {
    for (const [address, record] of advisorRateLimit) {
      if (now - record.startedAt > ADVISOR_WINDOW_MS) advisorRateLimit.delete(address)
    }
  }

  if (now - advisorGlobalRateLimit.startedAt > 60 * 60 * 1000) {
    advisorGlobalRateLimit.startedAt = now
    advisorGlobalRateLimit.count = 0
  }
  if (advisorGlobalRateLimit.count >= ADVISOR_GLOBAL_HOURLY_LIMIT) {
    return { allowed: false, retryAfter: 3600 }
  }

  const record = advisorRateLimit.get(ip)
  if (!record || now - record.startedAt > ADVISOR_WINDOW_MS) {
    advisorRateLimit.set(ip, { startedAt: now, count: 1 })
    advisorGlobalRateLimit.count += 1
    return { allowed: true }
  }

  if (record.count >= ADVISOR_IP_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((ADVISOR_WINDOW_MS - (now - record.startedAt)) / 1000)),
    }
  }

  record.count += 1
  advisorGlobalRateLimit.count += 1
  return { allowed: true }
}

function normalizeUniversityReviewName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 180)
}

function universityReviewKey(university) {
  const normalized = normalizeText(normalizeUniversityReviewName(university))
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

function normalizeReviewRatings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const ratings = Object.fromEntries(REVIEW_FIELDS.map((field) => [field, Number(value[field])]))
  return REVIEW_FIELDS.every((field) =>
    Number.isInteger(ratings[field]) && ratings[field] >= 1 && ratings[field] <= 5)
    ? ratings
    : null
}

function consumeReviewQuota(ip) {
  const now = Date.now()
  const record = reviewRateLimit.get(ip)
  if (!record || now - record.startedAt > REVIEW_WINDOW_MS) {
    reviewRateLimit.set(ip, { startedAt: now, count: 1 })
    return { allowed: true }
  }
  if (record.count >= REVIEW_IP_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((REVIEW_WINDOW_MS - (now - record.startedAt)) / 1000)),
    }
  }
  record.count += 1
  return { allowed: true }
}

function reviewSummaryData(summary = {}, reviews = []) {
  const count = Math.max(0, Number(summary.count) || 0)
  const averages = Object.fromEntries(REVIEW_FIELDS.map((field) => [
    field,
    count ? Number(((Number(summary[`${field}Total`]) || 0) / count).toFixed(2)) : 0,
  ]))
  const overall = count
    ? Number((REVIEW_FIELDS.reduce((sum, field) => sum + averages[field], 0) / REVIEW_FIELDS.length).toFixed(2))
    : 0

  return {
    university: normalizeUniversityReviewName(summary.universityName),
    count,
    overall,
    averages,
    reviews: reviews.map((review) => ({
      id: review.id,
      comment: String(review.comment || '').slice(0, 500),
    })),
  }
}

async function loadUniversityReviews(university) {
  const name = normalizeUniversityReviewName(university)
  const key = universityReviewKey(name)
  if (USE_LOCAL_REVIEW_STORE) {
    return reviewSummaryData(
      localReviewStore.get(key) || { universityName: name },
      [],
    )
  }

  const summaryRef = getFirestore().collection('universityReviewSummaries').doc(key)
  const [summarySnapshot, reviewsSnapshot] = await Promise.all([
    summaryRef.get(),
    summaryRef.collection('reviews').orderBy('createdAt', 'desc').limit(30).get(),
  ])
  const approvedReviews = reviewsSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((review) => review.status === 'approved' && review.comment)
    .slice(0, 6)

  return reviewSummaryData(
    summarySnapshot.exists ? summarySnapshot.data() : { universityName: name },
    approvedReviews,
  )
}

function logUpstreamError(area, error) {
  console.error(`${area}: ${error instanceof Error ? error.message : String(error)}`)
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    source: 'YÖK Atlas',
    latestPlacementYear: 2025,
  })
})

app.get('/api/programs', async (_req, res) => {
  try {
    const data = await cached('programs', 12 * 60 * 60 * 1000, () =>
      yokFetch('/tercih-kilavuz/universite-programlar'),
    )
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(data)
  } catch (error) {
    logUpstreamError('Program catalog error', error)
    res.status(502).json({ message: 'Program catalog is temporarily unavailable.' })
  }
})

app.get('/api/cities', async (_req, res) => {
  try {
    const data = await cached('cities', 12 * 60 * 60 * 1000, () =>
      yokFetch('/tercih-kilavuz/universite-iller'),
    )
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(data)
  } catch (error) {
    logUpstreamError('City catalog error', error)
    res.status(502).json({ message: 'City catalog is temporarily unavailable.' })
  }
})

app.post('/api/search', async (req, res) => {
  const {
    programId,
    scoreType,
    page = 0,
    size = 500,
    universityType = null,
    cityCode = null,
    cityCodes = null,
  } = req.body || {}
  if (!Number.isInteger(Number(programId)) || !scoreType) {
    return res.status(400).json({ message: 'programId and scoreType are required.' })
  }

  const selectedCityCodes = Array.isArray(cityCodes) ? cityCodes : cityCode ? [cityCode] : []
  const payload = buildSearchPayload({
    programId,
    scoreType,
    page,
    size,
    universityType,
    cityCodes: selectedCityCodes,
  })

  const key = `search:${JSON.stringify(payload)}`
  try {
    const data = await cached(key, 30 * 60 * 1000, () =>
      yokFetch('/tercih-kilavuz/search', { method: 'POST', body: JSON.stringify(payload) }),
    )
    res.json(data)
  } catch (error) {
    logUpstreamError('Admissions search error', error)
    res.status(502).json({ message: 'Admissions data is temporarily unavailable.' })
  }
})

app.post('/api/nets', async (req, res) => {
  const { year = 2025, programCode } = req.body || {}
  if (!programCode) return res.status(400).json({ message: 'programCode is required.' })

  const payload = {
    filters: { yil: Number(year), kilavuzKodu: String(programCode) },
    page: 0,
    size: 10,
  }
  const key = `nets:${year}:${programCode}`
  try {
    const data = await cached(key, 24 * 60 * 60 * 1000, () =>
      yokFetch('/netler/search', { method: 'POST', body: JSON.stringify(payload) }),
    )
    res.json(data)
  } catch (error) {
    logUpstreamError('Net breakdown error', error)
    res.status(502).json({ message: 'Net breakdown is temporarily unavailable.' })
  }
})

app.get('/api/reviews', async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0')
  const university = normalizeUniversityReviewName(req.query.university)
  if (university.length < 3) {
    return res.status(400).json({ message: 'A valid university name is required.' })
  }

  try {
    return res.json(await loadUniversityReviews(university))
  } catch (error) {
    logUpstreamError('University reviews error', error)
    return res.status(503).json({ message: 'Student reviews are temporarily unavailable.' })
  }
})

app.post('/api/reviews', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (!isTrustedAdvisorOrigin(req)) {
    return res.status(403).json({ message: 'Reviews are accepted only from the Pusula website.' })
  }

  const quota = consumeReviewQuota(req.ip || req.socket.remoteAddress || 'unknown')
  if (!quota.allowed) {
    res.set('Retry-After', String(quota.retryAfter))
    return res.status(429).json({ message: 'Too many reviews were submitted. Please try again later.' })
  }

  const university = normalizeUniversityReviewName(req.body?.university)
  const ratings = normalizeReviewRatings(req.body?.ratings)
  const comment = String(req.body?.comment || '').trim().replace(/\s+/g, ' ').slice(0, 500)
  const clientId = String(req.body?.clientId || '').trim()
  const programCode = String(req.body?.programCode || '').replace(/\D/g, '').slice(0, 20)
  if (university.length < 3 || !ratings || !/^[a-f0-9-]{16,80}$/i.test(clientId)) {
    return res.status(400).json({ message: 'University, four ratings, and a valid anonymous client ID are required.' })
  }

  const key = universityReviewKey(university)
  const reviewerKey = crypto
    .createHash('sha256')
    .update(`${key}:${clientId}`)
    .digest('hex')
    .slice(0, 40)

  if (USE_LOCAL_REVIEW_STORE) {
    const current = localReviewStore.get(key) || {
      universityName: university,
      count: 0,
      dormsTotal: 0,
      professorsTotal: 0,
      campusTotal: 0,
      socialLifeTotal: 0,
      reviewerKeys: new Set(),
    }
    if (current.reviewerKeys.has(reviewerKey)) {
      return res.status(409).json({
        message: 'A review for this university was already submitted from this browser.',
      })
    }
    current.reviewerKeys.add(reviewerKey)
    current.count += 1
    REVIEW_FIELDS.forEach((field) => {
      current[`${field}Total`] += ratings[field]
    })
    localReviewStore.set(key, current)
    return res.status(201).json({
      ok: true,
      moderationRequired: Boolean(comment),
      summary: reviewSummaryData(current, []),
    })
  }

  const summaryRef = getFirestore().collection('universityReviewSummaries').doc(key)
  const reviewRef = summaryRef.collection('reviews').doc(reviewerKey)

  try {
    await getFirestore().runTransaction(async (transaction) => {
      const existing = await transaction.get(reviewRef)
      if (existing.exists) {
        const duplicate = new Error('A review for this university was already submitted from this browser.')
        duplicate.code = 'review/already-exists'
        throw duplicate
      }

      transaction.set(reviewRef, {
        universityName: university,
        programCode: programCode || null,
        ratings,
        comment: comment || null,
        status: comment ? 'pending' : 'ratings-only',
        createdAt: FieldValue.serverTimestamp(),
      })
      transaction.set(summaryRef, {
        universityName: university,
        count: FieldValue.increment(1),
        dormsTotal: FieldValue.increment(ratings.dorms),
        professorsTotal: FieldValue.increment(ratings.professors),
        campusTotal: FieldValue.increment(ratings.campus),
        socialLifeTotal: FieldValue.increment(ratings.socialLife),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })

    return res.status(201).json({
      ok: true,
      moderationRequired: Boolean(comment),
      summary: await loadUniversityReviews(university),
    })
  } catch (error) {
    if (error?.code === 'review/already-exists') {
      return res.status(409).json({ message: error.message })
    }
    logUpstreamError('University review submission error', error)
    return res.status(503).json({ message: 'Your review could not be saved right now.' })
  }
})

app.post('/api/advisor', async (req, res) => {
  res.set('Cache-Control', 'no-store')

  if (!isTrustedAdvisorOrigin(req)) {
    return res.status(403).json({ message: 'Advisor requests are accepted only from the Pusula website.' })
  }

  const quota = consumeAdvisorQuota(req.ip || req.socket.remoteAddress || 'unknown')
  if (!quota.allowed) {
    res.set('Retry-After', String(quota.retryAfter))
    return res.status(429).json({ message: 'Too many advisor requests. Please try again in a few minutes.' })
  }

  const message = String(req.body?.message || '').trim().slice(0, 1200)
  const language = req.body?.language === 'en' ? 'en' : 'tr'
  const requestedIntent = ['chat', 'recommend', 'safer', 'compare', 'city', 'more'].includes(req.body?.intent)
    ? req.body.intent
    : 'chat'
  const rawProfile = req.body?.profile && typeof req.body.profile === 'object' && !Array.isArray(req.body.profile)
    ? req.body.profile
    : {}
  const rawRanks = rawProfile.ranks && typeof rawProfile.ranks === 'object' && !Array.isArray(rawProfile.ranks)
    ? rawProfile.ranks
    : {}
  const profile = {
    interests: String(rawProfile.interests || '').trim().slice(0, 800),
    ranks: Object.fromEntries(
      Object.entries(rawRanks)
        .slice(0, 5)
        .map(([type, rank]) => [scoreTypeKey(type), Number(rank) > 0 ? Math.round(Number(rank)) : null]),
    ),
    cities: String(rawProfile.cities || '').trim().slice(0, 300),
    cityCodes: (Array.isArray(rawProfile.cityCodes) ? rawProfile.cityCodes : []).slice(0, 20),
    language: ['ALL', 'TR', 'EN'].includes(rawProfile.language) ? rawProfile.language : 'ALL',
    universityType: ['ALL', 'DEVLET', 'VAKIF'].includes(rawProfile.universityType) ? rawProfile.universityType : 'ALL',
    selectedPrograms: (Array.isArray(rawProfile.selectedPrograms) ? rawProfile.selectedPrograms : [])
      .slice(0, 5)
      .map((program) => ({
        birimGrupId: Number(program.birimGrupId),
        puanTuru: scoreTypeKey(program.puanTuru),
        birimGrupAdi: String(program.birimGrupAdi || '').slice(0, 120),
      }))
      .filter((program) => Number.isInteger(program.birimGrupId) && program.puanTuru),
  }
  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .slice(-8)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').slice(0, 1500),
    }))
    .filter((item) => item.content)
  const previousRecommendationCodes = (Array.isArray(req.body?.previousRecommendationCodes)
    ? req.body.previousRecommendationCodes
    : [])
    .map((code) => String(code))
    .filter((code) => /^\d+$/.test(code))
    .slice(0, 64)
  const previousRecommendationUniversities = (Array.isArray(req.body?.previousRecommendationUniversities)
    ? req.body.previousRecommendationUniversities
    : [])
    .map((university) => String(university || '').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 64)
  const previousRecommendationScoreTypes = (Array.isArray(req.body?.previousRecommendationScoreTypes)
    ? req.body.previousRecommendationScoreTypes
    : [])
    .map(scoreTypeKey)
    .filter((type) => ['TYT', 'SAY', 'EA', 'SÖZ', 'DİL'].includes(type))
    .slice(0, 64)
  const previousRecommendationContexts = (Array.isArray(req.body?.previousRecommendationContexts)
    ? req.body.previousRecommendationContexts
    : [])
    .slice(-64)
    .map((context) => ({
      code: String(context?.code || ''),
      scoreType: scoreTypeKey(context?.scoreType),
      candidateRank: Number(context?.candidateRank) > 0
        ? Math.round(Number(context.candidateRank))
        : null,
    }))
    .filter((context) =>
      /^\d+$/.test(context.code)
      && ['TYT', 'SAY', 'EA', 'SÖZ', 'DİL'].includes(context.scoreType)
      && context.candidateRank)
  const rankOverride = inferAdvisorRankOverride(message, profile, previousRecommendationScoreTypes)
  if (rankOverride) {
    profile.ranks = {
      ...profile.ranks,
      [rankOverride.scoreType]: rankOverride.rank,
    }
  }
  const intent = resolveAdvisorIntent(message, requestedIntent, previousRecommendationCodes)
  const requestedCount = requestedAdvisorRecommendationCount(message, intent)

  if (!message && !profile.interests) {
    return res.status(400).json({ message: 'Tell the advisor about your interests or ask a question.' })
  }
  if (isGreetingOnly(message)) {
    return res.json({
      answer: language === 'tr'
        ? 'Merhaba! Tercih sürecinle ilgili nasıl yardımcı olabilirim?'
        : 'Hello! How can I help with your university choices?',
      sources: [],
      recommendations: [],
      matchedPrograms: [],
      provider: 'local',
      model: 'Pusula',
    })
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      message: language === 'tr'
        ? 'OpenAI API anahtarı ayarlanmamış. .env dosyasındaki OPENAI_API_KEY alanına kendi anahtarını ekleyip sunucuyu yeniden başlat.'
        : 'The OpenAI API key is not configured. Add your key to OPENAI_API_KEY in .env and restart the server.',
    })
  }

  try {
    const grounded = await getAdvisorCandidates(
      profile,
      message,
      intent,
      previousRecommendationCodes,
      previousRecommendationUniversities,
      previousRecommendationContexts,
      requestedCount,
    )
    const payload = { language, message, history, intent, requestedCount, profile, ...grounded }
    const result = await openAIAdvisor(payload)
    if (!result.answer) throw new Error('OpenAI returned an empty response.')
    res.json({
      answer: enforceAdvisorFitLabels(result.answer, grounded.recommendations, language),
      sources: result.sources,
      recommendations: shouldReturnAdvisorRecommendationMetadata(intent)
        ? grounded.recommendations
        : [],
      matchedPrograms: grounded.programs,
      provider: 'openai',
      model: OPENAI_MODEL,
      reasoningEffort: OPENAI_REASONING_EFFORT,
    })
  } catch (error) {
    logUpstreamError('OpenAI advisor error', error)
    res.status(502).json({
      message: language === 'tr'
        ? 'AI danışman şu anda yanıt veremiyor. API anahtarını ve OpenAI erişimini kontrol edip yeniden dene.'
        : 'The AI advisor cannot answer right now. Check the API key and OpenAI access, then try again.',
    })
  }
})

const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distPath, 'index.html'), (error) => error && next())
})

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Pusula API listening on http://localhost:${PORT}`)
  })
}

export {
  app,
  advisorContinuationFloorByScore,
  advisorSelectionBand,
  advisorSuggestionStep,
  classifyAdvisorFit,
  enforceAdvisorFitLabels,
  filterFreshAdvisorRows,
  inferAdvisorRankOverride,
  inferAdvisorIntent,
  isGreetingOnly,
  normalizeReviewRatings,
  requestedAdvisorRecommendationCount,
  resolveAdvisorIntent,
  reviewSummaryData,
  selectAdvisorRecommendations,
  shouldReturnAdvisorRecommendationMetadata,
  universityReviewKey,
}
