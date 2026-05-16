import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStrategyStore } from './strategy'
import { useTeamStore } from './team'

vi.mock('@/services/dex-cache-service', () => ({
  DEX_CACHE_VERSION: 'v1',
  getCached: vi.fn(async () => null),
  isCacheValid: vi.fn(() => false),
  makeDexCacheKey: vi.fn((locale: string, section: string) => `${locale}:${section}`),
  setCached: vi.fn(async () => undefined),
}))

describe('useStrategyStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('creates one draft per mode and active team', () => {
    const teamStore = useTeamStore()
    const strategyStore = useStrategyStore()

    const activeTeam = teamStore.getActiveTeam('vgc')
    const draft = strategyStore.ensureDraft('vgc')

    expect(draft.mode).toBe('vgc')
    expect(draft.teamId).toBe(activeTeam.id)
    expect(draft.threatNotes).toEqual([])
    expect(draft.selectedThreatPokemonId).toBeNull()
  })

  it('increments seen count and keeps the threat selected', () => {
    const strategyStore = useStrategyStore()

    strategyStore.incrementThreatSeen('vgc', 'garchomp')
    strategyStore.incrementThreatSeen('vgc', 'garchomp')

    const draft = strategyStore.ensureDraft('vgc')
    const threat = draft.threatNotes.find((entry) => entry.pokemonId === 'garchomp')

    expect(threat?.timesSeen).toBe(2)
    expect(draft.selectedThreatPokemonId).toBe('garchomp')
  })

  it('deduplicates observed moves when adding the same move twice', () => {
    const strategyStore = useStrategyStore()

    strategyStore.upsertThreatNote('vgc', 'incineroar')
    strategyStore.appendThreatMove('vgc', 'incineroar', 'fake-out')
    strategyStore.appendThreatMove('vgc', 'incineroar', 'fake-out')

    const draft = strategyStore.ensureDraft('vgc')
    const threat = draft.threatNotes.find((entry) => entry.pokemonId === 'incineroar')

    expect(threat?.commonMoves).toEqual(['fake-out'])
  })

  it('falls back to the first remaining threat after deleting the selected one', () => {
    const strategyStore = useStrategyStore()

    strategyStore.upsertThreatNote('vgc', 'amoonguss', { timesSeen: 3 })
    strategyStore.upsertThreatNote('vgc', 'gholdengo', { timesSeen: 1 })
    strategyStore.setSelectedThreat('vgc', 'gholdengo')
    strategyStore.removeThreatNote('vgc', 'gholdengo')

    const draft = strategyStore.ensureDraft('vgc')

    expect(draft.threatNotes.map((entry) => entry.pokemonId)).toEqual(['amoonguss'])
    expect(draft.selectedThreatPokemonId).toBe('amoonguss')
  })
})
