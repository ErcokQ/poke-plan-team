import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
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

  it('ships current Champions move and item rankings for every ranked Pokemon', async () => {
    const snapshotPath = path.resolve('public/meta-snapshots/champions/vgc-reg-mc.json')
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      pokemon: Record<string, { moves: Record<string, number>; items: Record<string, number> }>
    }

    expect(Object.keys(snapshot.pokemon).length).toBeGreaterThan(0)
    for (const entry of Object.values(snapshot.pokemon)) {
      expect(Object.keys(entry.moves).length).toBeGreaterThan(0)
      expect(Object.keys(entry.items).length).toBeGreaterThan(0)
    }
  })
})
