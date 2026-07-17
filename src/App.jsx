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
import AdvisorChat from './AdvisorChat'
import { getCities, getNets, getPrograms, searchPrograms } from './api'
import { findLanguageRequirement } from './data/languageRequirements'

const YEARS = [2022, 2023, 2024, 2025]
const SCORE_TYPES = ['TYT', 'SAY', 'EA', 'SÖZ', 'DİL']
const emptyRanks = () => Object.fromEntries(SCORE_TYPES.map((type) => [type, '']))
const numberFormat = new Intl.NumberFormat('tr-TR')
const scoreFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 5, useGrouping: false })
const COPY = {
  en: {
    home: 'Pusula home', officialData: 'Official YÖK Atlas data',
    workspace: '2026 preference workspace', headline1: 'Find the program.', headline2: 'Read the trend.',
    intro: 'Compare every listed university using four years of official placement data.',
    guideKicker: 'AI preference advisor', guideStatus: 'Web-enabled',
    guideTitle: 'A clearer way to start',
    guideIntro: 'Share what matters to you and let Pusula order nearby options using YÖK Atlas data.',
    guideSteps: ['Describe your interests', 'Add your score-type ranking', 'Compare grounded options'],
    guideAction: 'Ask Pusula',
    placementYears: 'Placement years',
    filtersLabel: 'Your preference filters', program: 'Program', loadingCatalog: 'Loading official catalog...',
    programPlaceholder: 'Try "Bilgisayar Mühendisliği"', addProgram: 'Add another program', removeProgram: 'Remove program', clearProgram: 'Clear search', programs: 'Programs',
    noProgram: 'No matching program', yourRanking: 'Your rankings', optional: 'optional',
    chooseRanks: 'Enter rankings', rankSummaryEmpty: 'TYT, SAY, EA, SÖZ, DİL', rankTypesEntered: 'rank types entered',
    rankTypeHelp: 'Each result is compared only with your ranking for that program’s score type.', clearRanks: 'Clear rankings',
    city: 'Cities', allCities: 'All Türkiye', chooseCity: 'Choose cities', cities: 'Cities',
    explore: 'Explore', refine: 'Refine', universityType: 'University type', all: 'All',
    public: 'Public', foundation: 'Foundation', teachingLanguage: 'Teaching language',
    turkish: 'Turkish', english: 'English', privacyTitle: 'Search rankings stay in this browser.',
    privacy: 'If you ask the AI advisor, your submitted profile and messages are sent to the server and OpenAI for that reply; Pusula does not save them. Do not include unnecessary phone numbers or email addresses.',
    officialRecords: 'Official program records', chooseProgram: 'Choose a program', updating: 'Updating...', shown: 'shown', total: 'total',
    universityOrCity: 'University', rank: 'Rank', score: 'Score', cutoff: 'Cutoff',
    universityProgram: 'University, faculty & program', trend: 'Four-year trend', points: 'Points',
    unavailable: 'Official data is unavailable', retryText: 'Try again in a moment.', retry: 'Retry',
    startTitle: 'Choose at least one program.', startHelp: 'Set your preferences, then press Explore to load results.',
    noResults: 'No programs match these filters.', noResultsHelp: 'Try another city, language, university type or search term.',
    resultLimit: 'records returned by YÖK Atlas. Narrow the filters to see the remaining records.',
    useRank: 'Use ranking first.', method: 'Scores change with exam difficulty; rankings are usually the more useful comparison. Pusula sorts by ascending cutoff rank and uses descending score as the tie-breaker.',
    verify: 'Before submitting preferences, verify quotas, program codes and special conditions in the final',
    osymGuide: 'ÖSYM guide', disclaimer: 'Decision support, not an official preference submission system.',
    sources: 'Data: YÖK Atlas · Language rules: official university pages',
    safer: 'Safer', match: 'Match', reach: 'Reach', rank2025: '2025 rank', score2025: '2025 score',
    rankHistory: '4-year rank', trendLabel: 'Four-year cutoff rank trend', noHistory: 'Not enough history',
    archiveUnavailable: 'Placement data unavailable',
    placementHistory: 'Placement history', lastStudent: 'Last placed student · 2025',
    englishExemption: 'English preparation exemption', generalQuota: 'general quota',
    openAtlas: 'Open in YÖK Atlas', loadingNets: "Loading the last placed student's nets...",
    netsError: 'Net details could not be loaded right now.', noNets: 'YÖK Atlas does not publish a net breakdown for this program.',
    netsNote: "YÖK Atlas publishes net values, not the candidate's separate correct and incorrect answer counts. OBP:",
    nonEnglish: 'This program is listed with this teaching language:', languageMissing: "This program uses English, but a current verified TOEFL/IELTS rule is not in the curated set yet. Check the university's School of Foreign Languages before registration.",
    officialRequirement: 'Official requirement', pts: 'pts', osymCode: 'ÖSYM code',
  },
  tr: {
    home: 'Pusula ana sayfa', officialData: 'Resmî YÖK Atlas verileri',
    workspace: '2026 tercih rehberi', headline1: 'İstediğin bölümü bul.', headline2: 'Geçmiş yıllarla karşılaştır.',
    intro: 'Üniversite programlarını son dört yılın taban başarı sıraları ve puanlarıyla karşılaştır.',
    guideKicker: 'AI tercih danışmanı', guideStatus: 'Web destekli',
    guideTitle: 'Nereden başlayacağını bilmiyorsan',
    guideIntro: 'Senin için önemli olanları anlat; Pusula yakın seçenekleri YÖK Atlas verileriyle sıralasın.',
    guideSteps: ['İlgi alanlarını anlat', 'Puan türündeki sıralamanı ekle', 'Doğrulanmış seçenekleri karşılaştır'],
    guideAction: 'Pusula’ya sor',
    placementYears: 'Yerleştirme verileri',
    filtersLabel: 'Tercih ölçütleri', program: 'Bölüm veya program', loadingCatalog: 'Programlar yükleniyor...',
    programPlaceholder: 'Bölüm ara', addProgram: 'Başka bölüm ekle', removeProgram: 'Bölümü kaldır', clearProgram: 'Aramayı temizle', programs: 'Bölümler ve programlar',
    noProgram: 'Aramana uygun bir program bulunamadı', yourRanking: 'Başarı sıraların', optional: 'zorunlu değil',
    chooseRanks: 'Başarı sıralarını gir', rankSummaryEmpty: 'TYT, SAY, EA, SÖZ, DİL', rankTypesEntered: 'puan türü girildi',
    rankTypeHelp: 'Her program yalnızca kendi puan türündeki başarı sıranla karşılaştırılır.', clearRanks: 'Sıralamaları temizle',
    city: 'Şehirler', allCities: 'Türkiye geneli', chooseCity: 'Şehir seçimi', cities: 'Şehirler',
    explore: 'Sonuçları göster', refine: 'Sonuçları filtrele', universityType: 'Üniversite türü', all: 'Tümü',
    public: 'Devlet', foundation: 'Vakıf', teachingLanguage: 'Öğretim dili',
    turkish: 'Türkçe', english: 'İngilizce', privacyTitle: 'Aramadaki başarı sıraların bu tarayıcıda kalır.',
    privacy: 'AI danışmana soru gönderdiğinde profilin ve mesajların, yanıt üretmek için sunucuya ve OpenAI’a iletilir; Pusula bunları kaydetmez. Telefon veya e-posta gibi gereksiz kişisel bilgileri yazma.',
    officialRecords: 'Program sonuçları', chooseProgram: 'Henüz program seçilmedi', updating: 'Sonuçlar getiriliyor...', shown: 'program', total: 'toplam',
    universityOrCity: 'Üniversite ara', rank: 'Başarı sırası', score: 'Taban puan', cutoff: 'Taban sıralama',
    universityProgram: 'Üniversite, fakülte ve program', trend: '4 yıllık değişim', points: 'Taban puan',
    unavailable: 'Veriler şu anda alınamıyor', retryText: 'Lütfen biraz sonra yeniden dene.', retry: 'Tekrar dene',
    startTitle: 'Önce en az bir bölüm seç.', startHelp: 'Tercih ölçütlerini belirledikten sonra “Sonuçları göster” düğmesine bas.',
    noResults: 'Bu ölçütlere uygun program bulunamadı.', noResultsHelp: 'Şehir, öğretim dili veya üniversite türü seçimini değiştirip yeniden dene.',
    resultLimit: 'YÖK Atlas kaydı gösteriliyor. Diğer kayıtları görmek için ölçütleri daralt.',
    useRank: 'Karşılaştırırken başarı sırasını temel al.', method: 'Puanlar sınavın zorluğuna göre değişebilir. Bu nedenle yıllar arasında karşılaştırma yaparken başarı sırası genellikle daha sağlıklı bir ölçüttür.',
    verify: 'Tercih listesini kesinleştirmeden önce kontenjanı, program kodunu ve özel koşulları güncel',
    osymGuide: 'ÖSYM kılavuzundan kontrol et', disclaimer: 'Pusula bir karar destek aracıdır; resmi tercih sistemi değildir.',
    sources: 'Veriler: YÖK Atlas · Dil koşulları: üniversitelerin resmi sayfaları',
    safer: 'Daha güvenli', match: 'Uygun', reach: 'İddialı', rank2025: '2025 başarı sırası', score2025: '2025 taban puanı',
    rankHistory: 'Son 4 yıl', trendLabel: 'Son dört yılın taban başarı sırası değişimi', noHistory: 'Yeterli veri yok',
    archiveUnavailable: 'Yerleştirme verisi yok',
    placementHistory: 'Son dört yılın yerleştirme verileri', lastStudent: '2025’te son yerleşen aday',
    englishExemption: 'Hazırlık muafiyeti ve dil koşulları', generalQuota: 'genel kontenjan',
    openAtlas: "YÖK Atlas'ta görüntüle", loadingNets: 'Son yerleşen adayın netleri yükleniyor...',
    netsError: 'Net bilgileri şu anda alınamadı.', noNets: 'YÖK Atlas bu program için net bilgisi yayımlamıyor.',
    netsNote: 'YÖK Atlas doğru ve yanlış sayılarını ayrı ayrı değil, netleri yayımlar. OBP:',
    nonEnglish: 'Programın öğretim dili:', languageMissing: 'Program İngilizce eğitim veriyor ancak güncel TOEFL/IELTS koşulu doğrulanmış listemizde yer almıyor. Kayıttan önce üniversitenin yabancı diller biriminin güncel duyurusunu kontrol et.',
    officialRequirement: 'Resmi koşulları gör', pts: 'puan', osymCode: 'ÖSYM program kodu',
  },
}

