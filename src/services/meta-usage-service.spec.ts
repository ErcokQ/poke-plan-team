import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalSnapshotUsageProvider, normalizeMetaId } from './meta-usage-service'

describe('meta usage service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes Pikalytics names into local ids', () => {
    expect(normalizeMetaId('Charizard-Mega-Y')).toBe('charizard-mega-y')
    expect(normalizeMetaId('Rotom Wash')).toBe('rotom-wash')
    expect(normalizeMetaId('Floette-Mega')).toBe('floette-mega')
    expect(normalizeMetaId('Basculegion')).toBe('basculegion-male')
    expect(normalizeMetaId('Aegislash')).toBe('aegislash-shield')
    expect(normalizeMetaId('Maushold')).toBe('maushold-family-of-four')
  })

  it('loads Champions usage from the local snapshot shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          pokemon: {
            Sneasler: {
              usage: { weighted: 0.438 },
              moves: { 'Fake Out': 0.91 },
              items: { 'White Herb': 0.77 },
              teammates: { Kingambit: 0.45, Basculegion: 0.43 },
            },
          },
        }),
      })),
    )

    const provider = new LocalSnapshotUsageProvider()
    const result = await provider.loadFormat('champions-vgc-reg-mc')

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('vgc-reg-mc.json'), expect.any(Object))

    expect(result.sneasler?.usage).toBe(0.438)
    expect(result.sneasler?.moves[0]).toEqual({ id: 'fake-out', weight: 0.91 })
    expect(result.sneasler?.items[0]).toEqual({ id: 'white-herb', weight: 0.77 })
    expect(result.sneasler?.teammates[0]).toEqual({ id: 'kingambit', weight: 0.45 })
    expect(result.sneasler?.teammates[1]).toEqual({ id: 'basculegion-male', weight: 0.43 })
  })
})
