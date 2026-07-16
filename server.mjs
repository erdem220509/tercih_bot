import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const PORT = Number(process.env.PORT || 8787)
const YOK_API = 'https://yokatlas.yok.gov.tr/api'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json({ limit: '64kb' }))

const cache = new Map()

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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, source: 'YÖK Atlas', latestPlacementYear: 2025 })
})

app.get('/api/programs', async (_req, res) => {
  try {
    const data = await cached('programs', 12 * 60 * 60 * 1000, () =>
      yokFetch('/tercih-kilavuz/universite-programlar'),
    )
    res.set('Cache-Control', 'public, max-age=3600')
    res.json(data)
  } catch (error) {
    res.status(502).json({ message: 'Program catalog is temporarily unavailable.', detail: error.message })
  }
})

app.post('/api/search', async (req, res) => {
  const { programId, scoreType, page = 0, size = 500, universityType = null, cityCode = null } = req.body || {}
  if (!Number.isInteger(Number(programId)) || !scoreType) {
    return res.status(400).json({ message: 'programId and scoreType are required.' })
  }

  const payload = {
    filters: {
      puanTuru: scoreType,
      universiteId: null,
      birimGrupId: [Number(programId)],
      ilKodu: cityCode ? [Number(cityCode)] : null,
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

  const key = `search:${JSON.stringify(payload)}`
  try {
    const data = await cached(key, 30 * 60 * 1000, () =>
      yokFetch('/tercih-kilavuz/search', { method: 'POST', body: JSON.stringify(payload) }),
    )
    res.json(data)
  } catch (error) {
    res.status(502).json({ message: 'Admissions data is temporarily unavailable.', detail: error.message })
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
    res.status(502).json({ message: 'Net breakdown is temporarily unavailable.', detail: error.message })
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