function LanguageFlag({ country }) {
  if (country === 'tr') {
    return (
      <svg className="language-flag" viewBox="0 0 60 40" aria-hidden="true" focusable="false">
        <rect width="60" height="40" fill="#e30a17" />
        <circle cx="22" cy="20" r="10" fill="#fff" />
        <circle cx="26" cy="18" r="8.5" fill="#e30a17" />
        <polygon points="38,15.5 39.06,18.54 42.28,18.61 39.71,20.56 40.64,23.64 38,21.8 35.36,23.64 36.29,20.56 33.72,18.61 36.94,18.54" fill="#fff" />
      </svg>
    )
  }

  return (
    <svg className="language-flag" viewBox="0 0 60 36" aria-hidden="true" focusable="false">
      <rect width="60" height="36" fill="#012169" />
      <path d="M0 0 60 36M60 0 0 36" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 60 36M60 0 0 36" stroke="#c8102e" strokeWidth="3.5" />
      <path d="M30 0V36M0 18H60" stroke="#fff" strokeWidth="12" />
      <path d="M30 0V36M0 18H60" stroke="#c8102e" strokeWidth="7" />
    </svg>
  )
}

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

function matchStatus(userRank, cutoffRank, c) {
  if (!userRank || !cutoffRank) return null
  const ratio = Number(userRank) / Number(cutoffRank)
  if (ratio <= 0.85) return { label: c.safer, tone: 'safe' }
  if (ratio <= 1.08) return { label: c.match, tone: 'match' }
  return { label: c.reach, tone: 'reach' }
}

