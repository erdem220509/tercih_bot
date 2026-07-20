import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Check,
  GraduationCap,
  LoaderCircle,
  MessageSquareText,
  Sparkles,
  Star,
  Trees,
  Users,
} from 'lucide-react'
import { getUniversityReviews, submitUniversityReview } from './api'

const REVIEW_FIELDS = [
  ['dorms', Building2],
  ['professors', GraduationCap],
  ['campus', Trees],
  ['socialLife', Users],
]

const REVIEW_COPY = {
  tr: {
    title: 'Öğrenci değerlendirmeleri',
    subtitle: 'Anonim öğrenci deneyimleri · resmî veri değildir',
    count: 'değerlendirme',
    empty: 'Bu üniversite için henüz öğrenci değerlendirmesi yok.',
    write: 'Deneyimini paylaş',
    cancel: 'Vazgeç',
    dorms: 'Yurtlar',
    professors: 'Akademisyenler',
    campus: 'Kampüs',
    socialLife: 'Sosyal yaşam',
    comment: 'Kısa yorumun',
    commentPlaceholder: 'Gelecek öğrencilere yardımcı olacak, kişisel bilgi içermeyen kısa bir not...',
    optional: 'isteğe bağlı',
    submit: 'Anonim gönder',
    submitting: 'Gönderiliyor...',
    incomplete: 'Lütfen dört başlığın tümüne puan ver.',
    submitted: 'Değerlendirmen alındı.',
    ratingsSaved: 'Puanların anonim özete eklendi.',
    moderation: 'Puanların özete eklendi. Yazılı yorumun yayımlanmadan önce kontrol edilecek.',
    duplicate: 'Bu tarayıcıdan bu üniversite için daha önce değerlendirme gönderilmiş.',
    unavailable: 'Değerlendirmeler şu anda yüklenemiyor.',
    privacy: 'Ad, e-posta veya telefon numarası yazma. Gönderimler anonimdir.',
    latest: 'Öğrencilerden son notlar',
  },
  en: {
    title: 'Student reviews',
    subtitle: 'Anonymous student experiences · not official data',
    count: 'reviews',
    empty: 'There are no student reviews for this university yet.',
    write: 'Share your experience',
    cancel: 'Cancel',
    dorms: 'Dorms',
    professors: 'Professors',
    campus: 'Campus',
    socialLife: 'Social life',
    comment: 'Short review',
    commentPlaceholder: 'A short, useful note for future students without personal information...',
    optional: 'optional',
    submit: 'Submit anonymously',
    submitting: 'Submitting...',
    incomplete: 'Please rate all four categories.',
    submitted: 'Your review was received.',
    ratingsSaved: 'Your ratings were added to the anonymous summary.',
    moderation: 'Your ratings were added to the summary. Written comments are checked before publication.',
    duplicate: 'A review for this university was already submitted from this browser.',
    unavailable: 'Reviews are unavailable right now.',
    privacy: 'Do not include names, email addresses, or phone numbers. Submissions are anonymous.',
    latest: 'Recent student notes',
  },
}

function getReviewClientId() {
  const storageKey = 'pusula-review-client-v1'
  let value = localStorage.getItem(storageKey)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(storageKey, value)
  }
  return value
}

