import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { askAdvisor } from './api'

const SCORE_TYPES = ['TYT', 'SAY', 'EA', 'SÖZ', 'DİL']
const emptyRanks = () => Object.fromEntries(SCORE_TYPES.map((type) => [type, '']))
const rankFormat = new Intl.NumberFormat('tr-TR')

const ADVISOR_COPY = {
  tr: {
    launcher: 'Tercih danışmanı',
    title: 'Pusula Danışman',
    subtitle: 'İlgi alanlarını ve sıralamanı birlikte değerlendirelim.',
    close: 'Danışmanı kapat',
    profile: 'Aday profili',
    profileHelp: 'Ne kadar çok bilgi verirsen öneriler o kadar anlamlı olur.',
    privacy: 'Profilin ve mesajların yanıt için OpenAI’a iletilir; Pusula bunları kaydetmez. Telefon veya e-posta gibi gereksiz kişisel bilgileri yazma.',
    interests: 'İlgi alanların',
    interestsPlaceholder: 'Örn. kod yazmak, matematik, insanlara yardım etmek, tasarım...',
    rankings: 'Başarı sıraların',
    cities: 'Tercih ettiğin şehirler',
    citiesPlaceholder: 'Örn. İstanbul, Ankara, İzmir',
    language: 'Öğretim dili',
    universityType: 'Üniversite türü',
    all: 'Fark etmez',
    turkish: 'Türkçe',
    english: 'İngilizce',
    public: 'Devlet',
    foundation: 'Vakıf',
    useFilters: 'Sayfadaki seçimleri kullan',
    findOptions: 'Bana seçenek bul',
    welcome: 'Merhaba! Bugün sana nasıl yardımcı olabilirim? Bölüm seçimi, başarı sıralaman, şehirler veya üniversiteler hakkında aklına geleni sorabilirsin.',
    placeholder: 'Örn. 50 bin SAY ile Ankara’da hangi seçeneklere bakmalıyım?',
    send: 'Gönder',
    needProfile: 'En azından ilgi alanlarını yaz veya sayfadan bir bölüm seç.',
    error: 'Şu anda yanıt veremedim. Biraz sonra yeniden deneyebilirsin.',
    thinking: 'Pusula düşünüyor ve güncel kaynakları kontrol ediyor...',
    quickSafer: 'Daha güvenli seçeneklerim neler?',
    quickCompare: 'Bu bölümleri karşılaştır',
    quickCity: 'Şehir tercihim neyi değiştirir?',
    official: '2025 taban verisi',
    safe: 'Daha güvenli',
    match: 'Uygun',
    reach: 'İddialı',
    neutral: 'İncele',
    scoreType: 'puan türü',
    openAtlas: "YÖK Atlas'ta aç",
    aiMode: 'GPT-5.6 Luna · YÖK Atlas verisi',
    sources: 'İnternetten kontrol edilen kaynaklar',
    disclaimer: 'Kesin tercih yapmadan önce güncel ÖSYM kılavuzunu ve özel koşulları kontrol et.',
    reset: 'Konuşmayı sıfırla',
    profileQuestion: 'Bu aday profiline göre bana uygun üniversite programlarını açıkla.',
  },
  en: {
    launcher: 'University advisor',
    title: 'Pusula Advisor',
    subtitle: 'Let’s evaluate your interests and rankings together.',
    close: 'Close advisor',
    profile: 'Candidate profile',
    profileHelp: 'More context makes the recommendations more meaningful.',
    privacy: 'Your profile and messages are sent to OpenAI for the reply; Pusula does not save them. Do not include unnecessary phone numbers or email addresses.',
    interests: 'Your interests',
    interestsPlaceholder: 'e.g. coding, mathematics, helping people, design...',
    rankings: 'Your rankings',
    cities: 'Preferred cities',
    citiesPlaceholder: 'e.g. Istanbul, Ankara, Izmir',
    language: 'Teaching language',
    universityType: 'University type',
    all: 'No preference',
    turkish: 'Turkish',
    english: 'English',
    public: 'Public',
    foundation: 'Foundation',
    useFilters: 'Use page selections',
    findOptions: 'Find options for me',
    welcome: 'Hi! How can I help today? Ask about programs, your ranking, cities, or universities and we can work through the choice together.',
    placeholder: 'e.g. What should I consider with a 50k SAY ranking in Ankara?',
    send: 'Send',
    needProfile: 'Add at least one interest or select a program on the page.',
    error: 'I could not answer right now. Please try again in a moment.',
    thinking: 'Pusula is thinking and checking current sources...',
    quickSafer: 'What are my safer options?',
    quickCompare: 'Compare these programs',
    quickCity: 'How does my city choice matter?',
    official: '2025 cutoff data',
    safe: 'Safer',
    match: 'Match',
    reach: 'Reach',
    neutral: 'Review',
    scoreType: 'score type',
    openAtlas: 'Open in YÖK Atlas',
    aiMode: 'GPT-5.6 Luna · YÖK Atlas data',
    sources: 'Sources checked on the web',
    disclaimer: 'Verify the current ÖSYM guide and special conditions before submitting preferences.',
    reset: 'Reset conversation',
    profileQuestion: 'Explain suitable university programs for this candidate profile.',
  },
}

