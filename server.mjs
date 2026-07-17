import 'dotenv/config'
import express from 'express'
import OpenAI from 'openai'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

function selectAdvisorRecommendations(rows, ranks, intent = 'recommend') {
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
      return candidateRank > 0 && cutoffRank > 0
        ? { row, ratio: cutoffRank / candidateRank }
        : null
    })
    .filter(Boolean)

  if (!comparable.length) {
    return unique.slice(0, 5).map((row, index) => ({
      ...row,
      fit: 'neutral',
      slot: index + 1,
    }))
  }

  const picked = new Set()
  const closestTo = (candidates, target) => [...candidates]
    .filter(({ row }) => !picked.has(row.code))
    .sort((a, b) =>
      Math.abs(Math.log(a.ratio / target)) - Math.abs(Math.log(b.ratio / target))
      || a.row.distance - b.row.distance
      || a.row.university.localeCompare(b.row.university, 'tr-TR'))[0]

  if (intent === 'safer') {
    const match = closestTo(
      comparable.filter(({ ratio }) => ratio >= 0.9 && ratio < 1.08),
      1,
    ) || closestTo(comparable, 1)
    if (match) picked.add(match.row.code)

    const preferredSafer = comparable
      .filter(({ row, ratio }) =>
        !picked.has(row.code) && ratio >= 1.08 && ratio <= 1.5)
      .sort((a, b) =>
        a.ratio - b.ratio
        || a.row.university.localeCompare(b.row.university, 'tr-TR'))
    const preferredCodes = new Set(preferredSafer.map(({ row }) => row.code))
    const saferFallbacks = comparable
      .filter(({ row, ratio }) =>
        !picked.has(row.code) && ratio > 1 && !preferredCodes.has(row.code))
      .sort((a, b) =>
        Math.abs(a.ratio - 1.08) - Math.abs(b.ratio - 1.08)
        || a.row.university.localeCompare(b.row.university, 'tr-TR'))
    const orderedSafer = [...preferredSafer, ...saferFallbacks]
    const saferOptions = []
    const usedUniversities = new Set(
      match ? [normalizeText(match.row.university)] : [],
    )

    for (const option of orderedSafer) {
      const university = normalizeText(option.row.university)
      if (usedUniversities.has(university)) continue
      usedUniversities.add(university)
      saferOptions.push(option)
      if (saferOptions.length === 4) break
    }
    if (saferOptions.length < 4) {
      const selectedCodes = new Set(saferOptions.map(({ row }) => row.code))
      for (const option of orderedSafer) {
        if (selectedCodes.has(option.row.code)) continue
        saferOptions.push(option)
        if (saferOptions.length === 4) break
      }
    }

    saferOptions
      .sort((a, b) =>
        a.ratio - b.ratio
        || a.row.university.localeCompare(b.row.university, 'tr-TR'))

    const saferShortlist = []
    if (match) saferShortlist.push({ ...match.row, fit: 'match' })
    saferShortlist.push(...saferOptions.map(({ row }) => ({ ...row, fit: 'safe' })))
    return saferShortlist
      .sort((a, b) =>
        (a.rank || Infinity) - (b.rank || Infinity)
        || a.university.localeCompare(b.university, 'tr-TR'))
      .map((row, index) => ({
        ...row,
        fit: index === 0 ? 'match' : 'safe',
        slot: index + 1,
      }))
  }

  // A reach should be slightly more selective than the candidate's rank.
  const reach = closestTo(
    comparable.filter(({ ratio }) => ratio >= 0.7 && ratio < 1),
    0.96,
  ) || closestTo(comparable.filter(({ ratio }) => ratio < 1), 0.96)
  if (reach) picked.add(reach.row.code)

  // Aim near 14k for a 12k candidate, while avoiding a misleadingly distant option.
  const safer = closestTo(
    comparable.filter(({ ratio }) => ratio >= 1.08 && ratio <= 1.5),
    7 / 6,
  ) || closestTo(comparable.filter(({ ratio }) => ratio > 1), 7 / 6)
  if (safer) picked.add(safer.row.code)

  const matchPool = comparable
    .filter(({ row }) => !picked.has(row.code))
    .sort((a, b) =>
      Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio))
      || a.ratio - b.ratio
      || a.row.university.localeCompare(b.row.university, 'tr-TR'))
  const matches = matchPool
    .slice(0, 3)
    .sort((a, b) =>
      a.ratio - b.ratio
      || a.row.university.localeCompare(b.row.university, 'tr-TR'))
  matches.forEach(({ row }) => picked.add(row.code))

  const shortlist = []
  if (reach) shortlist.push({ ...reach.row, fit: 'reach' })
  shortlist.push(...matches.map(({ row }) => ({ ...row, fit: 'match' })))
  if (safer) shortlist.push({ ...safer.row, fit: 'safe' })

  return shortlist
    .sort((a, b) =>
      (a.rank || Infinity) - (b.rank || Infinity)
      || a.university.localeCompare(b.university, 'tr-TR'))
    .map((row, index, ordered) => ({
      ...row,
      fit: index === 0 ? 'reach' : index === ordered.length - 1 ? 'safe' : 'match',
      slot: index + 1,
    }))
}

