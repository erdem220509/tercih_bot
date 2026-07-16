export const languageRequirements = [
  {
    match: ['BOĞAZİÇİ ÜNİVERSİTESİ'], label: 'Boğaziçi University',
    toefl: '79 overall · 22 writing', ielts: '6.5 overall · 6.5 writing',
    note: 'Scores are valid for two years. University BUEPT grade C is also accepted.',
    source: 'https://ogrenciler.bogazici.edu.tr/en/pages/university-registration/8075', checked: '2026',
  },
  {
    match: ['ORTA DOĞU TEKNİK ÜNİVERSİTESİ'], label: 'Middle East Technical University',
    toefl: '75 iBT', ielts: 'Not listed as accepted',
    note: 'Minimum for undergraduate preparatory-school exemption. Tests taken in Türkiye must be held at a state university building.',
    source: 'https://oidb.metu.edu.tr/en/equivalence-table-english-language-exams-recognized-metu-undergraduate-and-graduate-students', checked: '30 Apr 2026',
  },
  {
    match: ['İSTANBUL TEKNİK ÜNİVERSİTESİ'], label: 'Istanbul Technical University',
    toefl: '72 iBT / 4.0 new scale', ielts: 'Not listed as accepted',
    note: 'Minimum undergraduate exemption band; some advanced English courses require 91 / 5.0. Türkiye test-center restrictions apply.',
    source: 'https://www.sis.itu.edu.tr/EN/regulations/valid-english-tests-and-minimum-scores.php', checked: '2026',
  },
  {
    match: ['İHSAN DOĞRAMACI BİLKENT ÜNİVERSİTESİ', 'BİLKENT ÜNİVERSİTESİ'], label: 'Bilkent University',
    toefl: '87 iBT', ielts: '6.5 overall · min. 5.5 each',
    note: 'For exemption from the English preparatory program; external results must be valid at registration.',
    source: 'https://w3.bilkent.edu.tr/international/wp-content/uploads/sites/7/2026/02/Bilkent_2026.pdf', checked: '2026',
  },
  {
    match: ['SABANCI ÜNİVERSİTESİ'], label: 'Sabancı University',
    toefl: '85 iBT', ielts: 'Not listed as accepted',
    note: 'For Foundation Development Year exemption. Home/online exams are not accepted; Türkiye test-center restrictions apply.',
    source: 'https://www.sabanciuniv.edu/en/exemption-fdy', checked: '2026',
  },
  {
    match: ['KOÇ ÜNİVERSİTESİ'], label: 'Koç University',
    toefl: '80 iBT · 20 writing', ielts: 'Not currently accepted',
    note: 'For English Language Center exemption. International exam test-center restrictions may apply in Türkiye.',
    source: 'https://elc.ku.edu.tr/wp-content/uploads/2021/12/2021-2022-ELC-Egitim-Programi-Ogrenci-El-Kitapcigi.pdf', checked: 'Official published rule',
  },
]

export function findLanguageRequirement(universityName = '') {
  const clean = universityName.toLocaleUpperCase('tr-TR')
  return languageRequirements.find((entry) => entry.match.some((name) => clean.includes(name))) || null
}