function RatingInput({ value, label, icon: Icon, onChange }) {
  return (
    <div className="review-rating-input">
      <span><Icon size={15} /> {label}</span>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${label}: ${rating}/5`}
            className={rating <= value ? 'active' : ''}
            key={rating}
            onClick={() => onChange(rating)}
          >
            <Star size={17} fill={rating <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  )
}

export default function StudentReviews({ university, programCode, uiLanguage }) {
  const c = REVIEW_COPY[uiLanguage] || REVIEW_COPY.tr
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [ratings, setRatings] = useState({
    dorms: 0,
    professors: 0,
    campus: 0,
    socialLife: 0,
  })
  const [comment, setComment] = useState('')
  const [submitState, setSubmitState] = useState({
    loading: false,
    error: '',
    complete: false,
    moderationRequired: false,
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    getUniversityReviews(university)
      .then((response) => {
        if (active) setData(response)
      })
      .catch(() => {
        if (active) setData({ unavailable: true, count: 0, averages: {}, reviews: [] })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [university])

  const complete = useMemo(
    () => REVIEW_FIELDS.every(([field]) => ratings[field] > 0),
    [ratings],
  )

  const submit = async (event) => {
    event.preventDefault()
    if (!complete || submitState.loading) {
      setSubmitState({
        loading: false,
        error: c.incomplete,
        complete: false,
        moderationRequired: false,
      })
      return
    }

    setSubmitState({ loading: true, error: '', complete: false, moderationRequired: false })
    try {
      const response = await submitUniversityReview({
        university,
        programCode,
        ratings,
        comment: comment.trim(),
        clientId: getReviewClientId(),
      })
      setData(response.summary)
      setSubmitState({
        loading: false,
        error: '',
        complete: true,
        moderationRequired: response.moderationRequired,
      })
      setFormOpen(false)
    } catch (error) {
      const duplicate = /already|daha önce/i.test(error.message)
      setSubmitState({
        loading: false,
        error: duplicate ? c.duplicate : error.message,
        complete: false,
        moderationRequired: false,
      })
    }
  }

  if (loading) {
    return <div className="review-loading"><LoaderCircle className="spin" size={17} /> {c.title}</div>
  }

  return (
    <div className="student-reviews">
      <div className="review-heading">
        <div>
          <span><MessageSquareText size={16} /> {c.title}</span>
          <small>{c.subtitle}</small>
        </div>
        {!data?.unavailable && !submitState.complete && (
          <button type="button" onClick={() => setFormOpen((value) => !value)}>
            {formOpen ? c.cancel : c.write}
          </button>
        )}
      </div>

      {data?.unavailable ? (
        <p className="review-empty">{c.unavailable}</p>
      ) : data?.count > 0 ? (
        <div className="review-summary">
          <div className="review-overall">
            <strong>{Number(data.overall || 0).toFixed(1)}</strong>
            <span><Star size={15} fill="currentColor" /> {data.count} {c.count}</span>
          </div>
          <div className="review-averages">
            {REVIEW_FIELDS.map(([field, Icon]) => (
              <div key={field}>
                <span><Icon size={14} /> {c[field]}</span>
                <strong>{Number(data.averages?.[field] || 0).toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="review-empty">{c.empty}</p>
      )}

      {data?.reviews?.length > 0 && (
        <div className="review-notes">
          <strong>{c.latest}</strong>
          {data.reviews.map((review) => <blockquote key={review.id}>{review.comment}</blockquote>)}
        </div>
      )}

      {formOpen && (
        <form className="review-form" onSubmit={submit}>
          <div className="review-rating-grid">
            {REVIEW_FIELDS.map(([field, Icon]) => (
              <RatingInput
                key={field}
                value={ratings[field]}
                label={c[field]}
                icon={Icon}
                onChange={(value) => setRatings((current) => ({ ...current, [field]: value }))}
              />
            ))}
          </div>
          <label className="review-comment">
            <span>{c.comment} <small>{c.optional}</small></span>
            <textarea
              rows="3"
              maxLength="500"
              value={comment}
              placeholder={c.commentPlaceholder}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <p className="review-privacy"><Sparkles size={13} /> {c.privacy}</p>
          {submitState.error && <p className="review-error">{submitState.error}</p>}
          <button className="review-submit" type="submit" disabled={submitState.loading}>
            {submitState.loading ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
            {submitState.loading ? c.submitting : c.submit}
          </button>
        </form>
      )}

      {submitState.complete && (
        <div className="review-success">
          <Check size={17} />
          <p>
            <strong>{c.submitted}</strong>
            <span>{submitState.moderationRequired ? c.moderation : c.ratingsSaved}</span>
          </p>
        </div>
      )}
    </div>
  )
}
