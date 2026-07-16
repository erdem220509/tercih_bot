import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  Info,
  Languages,
  LoaderCircle,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  X,
} from 'lucide-react'
import { getNets, getPrograms, searchPrograms } from './api'
import { findLanguageRequirement } from './data/languageRequirements'

const YEARS = [2022, 2023, 2024, 2025]
const numberFormat = new Intl.NumberFormat('tr-TR')
const scoreFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 5, useGrouping: false })

function formatRank(value) {
  return value == null || value === '' ? '—' : numberFormat.format(Number(value))
}

function formatScore(value) {
  return value == null || value === '' ? '—' : scoreFormat.format(Number(value))
}

function yearData(row) {
  return [
    { year: 2022, rank: row.basariSirasi3, score: row.minPuan3 },
    { year: 2023, rank: row.basariSirasi2, score: row.minPuan2 },
    { year: 2024, rank: row.basariSirasi1, score: row.minPuan1 },
    { year: 2025, rank: row.basariSirasi, score: row.minPuan },
  ]
}

function matchStatus(userRank, cutoffRank) {
  if (!userRank || !cutoffRank) return null
  const ratio = Number(userRank) / Number(cutoffRank)
  if (ratio <= 0.85) return { label: 'Safer', tone: 'safe' }
  if (ratio <= 1.08) return { label: 'Match', tone: 'match' }
  return { label: 'Reach', tone: 'reach' }
}

function TrendLine({ values }) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (clean.length < 2) return <span className="trend-empty">Not enough history</span>
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const range = max - min || 1
  const points = values.map((raw, index) => {
    const value = Number(raw)
    const x = 4 + (index * 72) / Math.max(1, values.length - 1)
    const y = Number.isFinite(value) ? 28 - ((value - min) / range) * 22 : 28
    return `${x},${y}`
  })
  return (
    <svg className="trend-line" viewBox="0 0 80 32" role="img" aria-label="Four-year cutoff rank trend">
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={YEARS[index]} cx={cx} cy={cy} r="2.2" fill="currentColor" />
      })}
    </svg>
  )
}

function ProgramPicker({ programs, selected, onSelect, loading }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const close = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => setQuery(selected?.birimGrupAdi || ''), [selected])

  const matches = useMemo(() => {
    const needle = query.toLocaleLowerCase('tr-TR').trim()
    return programs
      .filter((item) => !needle || item.birimGrupAdi.toLocaleLowerCase('tr-TR').includes(needle))
      .slice(0, 24)
  }, [programs, query])

  return (
    <div className="program-picker" ref={containerRef}>
      <label htmlFor="program-search">Program</label>
      <div className={`picker-input ${open ? 'is-open' : ''}`}>
        <Search size={18} aria-hidden="true" />
        <input
          id="program-search"
          value={query}
          placeholder={loading ? 'Loading official catalog…' : 'Try “Bilgisayar Mühendisliği”'}
          autoComplete="off"
          disabled={loading}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
        />
        {query && !loading ? (
          <button type="button" className="icon-button" aria-label="Clear program" onClick={() => { setQuery(''); setOpen(true) }}>
            <X size={16} />
          </button>
        ) : <ChevronDown size={17} aria-hidden="true" />}
      </div>
      {open && !loading && (
        <div className="picker-menu" role="listbox" aria-label="Programs">
          {matches.length ? matches.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={selected?.birimGrupId === item.birimGrupId}
              key={`${item.birimGrupId}-${item.puanTuru}`}
              onClick={() => { onSelect(item); setQuery(item.birimGrupAdi); setOpen(false) }}
            >
              <span>{item.birimGrupAdi}</span>
              <small>{item.puanTuru}</small>
              {selected?.birimGrupId === item.birimGrupId && <Check size={16} />}
            </button>
          )) : <p className="picker-empty">No matching program</p>}
        </div>
      )}
    </div>
  )
}

const NET_FIELDS = [
  ['TYT', 'Turkish', 'tytTrkNet'], ['TYT', 'Social sciences', 'tytSosNet'],
  ['TYT', 'Mathematics', 'tytMatNet'], ['TYT', 'Science', 'tytFenNet'],
  ['AYT', 'Mathematics', 'aytMatNet'], ['AYT', 'Physics', 'aytFizNet'],
  ['AYT', 'Chemistry', 'aytKimNet'], ['AYT', 'Biology', 'aytBioNet'],
  ['AYT', 'Turkish lit.', 'aytTdeNet'], ['AYT', 'History 1', 'aytTrh1Net'],
  ['AYT', 'Geography 1', 'aytCog1Net'], ['AYT', 'History 2', 'aytTrh2Net'],
  ['AYT', 'Geography 2', 'aytCog2Net'], ['AYT', 'Philosophy', 'aytFelNet'],
  ['AYT', 'Religion', 'aytDinNet'], ['YDT', 'Foreign language', 'ydtYdilNet'],
]