function normalizeRankState(ranks) {
  const next = emptyRanks()
  SCORE_TYPES.forEach((type) => {
    next[type] = Number(ranks?.[type]) > 0 ? String(ranks[type]) : ''
  })
  return next
}

function createProfile(currentFilters) {
  return {
    interests: '',
    ranks: normalizeRankState(currentFilters.ranks),
    cities: currentFilters.cities.map((city) => city.ilAdi).join(', '),
    language: currentFilters.language || 'ALL',
    universityType: currentFilters.universityType || 'ALL',
  }
}

function RecommendationCard({ item, c }) {
  const fitLabel = c[item.fit] || c.neutral
  return (
    <a
      className={`advisor-recommendation ${item.fit}`}
      href={`https://yokatlas.yok.gov.tr/lisans.php?y=${item.code}`}
      target="_blank"
      rel="noreferrer"
    >
      <div>
        <span>{fitLabel} · {item.scoreType}</span>
        <strong>{item.university}</strong>
        <p>{item.program}</p>
      </div>
      <div className="advisor-recommendation-meta">
        <span>{item.city}</span>
        <b>{item.rank ? `#${rankFormat.format(item.rank)}` : '—'}</b>
        <ExternalLink size={13} aria-label={c.openAtlas} />
      </div>
    </a>
  )
}