async function getAdvisorCandidates(profile, message, intent, previousRecommendationCodes = []) {
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
  const excludedCodes = new Set(previousRecommendationCodes)
  const freshRows = intent === 'safer'
    ? rows.filter((row) => !excludedCodes.has(row.code))
    : rows
  const recommendationRows = freshRows.length >= 5 ? freshRows : rows
  const recommendations = selectAdvisorRecommendations(recommendationRows, ranks, intent)

  return {
    programs: programs.map((program) => ({
      name: program.birimGrupAdi,
      scoreType: scoreTypeKey(program.puanTuru),
    })),
    recommendations,
  }
}

function advisorPrompt({ language, message, history, intent, profile, programs, recommendations }) {
  const locale = language === 'en' ? 'English' : 'natural Turkish'
  return [
    `Reply in ${locale}.`,
    `Requested interaction: ${intent}.`,
    `Candidate profile: ${JSON.stringify(profile)}`,
    `Matched program groups: ${JSON.stringify(programs)}`,
    `Official YÖK Atlas shortlist (2025 placement baseline): ${JSON.stringify(recommendations)}`,
    `Recent conversation: ${JSON.stringify(history)}`,
    `Latest candidate message: ${message}`,
  ].join('\n\n')
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
      'For recommend, safer, compare, and city intents, act on that exact request rather than merely restating the candidate profile.',
      'Use only the supplied official YÖK Atlas shortlist when naming a university, program, city, score, cutoff ranking, or fit band.',
      'The structured shortlist is authoritative for placement figures. Never replace, estimate, or contradict those numbers with web results.',
      'The shortlist is already the exact card list and display order. Preserve it without adding, removing, substituting, or reordering universities.',
      'For a standard five-item shortlist, its fit sequence is exactly one reach, three match, and one safe. For a safer-intent shortlist, its fit sequence is exactly one match followed by four safe options. State the supplied fit labels exactly; never infer or recalculate them.',
      'For safer intent, do not repeat the previous general shortlist. Discuss the newly supplied one-match plus four-safe shortlist.',
      'Reach means a nearby program whose 2025 cutoff rank is numerically lower (more selective) than the candidate rank. Safe means a nearby cutoff rank that is numerically higher, targeted around 15–17% behind the candidate rank. Match fills the three nearby middle options.',
      'When giving recommendations, discuss the same five shortlist items once, in order. Do not claim that a fit band is absent when an item with that fit is supplied.',
      'Do not add YÖK Atlas links to the prose; the interface renders the authoritative linked cards directly below the answer.',
      'Do not introduce a much more distant cutoff when closer options from the shortlist are available.',
      'Use web search when current university facts, language requirements, fees, scholarships, quotas, facilities, or other time-sensitive details would improve the answer.',
      'Prefer official university, ÖSYM, YÖK, and YÖK Atlas sources. Clearly distinguish sourced current facts from your interpretation.',
      'Never invent placement data, language requirements, quotas, campus facts, or admission guarantees.',
      'Connect recommendations to the candidate’s interests and score-type ranking.',
      'Explain safer, match, and reach as comparison bands, not admission probabilities.',
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
  const intent = ['chat', 'recommend', 'safer', 'compare', 'city'].includes(req.body?.intent)
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
    .slice(0, 25)

  if (!message && !profile.interests) {
    return res.status(400).json({ message: 'Tell the advisor about your interests or ask a question.' })
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
    )
    const payload = { language, message, history, intent, profile, ...grounded }
    const result = await openAIAdvisor(payload)
    if (!result.answer) throw new Error('OpenAI returned an empty response.')
    res.json({
      answer: result.answer,
      sources: result.sources,
      recommendations: grounded.recommendations,
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

const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distPath, 'index.html'), (error) => error && next())
})

app.listen(PORT, () => {
  console.log(`Pusula API listening on http://localhost:${PORT}`)
})