function TrendLine({ values, c }) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (clean.length < 2) return <span className="trend-empty">{c.noHistory}</span>
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const range = max - min || 1
  const points = values.map((raw, index) => {
    const value = Number(raw)
    const x = 4 + (index * 72) / Math.max(1, values.length - 1)
    const y = Number.isFinite(value) ? 6 + ((value - min) / range) * 22 : 28
    return `${x},${y}`
  })
  return (
    <svg className="trend-line" viewBox="0 0 80 32" role="img" aria-label={c.trendLabel}>
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={YEARS[index]} cx={cx} cy={cy} r="2.2" fill="currentColor" />
      })}
    </svg>
  )
}

function programKey(program) {
  return `${program.birimGrupId}-${program.puanTuru}`
}

function scoreTypeKey(value) {
  const normalized = String(value || '').toLocaleUpperCase('tr-TR')
  return normalized === 'DIL' ? 'DİL' : normalized
}

function ProgramPicker({ programs, selected, onToggle, loading, c }) {
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

  const matches = useMemo(() => {
    const needle = query.toLocaleLowerCase('tr-TR').trim()
    return programs
      .filter((item) => !needle || item.birimGrupAdi.toLocaleLowerCase('tr-TR').includes(needle))
      .slice(0, 24)
  }, [programs, query])
  const selectedKeys = useMemo(() => new Set(selected.map(programKey)), [selected])

  return (
    <div className="program-picker" ref={containerRef}>
      <label htmlFor="program-search">{c.program}</label>
      <div className={`picker-input multi-program-control ${open ? 'is-open' : ''}`}>
        <Search size={18} aria-hidden="true" />
        <div className="multi-program-content">
          {selected.map((program) => (
            <button
              type="button"
              className="selection-chip"
              key={programKey(program)}
              aria-label={`${c.removeProgram}: ${program.birimGrupAdi}`}
              onClick={() => onToggle(program)}
            >
              <span>{program.birimGrupAdi}</span><X size={12} />
            </button>
          ))}
          <input
            id="program-search"
            value={query}
            placeholder={loading ? c.loadingCatalog : selected.length ? c.addProgram : c.programPlaceholder}
            autoComplete="off"
            disabled={loading}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
          />
        </div>
        {query && !loading ? (
          <button type="button" className="icon-button" aria-label={c.clearProgram} onClick={() => { setQuery(''); setOpen(true) }}>
            <X size={16} />
          </button>
        ) : <ChevronDown size={17} aria-hidden="true" />}
      </div>
      {open && !loading && (
        <div className="picker-menu" role="listbox" aria-label={c.programs}>
          {matches.length ? matches.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={selectedKeys.has(programKey(item))}
              key={programKey(item)}
              onClick={() => { onToggle(item); setQuery(''); setOpen(true) }}
            >
              <span>{item.birimGrupAdi}</span>
              <small>{item.puanTuru}</small>
              {selectedKeys.has(programKey(item)) && <Check size={16} />}
            </button>
          )) : <p className="picker-empty">{c.noProgram}</p>}
        </div>
      )}
    </div>
  )
}