function MarkdownMessage({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer">{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default function AdvisorChat({ uiLanguage, currentFilters, openSignal = 0 }) {
  const c = ADVISOR_COPY[uiLanguage] || ADVISOR_COPY.tr
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(true)
  const [profile, setProfile] = useState(() => createProfile(currentFilters))
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const messagesRef = useRef(null)
  const textareaRef = useRef(null)

  const selectedProgramNames = useMemo(
    () => currentFilters.programs.map((program) => program.birimGrupAdi),
    [currentFilters.programs],
  )

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (openSignal > 0) setOpen(true)
  }, [openSignal])

  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, loading, open])

  const syncPageFilters = () => {
    setProfile((current) => ({
      ...current,
      ranks: normalizeRankState(currentFilters.ranks),
      cities: currentFilters.cities.map((city) => city.ilAdi).join(', '),
      language: currentFilters.language || 'ALL',
      universityType: currentFilters.universityType || 'ALL',
    }))
    setProfileError('')
  }

  const resetConversation = () => {
    setMessages([])
    setMessage('')
    setProfileOpen(true)
    setProfileError('')
  }

  const sendMessage = async (text = message, intent = 'chat') => {
    const content = String(text || '').trim()
    if (!content || loading) return

    setProfileError('')
    setMessage('')
    setProfileOpen(false)
    setLoading(true)
    const userMessage = { role: 'user', content }
    const history = messages.map(({ role, content: previousContent }) => ({
      role,
      content: previousContent,
    }))
    const previousRecommendationCodes = [...new Set(
      messages.flatMap((item) =>
        (item.recommendations || []).map((recommendation) => String(recommendation.code))),
    )].slice(-25)
    setMessages((current) => [...current, userMessage])

    try {
      const currentCityText = currentFilters.cities.map((city) => city.ilAdi).join(', ')
      const data = await askAdvisor({
        message: content,
        intent,
        language: uiLanguage,
        history,
        previousRecommendationCodes,
        profile: {
          ...profile,
          cityCodes: profile.cities.trim() === currentCityText
            ? currentFilters.cities.map((city) => city.ilKodu)
            : [],
          selectedPrograms: currentFilters.programs,
        },
      })
      setMessages((current) => [...current, {
        role: 'assistant',
        content: data.answer,
        recommendations: data.recommendations || [],
        sources: data.sources || [],
        provider: data.provider,
        model: data.model,
      }])
      setProfileOpen(false)
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'assistant',
        content: error.message || c.error,
        recommendations: [],
        provider: 'local',
        error: true,
      }])
    } finally {
      setLoading(false)
      window.setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const submitProfile = () => {
    if (!profile.interests.trim() && !currentFilters.programs.length) {
      setProfileOpen(true)
      setProfileError(c.needProfile)
      return
    }
    sendMessage(c.profileQuestion, 'recommend')
  }

  const quickPrompts = [
    { label: c.quickSafer, intent: 'safer' },
    { label: c.quickCompare, intent: 'compare' },
    { label: c.quickCity, intent: 'city' },
  ]

  return (
    <div className={`advisor-shell ${open ? 'is-open' : ''}`}>
      {!open && (
        <button className="advisor-launcher" type="button" onClick={() => setOpen(true)}>
          <span><Sparkles size={16} /></span>
          <strong>{c.launcher}</strong>
          <MessageCircle size={18} />
        </button>
      )}

      {open && (
        <section className="advisor-panel" role="dialog" aria-label={c.title}>
          <header className="advisor-header">
            <div className="advisor-identity">
              <span><img src="/favicon.png?v=2" alt="" /></span>
              <div><strong>{c.title}</strong><small>{c.subtitle}</small></div>
            </div>
            <div className="advisor-header-actions">
              <button type="button" aria-label={c.reset} title={c.reset} onClick={resetConversation}><RefreshCw size={15} /></button>
              <button type="button" aria-label={c.close} onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
          </header>

          <div className="advisor-context-bar">
            <button type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <Settings2 size={15} />
              <span>{c.profile}</span>
              {selectedProgramNames.length > 0 && <small>{selectedProgramNames.slice(0, 2).join(' · ')}</small>}
              <ChevronDown size={15} />
            </button>
          </div>

          {profileOpen && (
            <div className="advisor-profile">
              <div className="advisor-profile-heading">
                <div><GraduationCap size={18} /><strong>{c.profile}</strong></div>
                <p>{c.profileHelp}</p>
                <small>{c.privacy}</small>
              </div>

              <label className="advisor-interest-field">
                <span>{c.interests}</span>
                <textarea
                  value={profile.interests}
                  placeholder={c.interestsPlaceholder}
                  rows="2"
                  onChange={(event) => setProfile((current) => ({ ...current, interests: event.target.value }))}
                />
              </label>

              <fieldset className="advisor-ranks">
                <legend>{c.rankings}</legend>
                <div>
                  {SCORE_TYPES.map((type) => (
                    <label key={type}>
                      <span>{type}</span>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        placeholder="—"
                        value={profile.ranks[type]}
                        onChange={(event) => setProfile((current) => ({
                          ...current,
                          ranks: { ...current.ranks, [type]: event.target.value },
                        }))}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="advisor-city-field">
                <span>{c.cities}</span>
                <input
                  value={profile.cities}
                  placeholder={c.citiesPlaceholder}
                  onChange={(event) => setProfile((current) => ({ ...current, cities: event.target.value }))}
                />
              </label>

              <div className="advisor-selects">
                <label>
                  <span>{c.language}</span>
                  <select value={profile.language} onChange={(event) => setProfile((current) => ({ ...current, language: event.target.value }))}>
                    <option value="ALL">{c.all}</option>
                    <option value="TR">{c.turkish}</option>
                    <option value="EN">{c.english}</option>
                  </select>
                </label>
                <label>
                  <span>{c.universityType}</span>
                  <select value={profile.universityType} onChange={(event) => setProfile((current) => ({ ...current, universityType: event.target.value }))}>
                    <option value="ALL">{c.all}</option>
                    <option value="DEVLET">{c.public}</option>
                    <option value="VAKIF">{c.foundation}</option>
                  </select>
                </label>
              </div>

              {profileError && <p className="advisor-profile-error">{profileError}</p>}
              <div className="advisor-profile-actions">
                <button type="button" className="advisor-sync" onClick={syncPageFilters}><RefreshCw size={13} /> {c.useFilters}</button>
                <button type="button" className="advisor-start" onClick={submitProfile} disabled={loading}><Sparkles size={14} /> {c.findOptions}</button>
              </div>
            </div>
          )}

          <div className="advisor-messages" ref={messagesRef} aria-live="polite">
            <div className="advisor-message assistant">
              <span className="advisor-avatar"><Bot size={15} /></span>
              <div className="advisor-bubble"><p>{c.welcome}</p></div>
            </div>

            {messages.map((item, index) => (
              <div className={`advisor-message ${item.role}`} key={`${item.role}-${index}`}>
                {item.role === 'assistant' && <span className="advisor-avatar"><Bot size={15} /></span>}
                <div className="advisor-message-content">
                  <div className={`advisor-bubble ${item.error ? 'error' : ''}`}>
                    {item.role === 'assistant'
                      ? <MarkdownMessage content={item.content} />
                      : <p>{item.content}</p>}
                  </div>
                  {item.recommendations?.length > 0 && (
                    <div className="advisor-recommendations">
                      {item.recommendations
                        .slice(0, 5)
                        .map((recommendation) => (
                          <RecommendationCard item={recommendation} c={c} key={recommendation.code} />
                        ))}
                    </div>
                  )}
                  {item.sources?.length > 0 && (
                    <div className="advisor-sources">
                      <span>{c.sources}</span>
                      <div>
                        {item.sources.map((source) => (
                          <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                            {source.title}
                            <ExternalLink size={10} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.role === 'assistant' && item.provider && !item.error && (
                    <small className="advisor-provider">{item.provider === 'openai' ? c.aiMode : item.model}</small>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="advisor-message assistant">
                <span className="advisor-avatar"><Bot size={15} /></span>
                <div className="advisor-bubble advisor-thinking"><LoaderCircle className="spin" size={15} /><p>{c.thinking}</p></div>
              </div>
            )}
          </div>

          <div className="advisor-quick-prompts">
            {quickPrompts.map((prompt) => (
              <button
                type="button"
                key={prompt.intent}
                onClick={() => sendMessage(prompt.label, prompt.intent)}
                disabled={loading}
              >
                {prompt.label}
              </button>
            ))}
          </div>

          <form className="advisor-composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}>
            <textarea
              ref={textareaRef}
              value={message}
              rows="1"
              maxLength="1200"
              placeholder={c.placeholder}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage()
                }
              }}
            />
            <button type="submit" aria-label={c.send} disabled={!message.trim() || loading}><Send size={17} /></button>
          </form>

          <div className="advisor-footer">
            <span><i /> {c.official}</span>
            <p>{c.disclaimer}</p>
          </div>
        </section>
      )}
    </div>
  )
}
