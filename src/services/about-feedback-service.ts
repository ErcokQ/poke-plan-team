export type AboutFeedbackType = 'bug' | 'suggestion'

export interface AboutFeedbackEntry {
  id: string
  type: AboutFeedbackType
  subject: string
  message: string
  mode: 'vgc' | 'singles'
  language: string
  createdAt: string
}

interface AboutFeedbackStorage {
  entries: AboutFeedbackEntry[]
}

const STORAGE_KEY = 'pokeplan.v1.about.feedback'
const MAX_ENTRIES = 300

function readStorage(): AboutFeedbackStorage {
  if (typeof window === 'undefined') return { entries: [] }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { entries: [] }

  try {
    const parsed = JSON.parse(raw) as AboutFeedbackStorage
    if (!Array.isArray(parsed.entries)) return { entries: [] }
    return {
      entries: parsed.entries.filter((entry) => Boolean(entry?.id) && Boolean(entry?.type)),
    }
  } catch {
    return { entries: [] }
  }
}

function writeStorage(payload: AboutFeedbackStorage) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function saveAboutFeedback(
  payload: Omit<AboutFeedbackEntry, 'id' | 'createdAt'>,
): AboutFeedbackEntry {
  const current = readStorage()
  const entry: AboutFeedbackEntry = {
    ...payload,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  }

  const entries = [entry, ...current.entries].slice(0, MAX_ENTRIES)
  writeStorage({ entries })
  return entry
}

export function getAboutFeedbackCounters() {
  const current = readStorage()
  return {
    total: current.entries.length,
    bug: current.entries.filter((entry) => entry.type === 'bug').length,
    suggestion: current.entries.filter((entry) => entry.type === 'suggestion').length,
  }
}

