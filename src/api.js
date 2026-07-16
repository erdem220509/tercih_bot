async function request(path, options) {
  const response = await fetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Something went wrong.')
  return data
}

export const getPrograms = () => request('/api/programs')

export const searchPrograms = (filters) => request('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(filters),
})

export const getNets = (programCode, year = 2025) => request('/api/nets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ programCode, year }),
})
