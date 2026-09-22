import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { LocalSnapshotUsageProvider, MetaUsageService, normalizeMetaId } from './meta-usage-service'

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

  it('retries a failed local meta load on the next selection', async () => {
    const provider = {
      loadFormat: vi.fn()
        .mockRejectedValueOnce(new Error('temporary network error'))
        .mockResolvedValueOnce({ raichu: { usage: 0.05, moves: [], items: [], teammates: [] } }),
    }
    const service = new MetaUsageService(provider)

    await expect(service.loadFormat('champions-vgc-reg-mc')).rejects.toThrow('temporary network error')
    await expect(service.loadFormat('champions-vgc-reg-mc')).resolves.toHaveProperty('raichu')
    expect(provider.loadFormat).toHaveBeenCalledTimes(2)
  })

  it('ships current Champions rankings beyond the top 20', async () => {
    const snapshotPath = path.resolve('public/meta-snapshots/champions/vgc-reg-mc.json')
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      pokemon: Record<string, { rank: number; moves: Record<string, number>; items: Record<string, number> }>
    }

    const entries = Object.values(snapshot.pokemon)
    expect(entries.length).toBeGreaterThan(200)
    expect(entries.filter((entry) => Object.keys(entry.moves).length > 0).length).toBeGreaterThan(200)
    expect(entries.filter((entry) => Object.keys(entry.items).length > 0).length).toBeGreaterThan(200)
    expect(snapshot.pokemon.raichu?.rank).toBeGreaterThan(20)
    expect(Object.keys(snapshot.pokemon.raichu?.moves ?? {})).toContain('fake-out')
    expect(Object.keys(snapshot.pokemon.raichu?.items ?? {})[0]).toBe('raichunite-y')
  })
})