function NetBreakdown({ programCode }) {
  const [state, setState] = useState({ loading: true, row: null, error: '' })

  useEffect(() => {
    let active = true
    setState({ loading: true, row: null, error: '' })
    getNets(programCode).then((data) => {
      if (active) setState({ loading: false, row: data.content?.[0] || null, error: '' })
    }).catch((error) => {
      if (active) setState({ loading: false, row: null, error: error.message })
    })
    return () => { active = false }
  }, [programCode])

  if (state.loading) return <div className="inline-loading"><LoaderCircle className="spin" size={17} /> Loading the last placed student’s nets…</div>
  if (state.error) return <p className="muted">Net details could not be loaded right now.</p>
  if (!state.row) return <p className="muted">YÖK Atlas does not publish a net breakdown for this program.</p>

  const available = NET_FIELDS.filter(([, , field]) => state.row[field] != null)
  return (
    <div>
      <div className="net-grid">
        {available.map(([exam, label, field]) => (
          <div className="net-item" key={field}>
            <span><small>{exam}</small>{label}</span>
            <strong>{Number(state.row[field]).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</strong>
          </div>
        ))}
      </div>
      <p className="microcopy">YÖK Atlas publishes net values, not the candidate’s separate correct and incorrect answer counts. OBP: <b>{state.row.obp ?? '—'}</b></p>
    </div>
  )
}

function LanguagePanel({ row }) {
  const rule = findLanguageRequirement(row.universiteAdi)
  const isEnglish = String(row.ogrenimDiliAdi).toLocaleLowerCase('tr-TR').includes('ingiliz')
  if (!isEnglish) return <p className="muted">This program is listed as {row.ogrenimDiliAdi || 'non-English'} instruction.</p>
  if (!rule) {
    return (
      <div className="language-missing">
        <Info size={18} />
        <p>This is an English-medium program, but a current verified TOEFL/IELTS rule is not in the curated set yet. Check the university’s School of Foreign Languages before registration.</p>
      </div>
    )
  }
  return (
    <div className="language-rule">
      <div><span>TOEFL</span><strong>{rule.toefl}</strong></div>
      <div><span>IELTS</span><strong>{rule.ielts}</strong></div>
      <p>{rule.note}</p>
      <a href={rule.source} target="_blank" rel="noreferrer">Official requirement <ExternalLink size={13} /></a>
    </div>
  )
}

function ResultRow({ row, userRank, expanded, onToggle }) {
  const history = yearData(row)
  const status = matchStatus(userRank, row.basariSirasi)
  return (
    <article className={`result-row ${expanded ? 'expanded' : ''}`}>
      <button className="result-main" type="button" onClick={onToggle} aria-expanded={expanded}>
        <div className="rank-cell">
          <span>2025 rank</span>
          <strong>{formatRank(row.basariSirasi)}</strong>
          {status && <em className={`fit ${status.tone}`}>{status.label}</em>}
        </div>
        <div className="university-cell">
          <h3>{row.universiteAdi}</h3>
          <p>{row.birimAdi}</p>
          <div className="row-meta">
            <span><MapPin size={13} /> {row.ilAdi}</span>
            <span><Languages size={13} /> {row.ogrenimDiliAdi}</span>
            <span>{row.universiteTuru === 'DEVLET' ? 'Public' : row.universiteTuru === 'VAKIF' ? 'Foundation' : row.universiteTuru}</span>
            {row.bursOraniAdi && <span>{row.bursOraniAdi}</span>}
          </div>
        </div>
        <div className="trend-cell">
          <span>4-year rank</span>
          <TrendLine values={history.map((item) => item.rank)} />
        </div>
        <div className="score-cell">
          <span>2025 score</span>
          <strong>{formatScore(row.minPuan)}</strong>
          <small>{row.puanTuru}</small>
        </div>
        <ChevronDown className="row-chevron" size={20} />
      </button>
      {expanded && (
        <div className="result-detail">
          <section className="history-section">
            <div className="section-kicker"><TrendingDown size={16} /> Placement history</div>
            <div className="year-grid">
              {history.map((item) => (
                <div key={item.year} className={item.year === 2025 ? 'latest' : ''}>
                  <span>{item.year}</span>
                  <strong>{formatRank(item.rank)}</strong>
                  <small>{formatScore(item.score)} pts</small>
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="section-kicker"><BookOpen size={16} /> Last placed student · 2025</div>
            <NetBreakdown programCode={row.kilavuzKodu} />
          </section>
          <section>
            <div className="section-kicker"><Languages size={16} /> English preparation exemption</div>
            <LanguagePanel row={row} />
          </section>
          <div className="detail-footer">
            <span>ÖSYM code {row.kilavuzKodu} · {row.kontenjan ?? '—'} general quota</span>
            <a href={`https://yokatlas.yok.gov.tr/lisans.php?y=${row.kilavuzKodu}`} target="_blank" rel="noreferrer">Open in YÖK Atlas <ExternalLink size={14} /></a>
          </div>
        </div>
      )}
    </article>
  )
}

function LoadingRows() {
  return <div className="loading-rows">{Array.from({ length: 6 }, (_, index) => <div key={index}><i /><span /><b /></div>)}</div>
}

export default function App() {
  const [programs, setPrograms] = useState([])
  const [selected, setSelected] = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState('')
  const [userRank, setUserRank] = useState('')
  const [userScore, setUserScore] = useState('')
  const [universityType, setUniversityType] = useState('ALL')
  const [language, setLanguage] = useState('ALL')
  const [resultQuery, setResultQuery] = useState('')
  const [sort, setSort] = useState('RANK_ASC')
  const [expanded, setExpanded] = useState(null)

  const runSearch = async (program, type = universityType) => {
    if (!program) return
    setSearchLoading(true)
    setError('')
    setExpanded(null)
    try {
      const data = await searchPrograms({
        programId: program.birimGrupId,
        scoreType: program.puanTuru,
        universityType: type === 'ALL' ? null : type,
        size: 500,
      })
      setResults(data.content || [])
      setTotal(data.totalElements || 0)
    } catch (searchError) {
      setError(searchError.message)
      setResults([])
      setTotal(0)
    } finally {
      setSearchLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    getPrograms().then((data) => {
      if (!active) return
      const clean = [...data].sort((a, b) => a.birimGrupAdi.localeCompare(b.birimGrupAdi, 'tr'))
      setPrograms(clean)
      const initial = clean.find((item) => item.birimGrupAdi === 'Bilgisayar Mühendisliği') || clean[0]
      setSelected(initial)
      setCatalogLoading(false)
      runSearch(initial)
    }).catch((catalogError) => {
      if (active) { setError(catalogError.message); setCatalogLoading(false) }
    })
    return () => { active = false }
    // The initial search intentionally runs once after the catalog loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredResults = useMemo(() => {
    const needle = resultQuery.toLocaleLowerCase('tr-TR').trim()
    const filtered = results.filter((row) => {
      const languageMatch = language === 'ALL'
        || (language === 'EN' && String(row.ogrenimDiliAdi).toLocaleLowerCase('tr-TR').includes('ingiliz'))
        || (language === 'TR' && !String(row.ogrenimDiliAdi).toLocaleLowerCase('tr-TR').includes('ingiliz'))
      const textMatch = !needle || `${row.universiteAdi} ${row.birimAdi} ${row.ilAdi}`.toLocaleLowerCase('tr-TR').includes(needle)
      return languageMatch && textMatch
    })
    return filtered.sort((a, b) => sort === 'SCORE_DESC'
      ? (Number(b.minPuan) || -Infinity) - (Number(a.minPuan) || -Infinity)
      : (Number(a.basariSirasi) || Infinity) - (Number(b.basariSirasi) || Infinity)
        || (Number(b.minPuan) || -Infinity) - (Number(a.minPuan) || -Infinity))
  }, [results, language, resultQuery, sort])

  const selectProgram = (program) => {
    setSelected(program)
    runSearch(program)
  }

  const changeUniversityType = (value) => {
    setUniversityType(value)
    runSearch(selected, value)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Pusula home"><span>P</span>Pusula</a>
        <div className="source-status"><i /> Official 2025 placement data</div>
        <a className="source-link" href="https://yokatlas.yok.gov.tr/" target="_blank" rel="noreferrer">YÖK Atlas <ExternalLink size={13} /></a>
      </header>

      <main id="top">
        <section className="workspace-intro">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> 2026 preference workspace</p>
            <h1>Find the program.<br /><em>Read the trend.</em></h1>
            <p className="intro-copy">Compare every listed university using the latest completed placement cycle and three years of history.</p>
          </div>
          <div className="year-stamp" aria-label="Data years"><span>Placement years</span><strong>’22—’25</strong><small>2026 results are not placement data yet</small></div>
        </section>

        <section className="preference-bar" aria-label="Your preference filters">
          <ProgramPicker programs={programs} selected={selected} onSelect={selectProgram} loading={catalogLoading} />
          <div className="field compact-field">
            <label htmlFor="user-rank">Your ranking <span>optional</span></label>
            <div className="number-input"><span>#</span><input id="user-rank" type="number" min="1" placeholder="e.g. 12,450" value={userRank} onChange={(event) => setUserRank(event.target.value)} /></div>
          </div>
          <div className="field compact-field">
            <label htmlFor="user-score">Your score <span>optional</span></label>
            <div className="number-input"><input id="user-score" type="number" step="0.001" min="0" placeholder="e.g. 498.240" value={userScore} onChange={(event) => setUserScore(event.target.value)} /><span>pts</span></div>
          </div>
          <button className="search-button" type="button" onClick={() => runSearch(selected)} disabled={!selected || searchLoading}>
            {searchLoading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />} Explore
          </button>
        </section>

        <section className="results-workspace">
          <aside className="filters-panel">
            <div className="filters-title"><SlidersHorizontal size={17} /><span>Refine</span></div>
            <fieldset>
              <legend>University type</legend>
              {[['ALL', 'All'], ['DEVLET', 'Public'], ['VAKIF', 'Foundation']].map(([value, label]) => (
                <button type="button" key={value} className={universityType === value ? 'active' : ''} onClick={() => changeUniversityType(value)}>{label}</button>
              ))}
            </fieldset>
            <fieldset>
              <legend>Teaching language</legend>
              {[['ALL', 'All'], ['TR', 'Turkish'], ['EN', 'English']].map(([value, label]) => (
                <button type="button" key={value} className={language === value ? 'active' : ''} onClick={() => setLanguage(value)}>{label}</button>
              ))}
            </fieldset>
            <div className="candidate-note">
              <GraduationCap size={20} />
              <p><strong>Your numbers stay here.</strong> They are used only in this browser to label reach, match and safer options.</p>
            </div>
          </aside>

          <div className="results-panel">
            <div className="results-heading">
              <div>
                <p className="eyebrow">Official program records</p>
                <h2>{selected?.birimGrupAdi || 'Choose a program'}</h2>
                <span>{searchLoading ? 'Updating…' : `${formatRank(filteredResults.length)} shown${total > results.length ? ` · ${formatRank(total)} total` : ''}`}</span>
              </div>
              <div className="result-tools">
                <label className="within-search"><Search size={15} /><input value={resultQuery} onChange={(event) => setResultQuery(event.target.value)} placeholder="University or city" /></label>
                <div className="sort-switch" aria-label="Sort results">
                  <button className={sort === 'RANK_ASC' ? 'active' : ''} type="button" onClick={() => setSort('RANK_ASC')}>Rank <ArrowUp size={13} /></button>
                  <button className={sort === 'SCORE_DESC' ? 'active' : ''} type="button" onClick={() => setSort('SCORE_DESC')}>Score <ArrowDown size={13} /></button>
                </div>
              </div>
            </div>

            <div className="column-labels" aria-hidden="true"><span>Cutoff</span><span>University & program</span><span>Trend</span><span>Points</span></div>
            {error && <div className="error-state"><Info size={20} /><div><strong>Official data is unavailable</strong><p>{error} Try again in a moment.</p></div><button type="button" onClick={() => runSearch(selected)}>Retry</button></div>}
            {searchLoading ? <LoadingRows /> : filteredResults.length ? (
              <div className="results-list">
                {filteredResults.map((row) => (
                  <ResultRow key={row.kilavuzKodu} row={row} userRank={userRank} expanded={expanded === row.kilavuzKodu} onToggle={() => setExpanded(expanded === row.kilavuzKodu ? null : row.kilavuzKodu)} />
                ))}
              </div>
            ) : !error && <div className="empty-state"><Search size={24} /><h3>No programs match these filters.</h3><p>Try another language, university type or search term.</p></div>}

            {total > results.length && !searchLoading && (
              <p className="limit-note">Showing the first {formatRank(results.length)} records returned by YÖK Atlas. Narrow the university type to see the remaining records.</p>
            )}
          </div>
        </section>

        <section className="method-note">
          <div><Info size={18} /><strong>Use ranking first.</strong></div>
          <p>Scores change with exam difficulty; rankings are usually the more useful comparison. Pusula sorts by ascending cutoff rank and uses descending score as the tie-breaker.</p>
          <p>Before submitting preferences, verify quotas, program codes and special conditions in the final <a href="https://www.osym.gov.tr/" target="_blank" rel="noreferrer">ÖSYM guide</a>.</p>
        </section>
      </main>

      <footer><span>Pusula</span><p>Decision support, not an official preference submission system.</p><small>Data: YÖK Atlas · Language rules: official university pages</small></footer>
    </div>
  )
}
