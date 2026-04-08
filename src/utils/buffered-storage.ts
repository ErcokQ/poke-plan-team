import { ref, watch, type Ref } from 'vue'

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function readStorage<T>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return cloneValue(defaults)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return cloneValue(defaults)
    return JSON.parse(raw) as T
  } catch {
    return cloneValue(defaults)
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/private mode errors; runtime state still stays in memory.
  }
}

export interface BufferedStorageHandle<T> {
  state: Ref<T>
  flush: () => void
}

export function useBufferedStorage<T>(
  key: string,
  defaults: T,
  options: {
    debounceMs?: number
  } = {},
): BufferedStorageHandle<T> {
  const debounceMs = Math.max(0, Math.floor(options.debounceMs ?? 250))
  const state = ref<T>(readStorage(key, defaults)) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    writeStorage(key, state.value)
  }

  watch(
    state,
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        writeStorage(key, state.value)
      }, debounceMs)
    },
    { deep: true },
  )

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
  }

  return { state, flush }
}
