import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBufferedStorage } from './buffered-storage'

describe('useBufferedStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates from localStorage and writes back with debounce', async () => {
    localStorage.setItem('buffered:test', JSON.stringify({ count: 1 }))
    const { state } = useBufferedStorage('buffered:test', { count: 0 }, { debounceMs: 200 })

    expect(state.value).toEqual({ count: 1 })

    state.value = { count: 3 }
    await nextTick()

    expect(JSON.parse(localStorage.getItem('buffered:test') ?? '{}')).toEqual({ count: 1 })

    vi.advanceTimersByTime(200)
    await nextTick()

    expect(JSON.parse(localStorage.getItem('buffered:test') ?? '{}')).toEqual({ count: 3 })
  })

  it('flushes pending writes immediately', async () => {
    const { state, flush } = useBufferedStorage('buffered:flush', { count: 0 }, { debounceMs: 500 })

    state.value = { count: 9 }
    await nextTick()

    flush()

    expect(JSON.parse(localStorage.getItem('buffered:flush') ?? '{}')).toEqual({ count: 9 })
  })
})