function RankPicker({ values, onChange, onClear, c }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const filledTypes = SCORE_TYPES.filter((type) => Number(values[type]) > 0)

  useEffect(() => {
    const close = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  return (
    <div className="rank-picker field" ref={containerRef}>
      <label>{c.yourRanking} <span>{c.optional}</span></label>
      <button
        type="button"
        className={`rank-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="rank-symbol">#</span>
        <span>{filledTypes.length ? `${filledTypes.length} ${c.rankTypesEntered}` : c.rankSummaryEmpty}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="rank-platform">
          <div className="rank-platform-head">
            <strong>{c.chooseRanks}</strong>
            {filledTypes.length > 0 && <button type="button" onClick={onClear}>{c.clearRanks}</button>}
          </div>
          <div className="rank-grid">
            {SCORE_TYPES.map((type) => (
              <label key={type}>
                <span>{type}</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="—"
                  value={values[type]}
                  onChange={(event) => onChange(type, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p>{c.rankTypeHelp}</p>
        </div>
      )}
    </div>
  )
}

function CityPicker({ cities, selected, onToggle, onClear, loading, c }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const close = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const selectedCodes = useMemo(() => new Set(selected.map((city) => city.ilKodu)), [selected])
  const summary = selected.length === 0
    ? c.allCities
    : selected.length === 1
      ? selected[0].ilAdi
      : `${selected[0].ilAdi} +${selected.length - 1}`

  return (
    <div className="city-picker field" ref={containerRef}>
      <label>{c.city}</label>
      <button
        type="button"
        className={`city-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <MapPin size={17} />
        <span>{summary}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="city-platform">
          <div className="city-platform-head">
            <div><MapPin size={17} /><strong>{c.chooseCity}</strong></div>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="city-grid" role="listbox" aria-label={c.cities}>
            <button
              type="button"
              className={!selected.length ? 'active' : ''}
              onClick={onClear}
            >
              {c.allCities}
            </button>
            {cities.map((city) => (
              <button
                type="button"
                role="option"
                aria-selected={selectedCodes.has(city.ilKodu)}
                className={selectedCodes.has(city.ilKodu) ? 'active' : ''}
                key={city.ilKodu}
                onClick={() => onToggle(city)}
              >
                {city.ilAdi}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading && <span className="city-loading"><LoaderCircle className="spin" size={13} /></span>}
    </div>
  )
}

const NET_FIELDS = [
  ['TYT', 'turkish', 'tytTrkNet'], ['TYT', 'social', 'tytSosNet'],
  ['TYT', 'mathematics', 'tytMatNet'], ['TYT', 'science', 'tytFenNet'],
  ['AYT', 'mathematics', 'aytMatNet'], ['AYT', 'physics', 'aytFizNet'],
  ['AYT', 'chemistry', 'aytKimNet'], ['AYT', 'biology', 'aytBioNet'],
  ['AYT', 'literature', 'aytTdeNet'], ['AYT', 'history1', 'aytTrh1Net'],
  ['AYT', 'geography1', 'aytCog1Net'], ['AYT', 'history2', 'aytTrh2Net'],
  ['AYT', 'geography2', 'aytCog2Net'], ['AYT', 'philosophy', 'aytFelNet'],
  ['AYT', 'religion', 'aytDinNet'], ['YDT', 'foreignLanguage', 'ydtYdilNet'],
]
const NET_LABELS = {
  en: { turkish: 'Turkish', social: 'Social sciences', mathematics: 'Mathematics', science: 'Science', physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology', literature: 'Turkish lit.', history1: 'History 1', geography1: 'Geography 1', history2: 'History 2', geography2: 'Geography 2', philosophy: 'Philosophy', religion: 'Religion', foreignLanguage: 'Foreign language' },
  tr: { turkish: 'Türkçe', social: 'Sosyal bilimler', mathematics: 'Matematik', science: 'Fen bilimleri', physics: 'Fizik', chemistry: 'Kimya', biology: 'Biyoloji', literature: 'Türk dili ve edebiyatı', history1: 'Tarih 1', geography1: 'Coğrafya 1', history2: 'Tarih 2', geography2: 'Coğrafya 2', philosophy: 'Felsefe', religion: 'Din kültürü', foreignLanguage: 'Yabancı dil' },
}

function NetBreakdown({ programCode, c, uiLanguage }) {
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

  if (state.loading) return <div className="inline-loading"><LoaderCircle className="spin" size={17} /> {c.loadingNets}</div>
  if (state.error) return <p className="muted">{c.netsError}</p>
  if (!state.row) return <p className="muted">{c.noNets}</p>

  const available = NET_FIELDS.filter(([, , field]) => state.row[field] != null)
  return (
    <div>
      <div className="net-grid">
        {available.map(([exam, label, field]) => (
          <div className="net-item" key={field}>
            <span><small>{exam}</small>{NET_LABELS[uiLanguage][label]}</span>
            <strong>{Number(state.row[field]).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</strong>
          </div>
        ))}
      </div>
      <p className="microcopy">{c.netsNote} <b>{state.row.obp ?? '—'}</b></p>
    </div>
  )
}

function LanguagePanel({ row, c, uiLanguage }) {
  const rule = findLanguageRequirement(row.universiteAdi)
  const isEnglish = String(row.ogrenimDiliAdi).toLocaleLowerCase('tr-TR').includes('ingiliz')
  if (!isEnglish) return <p className="muted">{c.nonEnglish} {row.ogrenimDiliAdi || '—'}</p>
  if (!rule) {
    return (
      <div className="language-missing">
        <Info size={18} />
        <p>{c.languageMissing}</p>
      </div>
    )
  }
  const localizedRule = uiLanguage === 'tr' ? { ...rule, ...rule.tr } : rule
  return (
    <div className="language-rule">
      <div><span>TOEFL</span><strong>{localizedRule.toefl}</strong></div>
      <div><span>IELTS</span><strong>{localizedRule.ielts}</strong></div>
      <p>{localizedRule.note}</p>
      <a href={rule.source} target="_blank" rel="noreferrer">{c.officialRequirement} <ExternalLink size={13} /></a>
    </div>
  )
}

function ResultRow({ row, userRanks, expanded, onToggle, c, uiLanguage }) {
  const history = yearData(row)
  const status = matchStatus(userRanks[scoreTypeKey(row.puanTuru)], row.basariSirasi, c)
  return (
    <article className={`result-row ${expanded ? 'expanded' : ''}`}>
      <button className="result-main" type="button" onClick={onToggle} aria-expanded={expanded}>
        <div className="rank-cell">
          <span>{c.rank2025}</span>
          <strong>{formatRank(row.basariSirasi)}</strong>
          {status && <em className={`fit ${status.tone}`}>{status.label}</em>}
        </div>
        <div className="university-cell">
          <h3>{row.universiteAdi}</h3>
          {row.fymkAdi && <p className="faculty-name">{row.fymkAdi}</p>}
          <p className="program-name">{row.birimAdi}</p>
          <div className="row-meta">
            <span><MapPin size={13} /> {row.ilAdi}</span>
            <span><Languages size={13} /> {row.ogrenimDiliAdi}</span>
            <span>{row.universiteTuru === 'DEVLET' ? c.public : row.universiteTuru === 'VAKIF' ? c.foundation : row.universiteTuru}</span>
            {row.bursOraniAdi && <span>{row.bursOraniAdi}</span>}
          </div>
        </div>
        <div className="trend-cell">
          <span>{c.rankHistory}</span>
          <TrendLine values={history.map((item) => item.rank)} c={c} />
        </div>
        <div className="score-cell">
          <span>{c.score2025}</span>
          <strong>{formatScore(row.minPuan)}</strong>
          <small>{row.puanTuru}</small>
        </div>
        <ChevronDown className="row-chevron" size={20} />
      </button>
      {expanded && (
        <div className="result-detail">
          <section className="history-section">
            <div className="section-kicker"><TrendingDown size={16} /> {c.placementHistory}</div>
            <div className="year-grid">
              {history.map((item) => (
                <div key={item.year} className={item.year === 2025 ? 'latest' : ''}>
                  <span>{item.year}</span>
                  <strong>{formatRank(item.rank)}</strong>
                  {item.rank == null && item.score == null
                    ? <small className="archive-unavailable">{c.archiveUnavailable}</small>
                    : <small>{formatScore(item.score)} {c.pts}</small>}
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="section-kicker"><BookOpen size={16} /> {c.lastStudent}</div>
            <NetBreakdown programCode={row.kilavuzKodu} c={c} uiLanguage={uiLanguage} />
          </section>
          <section>
            <div className="section-kicker"><Languages size={16} /> {c.englishExemption}</div>
            <LanguagePanel row={row} c={c} uiLanguage={uiLanguage} />
          </section>
          <div className="detail-footer">
            <span>{c.osymCode} {row.kilavuzKodu} · {row.kontenjan ?? '—'} {c.generalQuota}</span>
            <a href={`https://yokatlas.yok.gov.tr/lisans.php?y=${row.kilavuzKodu}`} target="_blank" rel="noreferrer">{c.openAtlas} <ExternalLink size={14} /></a>
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
  const [cities, setCities] = useState([])
  const [selectedPrograms, setSelectedPrograms] = useState([])
  const [selectedCities, setSelectedCities] = useState([])
  const [appliedPrograms, setAppliedPrograms] = useState([])
  const [appliedTeachingLanguage, setAppliedTeachingLanguage] = useState('ALL')
  const [hasSearched, setHasSearched] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState('')
  const [userRanks, setUserRanks] = useState(emptyRanks)
  const [appliedRanks, setAppliedRanks] = useState(emptyRanks)
  const [universityType, setUniversityType] = useState('ALL')
  const [teachingLanguage, setTeachingLanguage] = useState('ALL')
  const [uiLanguage, setUiLanguage] = useState(() => localStorage.getItem('pusula-ui-language-v2') || 'tr')
  const [resultQuery, setResultQuery] = useState('')
  const [sort, setSort] = useState('RANK_ASC')
  const [expanded, setExpanded] = useState(null)
  const [advisorOpenSignal, setAdvisorOpenSignal] = useState(0)
  const searchRequestRef = useRef(0)
  const c = COPY[uiLanguage] || COPY.en

  const runSearch = async (programList, type, cityList) => {
    const requestId = ++searchRequestRef.current
    if (!programList.length) {
      setResults([])
      setTotal(0)
      setExpanded(null)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    setError('')
    setExpanded(null)
    try {
      const responses = await Promise.all(programList.map((program) => searchPrograms({
        programId: program.birimGrupId,
        scoreType: program.puanTuru,
        universityType: type === 'ALL' ? null : type,
        cityCodes: cityList.map((city) => city.ilKodu),
        size: 500,
      })))
      if (requestId !== searchRequestRef.current) return
      const merged = new Map()
      responses.forEach((data) => {
        const rows = data.content || []
        rows.forEach((row) => merged.set(String(row.kilavuzKodu), row))
      })
      setResults([...merged.values()])
      setTotal(responses.reduce((sum, data) => sum + (Number(data.totalElements) || 0), 0))
    } catch (searchError) {
      if (requestId !== searchRequestRef.current) return
      setError(searchError.message)
      setResults([])
      setTotal(0)
    } finally {
      if (requestId === searchRequestRef.current) setSearchLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([getPrograms(), getCities()]).then(([programData, cityData]) => {
      if (!active) return
      const clean = [...programData].sort((a, b) => a.birimGrupAdi.localeCompare(b.birimGrupAdi, 'tr'))
      const cleanCities = cityData
        .map((city) => ({
          ilKodu: Number(city.ilKodu ?? city.uniIlKodu ?? city.kod),
          ilAdi: city.ilAdi ?? city.uniIlAdi ?? city.ad,
        }))
        .filter((city) => Number.isFinite(city.ilKodu) && city.ilAdi)
        .sort((a, b) => a.ilAdi.localeCompare(b.ilAdi, 'tr'))
      setPrograms(clean)
      setCities(cleanCities)
      setCatalogLoading(false)
      setCitiesLoading(false)
    }).catch((catalogError) => {
      if (active) {
        setError(catalogError.message)
        setCatalogLoading(false)
        setCitiesLoading(false)
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    document.documentElement.lang = uiLanguage
    localStorage.setItem('pusula-ui-language-v2', uiLanguage)
  }, [uiLanguage])

  const filteredResults = useMemo(() => {
    const needle = resultQuery.toLocaleLowerCase('tr-TR').trim()
    const filtered = results.filter((row) => {
      const languageMatch = appliedTeachingLanguage === 'ALL'
        || (appliedTeachingLanguage === 'EN' && String(row.ogrenimDiliAdi).toLocaleLowerCase('tr-TR').includes('ingiliz'))
        || (appliedTeachingLanguage === 'TR' && !String(row.ogrenimDiliAdi).toLocaleLowerCase('tr-TR').includes('ingiliz'))
      const textMatch = !needle || `${row.universiteAdi} ${row.fymkAdi || ''}`.toLocaleLowerCase('tr-TR').includes(needle)
      return languageMatch && textMatch
    })
    return filtered.sort((a, b) => sort === 'SCORE_DESC'
      ? (Number(b.minPuan) || -Infinity) - (Number(a.minPuan) || -Infinity)
      : (Number(a.basariSirasi) || Infinity) - (Number(b.basariSirasi) || Infinity)
        || (Number(b.minPuan) || -Infinity) - (Number(a.minPuan) || -Infinity))
  }, [results, appliedTeachingLanguage, resultQuery, sort])

  const toggleProgram = (program) => {
    const key = programKey(program)
    const next = selectedPrograms.some((item) => programKey(item) === key)
      ? selectedPrograms.filter((item) => programKey(item) !== key)
      : [...selectedPrograms, program]
    setSelectedPrograms(next)
  }

  const changeUniversityType = (value) => {
    setUniversityType(value)
  }

  const toggleCity = (city) => {
    const next = selectedCities.some((item) => item.ilKodu === city.ilKodu)
      ? selectedCities.filter((item) => item.ilKodu !== city.ilKodu)
      : [...selectedCities, city]
    setSelectedCities(next)
  }

  const clearCities = () => {
    setSelectedCities([])
  }

  const explore = () => {
    setAppliedPrograms(selectedPrograms)
    setAppliedTeachingLanguage(teachingLanguage)
    setAppliedRanks({ ...userRanks })
    setHasSearched(true)
    runSearch(selectedPrograms, universityType, selectedCities)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={c.home}>
          <span className="brand-mark" aria-hidden="true"><img src="/favicon.png?v=2" alt="" /></span>
          Pusula
        </a>
        <div className="ui-language" aria-label="Interface language">
          <button type="button" className={uiLanguage === 'tr' ? 'active' : ''} aria-label="Türkçe" onClick={() => setUiLanguage('tr')}>
            <LanguageFlag country="tr" /><small>TR</small>
          </button>
          <button type="button" className={uiLanguage === 'en' ? 'active' : ''} aria-label="English" onClick={() => setUiLanguage('en')}>
            <LanguageFlag country="gb" /><small>EN</small>
          </button>
        </div>
        <div className="source-status"><i /> {c.officialData}</div>
        <a className="source-link" href="https://yokatlas.yok.gov.tr/" target="_blank" rel="noreferrer">YÖK Atlas <ExternalLink size={13} /></a>
      </header>

      <main id="top">
        <section className="workspace-intro">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> {c.workspace}</p>
            <h1>{c.headline1}<br /><em>{c.headline2}</em></h1>
            <p className="intro-copy">{c.intro}</p>
          </div>
          <aside className="hero-guide">
            <div className="hero-guide-meta">
              <span><i /> {c.guideKicker}</span>
              <small>GPT-5.6 LUNA · {c.guideStatus}</small>
            </div>
            <strong>{c.guideTitle}</strong>
            <p className="hero-guide-copy">{c.guideIntro}</p>
            <ol>
              {c.guideSteps.map((step, index) => (
                <li key={step}><b>0{index + 1}</b><span>{step}</span></li>
              ))}
            </ol>
            <button type="button" onClick={() => setAdvisorOpenSignal((value) => value + 1)}>
              <Sparkles size={14} />
              {c.guideAction}
            </button>
          </aside>
        </section>

        <section className="preference-bar" aria-label={c.filtersLabel}>
          <ProgramPicker programs={programs} selected={selectedPrograms} onToggle={toggleProgram} loading={catalogLoading} c={c} />
          <RankPicker
            values={userRanks}
            onChange={(type, value) => setUserRanks((current) => ({ ...current, [type]: value }))}
            onClear={() => setUserRanks(emptyRanks())}
            c={c}
          />
          <CityPicker cities={cities} selected={selectedCities} onToggle={toggleCity} onClear={clearCities} loading={citiesLoading} c={c} />
          <button className="search-button" type="button" onClick={explore} disabled={!selectedPrograms.length || searchLoading}>
            {searchLoading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />} {c.explore}
          </button>
        </section>

        <section className="results-workspace">
          <aside className="filters-panel">
            <div className="filters-title"><SlidersHorizontal size={17} /><span>{c.refine}</span></div>
            <fieldset>
              <legend>{c.universityType}</legend>
              {[['ALL', c.all], ['DEVLET', c.public], ['VAKIF', c.foundation]].map(([value, label]) => (
                <button type="button" key={value} className={universityType === value ? 'active' : ''} onClick={() => changeUniversityType(value)}>{label}</button>
              ))}
            </fieldset>
            <fieldset>
              <legend>{c.teachingLanguage}</legend>
              {[['ALL', c.all], ['TR', c.turkish], ['EN', c.english]].map(([value, label]) => (
                <button type="button" key={value} className={teachingLanguage === value ? 'active' : ''} onClick={() => setTeachingLanguage(value)}>{label}</button>
              ))}
            </fieldset>
            <div className="candidate-note">
              <GraduationCap size={20} />
              <p><strong>{c.privacyTitle} {c.privacy}</strong></p>
            </div>
          </aside>

          <div className="results-panel">
            <div className="results-heading">
              <div>
                <p className="eyebrow">{c.officialRecords}</p>
                <h2>{appliedPrograms.length ? appliedPrograms.map((program) => program.birimGrupAdi).join(' · ') : c.chooseProgram}</h2>
                <span>{searchLoading ? c.updating : `${formatRank(filteredResults.length)} ${c.shown}${total > results.length ? ` · ${formatRank(total)} ${c.total}` : ''}`}</span>
              </div>
              <div className="result-tools">
                <label className="within-search"><Search size={15} /><input value={resultQuery} onChange={(event) => setResultQuery(event.target.value)} placeholder={c.universityOrCity} /></label>
                <div className="sort-switch" aria-label={`${c.rank} / ${c.score}`}>
                  <button className={sort === 'RANK_ASC' ? 'active' : ''} type="button" onClick={() => setSort('RANK_ASC')}>{c.rank} <ArrowUp size={13} /></button>
                  <button className={sort === 'SCORE_DESC' ? 'active' : ''} type="button" onClick={() => setSort('SCORE_DESC')}>{c.score} <ArrowDown size={13} /></button>
                </div>
              </div>
            </div>

            <div className="column-labels" aria-hidden="true"><span>{c.cutoff}</span><span>{c.universityProgram}</span><span>{c.trend}</span><span>{c.points}</span></div>
            {error && <div className="error-state"><Info size={20} /><div><strong>{c.unavailable}</strong><p>{error} {c.retryText}</p></div><button type="button" onClick={explore}>{c.retry}</button></div>}
            {searchLoading ? <LoadingRows /> : filteredResults.length ? (
              <div className="results-list">
                {filteredResults.map((row) => (
                  <ResultRow key={row.kilavuzKodu} row={row} userRanks={appliedRanks} expanded={expanded === row.kilavuzKodu} onToggle={() => setExpanded(expanded === row.kilavuzKodu ? null : row.kilavuzKodu)} c={c} uiLanguage={uiLanguage} />
                ))}
              </div>
            ) : !error && (
              <div className="empty-state">
                <Search size={24} />
                <h3>{hasSearched ? c.noResults : c.startTitle}</h3>
                <p>{hasSearched ? c.noResultsHelp : c.startHelp}</p>
              </div>
            )}

            {total > results.length && !searchLoading && (
              <p className="limit-note">
                {uiLanguage === 'tr' ? `İlk ${formatRank(results.length)} ${c.resultLimit}` : `Showing the first ${formatRank(results.length)} ${c.resultLimit}`}
              </p>
            )}
          </div>
        </section>

        <section className="method-note">
          <div><Info size={18} /><strong>{c.useRank}</strong></div>
          <p>{c.method}</p>
          <p>{c.verify} <a href="https://www.osym.gov.tr/" target="_blank" rel="noreferrer">{c.osymGuide}</a>.</p>
        </section>
      </main>

      <AdvisorChat
        uiLanguage={uiLanguage}
        openSignal={advisorOpenSignal}
        currentFilters={{
          ranks: userRanks,
          cities: selectedCities,
          programs: selectedPrograms,
          language: teachingLanguage,
          universityType,
        }}
      />

      <footer><span>Pusula</span><p>{c.disclaimer}</p><small>{c.sources}</small></footer>
    </div>
  )
}
