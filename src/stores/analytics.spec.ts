import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDexStore } from '@/stores/dex'
import { useTeamStore } from '@/stores/team'

describe('useAnalyticsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('recalculates threat and closer scores when Dex data finishes loading', () => {
    const dexStore = useDexStore()
    const teamStore = useTeamStore()
    const analyticsStore = useAnalyticsStore()
    const loadedMoves = dexStore.moves

    teamStore.updateMember('vgc', 1, {
      pokemonId: 'flutter-mane',
      moves: ['moonblast', 'shadow-ball', 'protect', 'icy-wind'],
    })

    dexStore.moves = []
    const before = analyticsStore.getOffensivePressureSummary('vgc').members[0]
    expect(before?.damagingMoves).toBe(0)

    dexStore.moves = loadedMoves
    dexStore.lastHydratedAt = '2026-09-22T00:00:00.000Z'

    const after = analyticsStore.getOffensivePressureSummary('vgc').members[0]
    const individual = analyticsStore.getMemberAnalytics('vgc', 1)
    expect(after?.damagingMoves).toBe(3)
    expect(after?.threatScore).toBeGreaterThan(before?.threatScore ?? 0)
    expect(after?.closerScore).toBeGreaterThan(before?.closerScore ?? 0)
    expect(individual?.threatScore).toBe(after?.threatScore)
    expect(individual?.closerScore).toBe(after?.closerScore)
  })
})
