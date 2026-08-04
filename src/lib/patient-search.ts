import type { Patient } from '@/lib/types'

export function normalizePatientSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ')
}

function isRecentPatient(createdAt: string) {
  const created = new Date(createdAt)
  const expiry = new Date(created.getFullYear(), created.getMonth(), created.getDate() + 2)
  return new Date() < expiry
}

export function getRecentPatients(patients: Patient[]) {
  return patients
    .filter((patient) => isRecentPatient(patient.created_at))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function scoreName(name: string, query: string) {
  const normalizedName = normalizePatientSearch(name)
  if (normalizedName === query) return 0
  if (normalizedName.startsWith(query)) return 1
  if (normalizedName.split(' ').some((part) => part.startsWith(query))) return 2
  if (normalizedName.includes(query)) return 3
  return null
}

// Damerau-Levenshtein também aceita duas letras vizinhas invertidas.
function typingDistance(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1)
      }
    }
  }
  return matrix[a.length][b.length]
}

function fuzzyScore(name: string, query: string) {
  if (query.length < 3) return null
  const tolerance = query.length >= 6 ? 2 : 1
  const words = normalizePatientSearch(name).split(' ')
  const bestDistance = Math.min(...words.map((word) => typingDistance(word, query)))
  return bestDistance <= tolerance ? bestDistance : null
}

export function searchPatients(patients: Patient[], value: string, limit?: number) {
  const query = normalizePatientSearch(value)
  const recentPatients = getRecentPatients(patients)
  if (!query) return typeof limit === 'number' ? recentPatients.slice(0, limit) : recentPatients

  const direct = patients
    .map((patient) => ({ patient, score: scoreName(patient.name, query) }))
    .filter((item): item is typeof item & { score: number } => item.score !== null)

  const matches = direct.length > 0
    ? direct
    : patients
        .map((patient) => ({ patient, score: fuzzyScore(patient.name, query) }))
        .filter((item): item is typeof item & { score: number } => item.score !== null)

  const ordered = matches
    .sort((a, b) => a.score - b.score || a.patient.name.localeCompare(b.patient.name, 'pt-BR'))
    .map(({ patient }) => patient)

  return typeof limit === 'number' ? ordered.slice(0, limit) : ordered
}
