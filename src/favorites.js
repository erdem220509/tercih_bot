export const FAVORITES_STORAGE_KEY = 'pusula-favorite-programs-v2'

export function favoriteProgramKey(row) {
  return String(row?.kilavuzKodu || '').trim()
}

export function favoriteProgramLabel(row) {
  return [
    row?.universiteAdi,
    row?.birimAdi,
    row?.bursOraniAdi,
  ].filter(Boolean).join(' · ')
}

export function loadFavoritePrograms() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]')
    return Array.isArray(saved)
      ? saved.filter((item) => item?.university && item?.key).slice(0, 100)
      : []
  } catch {
    return []
  }
}
