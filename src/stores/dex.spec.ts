import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/dex-cache-service', () => ({
  getCached: vi.fn(async () => null),
  isCacheValid: vi.fn(() => false),
  makeDexCacheKey: vi.fn((locale: string, section: string) => `${locale}:${section}`),
  setCached: vi.fn(async () => undefined),
}))

describe('useDexStore', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.doUnmock('@/services/dex-snapshot-service')
    setActivePinia(createPinia())
  })

  it('loads local snapshots without calling runtime catalog fetches', async () => {
    vi.stubEnv('VITE_DEX_SOURCE', 'snapshot')
    vi.doMock('@/services/dex-snapshot-service', () => ({
      dexSnapshotService: {
        loadCatalog: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generatedAt: '2026-03-30T00:00:00.000Z',
          pokemon: [
            {
              id: 'bulbasaur',
              name: 'Bulbasaur',
              pokedexNumber: 1,
              types: ['grass', 'poison'],
              evolutionChain: ['bulbasaur'],
              preEvolutionChain: [],
              abilities: ['overgrow'],
              suggestedItems: ['leftovers'],
              suggestedMoves: ['tackle'],
              learnsetMoves: ['tackle'],
              defaultNature: 'modest',
              baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
              roleTags: ['support'],
            },
          ],
          moves: [
            {
              id: 'tackle',
              name: 'Placaje',
              type: 'normal',
              category: 'physical',
              power: 40,
              accuracy: 100,
              pp: 35,
              priority: 0,
              tags: [],
              description: '',
              effect: '',
            },
          ],
          items: [
            {
              id: 'leftovers',
              name: 'Leftovers',
              tags: [],
              description: '',
              effect: '',
            },
          ],
          abilities: [
            {
              id: 'overgrow',
              name: 'Espesura',
              shortEffect: '',
              effect: '',
            },
          ],
          formsByPokemonId: { bulbasaur: ['bulbasaur'] },
        })),
        loadGeneration: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 1,
          generatedAt: '2026-03-30T00:00:00.000Z',
          detailBucketsByPokemonId: {
            bulbasaur: 1,
          },
          profiles: [
            {
              id: 'bulbasaur',
              pokedexNumber: 1,
              name: 'Bulbasaur',
              genus: 'Seed Pokemon',
              flavorText: 'A strange seed was planted on its back at birth.',
              types: ['grass', 'poison'],
              abilities: [{ id: 'overgrow', name: 'Espesura', isHidden: false }],
              stats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
              heightMeters: 0.7,
              weightKg: 6.9,
              baseExperience: 64,
              captureRate: 45,
              baseHappiness: 50,
              habitat: 'Grassland',
              growthRate: 'Medium Slow',
              generation: 'Generation I',
              generationId: 1,
              gameAvailability: ['scarlet-violet', 'sword-shield'],
              eggGroups: ['Monster'],
              isLegendary: false,
              isMythical: false,
              evolutionChain: [{ id: 'bulbasaur', name: 'Bulbasaur', pokedexNumber: 1, variants: [] }],
              sprites: { home: null, officialArtwork: null, showdown: null, default: null },
            },
          ],
        })),
        loadProfiles: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 1,
          bucketId: 1,
          generatedAt: '2026-03-30T00:00:00.000Z',
          profiles: [],
        })),
        loadProfileBucket: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 1,
          bucketId: 1,
          generatedAt: '2026-03-30T00:00:00.000Z',
          profiles: [
            {
              id: 'bulbasaur',
              moves: [
                {
                  id: 'tackle',
                  name: 'Placaje',
                  category: 'physical',
                  type: 'normal',
                  versionGroups: ['scarlet-violet'],
                  learnMethods: ['level-up'],
                  minLevel: 1,
                },
              ],
            },
          ],
        })),
        resetCache: vi.fn(),
      },
    }))

    const [{ useDexStore }, { dexService }] = await Promise.all([
      import('./dex'),
      import('@/services/dex-service'),
    ])
    const pokemonCatalogSpy = vi.spyOn(dexService, 'loadPokemonCatalog')

    const store = useDexStore()
    await store.ensureCatalogLoaded({ locale: 'es' })
    await store.ensureGenerationLoaded(1, 'es')

    expect(store.source).toBe('snapshot')
    expect(store.getGenerationEntries(1, 'es').length).toBeGreaterThan(0)
    expect(pokemonCatalogSpy).not.toHaveBeenCalled()
  })

  it('supports mock mode across summaries and detail access', async () => {
    vi.stubEnv('VITE_DEX_SOURCE', 'mock')

    const { useDexStore } = await import('./dex')
    const store = useDexStore()

    await store.ensureCatalogLoaded({ locale: 'es' })
    const pokemonId = store.getPokemonByMode('vgc')[0]?.id
    expect(pokemonId).toBeTruthy()

    const summary = store.getPokemonProfileSummary(pokemonId!, 'es')
    const details = await store.ensurePokemonProfileDetails(pokemonId!, 'es')

    expect(store.source).toBe('mock')
    expect(summary?.id).toBe(pokemonId)
    expect(details?.moves.length ?? 0).toBeGreaterThan(0)
  })
})
