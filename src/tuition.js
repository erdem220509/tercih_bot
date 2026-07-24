function scholarshipDiscountPercent(label) {
  const normalized = String(label || '').trim().toLocaleLowerCase('tr-TR')
  if (!normalized) return null
  if (normalized === 'burslu' || normalized.includes('tam burs')) return 100
  if (normalized === 'ücretli') return 0

  const percentage = normalized.match(/%\s*(\d{1,3})/)
  if (!percentage || !normalized.includes('indirim')) return null
  const discount = Number(percentage[1])
  return discount >= 0 && discount <= 100 ? discount : null
}

export function calculateProgramTuition(row) {
  if (row?.universiteTuru !== 'VAKIF') return null

  const fullTuition = Number(row?.ucret)
  const discountPercent = scholarshipDiscountPercent(row?.bursOraniAdi)
  if (!Number.isFinite(fullTuition) || fullTuition <= 0 || discountPercent == null) return null

  const guideYear = Number(row?.yil)
  return {
    fullTuition,
    discountPercent,
    payableTuition: Math.round(fullTuition * (1 - discountPercent / 100)),
    academicYear: Number.isInteger(guideYear) && guideYear > 2000
      ? `${guideYear}–${guideYear + 1}`
      : null,
  }
}
