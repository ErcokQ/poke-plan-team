import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/dex-cache-service', () => ({
  DEX_CACHE_VERSION: 'v8',
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
        loadChampionsAvailability: vi.fn(async () => ({
          version: 'v1',
          generatedAt: '2026-04-08T00:00:00.000Z',
          game: { id: 'pokemon-champions', name: 'Pokemon Champions' },
          metadata: { maintainers: [], lastReviewedAt: '2026-04-08', notes: '' },
          entries: [
            {
              pokemonId: 'bulbasaur',
              formId: null,
              availability: 'available',
              introducedIn: 'launch',
              sourceType: 'official',
              sourceLabel: 'Official',
              sourceUrl: 'https://example.com',
              notes: '',
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
    expect(store.getGenerationEntries(1, 'es')[0]?.gameAvailability).toContain('pokemon-champions')
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

  it('does not inherit Pokemon Champions availability from later evolutions', async () => {
    vi.stubEnv('VITE_DEX_SOURCE', 'snapshot')
    vi.doMock('@/services/dex-snapshot-service', () => ({
      dexSnapshotService: {
        loadCatalog: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generatedAt: '2026-04-18T00:00:00.000Z',
          pokemon: [
            {
              id: 'bulbasaur',
              name: 'Bulbasaur',
              pokedexNumber: 1,
              types: ['grass', 'poison'],
              evolutionChain: ['bulbasaur', 'ivysaur', 'venusaur'],
              preEvolutionChain: [],
              abilities: ['overgrow'],
              suggestedItems: ['eviolite'],
              suggestedMoves: ['sludge-bomb'],
              learnsetMoves: ['sludge-bomb'],
              defaultNature: 'modest',
              baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
              roleTags: ['support'],
            },
            {
              id: 'ivysaur',
              name: 'Ivysaur',
              pokedexNumber: 2,
              types: ['grass', 'poison'],
              evolutionChain: ['bulbasaur', 'ivysaur', 'venusaur'],
              preEvolutionChain: ['bulbasaur'],
              abilities: ['overgrow'],
              suggestedItems: ['eviolite'],
              suggestedMoves: ['sludge-bomb'],
              learnsetMoves: ['sludge-bomb'],
              defaultNature: 'modest',
              baseStats: { hp: 60, atk: 62, def: 63, spa: 80, spd: 80, spe: 60 },
              roleTags: ['support'],
            },
            {
              id: 'venusaur',
              name: 'Venusaur',
              pokedexNumber: 3,
              types: ['grass', 'poison'],
              evolutionChain: ['bulbasaur', 'ivysaur', 'venusaur'],
              preEvolutionChain: ['bulbasaur', 'ivysaur'],
              abilities: ['overgrow'],
              suggestedItems: ['black-sludge'],
              suggestedMoves: ['sludge-bomb'],
              learnsetMoves: ['sludge-bomb'],
              defaultNature: 'modest',
              baseStats: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
              roleTags: ['support'],
            },
          ],
          moves: [
            {
              id: 'sludge-bomb',
              name: 'Bomba Lodo',
              type: 'poison',
              category: 'special',
              power: 90,
              accuracy: 100,
              pp: 10,
              priority: 0,
              tags: [],
              description: '',
              effect: '',
            },
          ],
          items: [
            { id: 'eviolite', name: 'Mineral Evol', tags: [], description: '', effect: '' },
            { id: 'black-sludge', name: 'Lodo Negro', tags: [], description: '', effect: '' },
          ],
          abilities: [
            {
              id: 'overgrow',
              name: 'Espesura',
              shortEffect: '',
              effect: '',
            },
          ],
          formsByPokemonId: {
            bulbasaur: ['bulbasaur'],
            ivysaur: ['ivysaur'],
            venusaur: ['venusaur'],
          },
        })),
        loadGeneration: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 1,
          generatedAt: '2026-04-18T00:00:00.000Z',
          detailBucketsByPokemonId: {
            bulbasaur: 1,
            ivysaur: 1,
            venusaur: 1,
          },
          profiles: [
            {
              id: 'bulbasaur',
              pokedexNumber: 1,
              name: 'Bulbasaur',
              genus: 'Seed Pokemon',
              flavorText: '',
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
              evolutionChain: [
                { id: 'bulbasaur', name: 'Bulbasaur', pokedexNumber: 1, variants: [] },
                { id: 'ivysaur', name: 'Ivysaur', pokedexNumber: 2, variants: [] },
                { id: 'venusaur', name: 'Venusaur', pokedexNumber: 3, variants: [] },
              ],
              sprites: { home: null, officialArtwork: null, showdown: null, default: null },
            },
            {
              id: 'ivysaur',
              pokedexNumber: 2,
              name: 'Ivysaur',
              genus: 'Seed Pokemon',
              flavorText: '',
              types: ['grass', 'poison'],
              abilities: [{ id: 'overgrow', name: 'Espesura', isHidden: false }],
              stats: { hp: 60, atk: 62, def: 63, spa: 80, spd: 80, spe: 60 },
              heightMeters: 1,
              weightKg: 13,
              baseExperience: 142,
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
              evolutionChain: [
                { id: 'bulbasaur', name: 'Bulbasaur', pokedexNumber: 1, variants: [] },
                { id: 'ivysaur', name: 'Ivysaur', pokedexNumber: 2, variants: [] },
                { id: 'venusaur', name: 'Venusaur', pokedexNumber: 3, variants: [] },
              ],
              sprites: { home: null, officialArtwork: null, showdown: null, default: null },
            },
            {
              id: 'venusaur',
              pokedexNumber: 3,
              name: 'Venusaur',
              genus: 'Seed Pokemon',
              flavorText: '',
              types: ['grass', 'poison'],
              abilities: [{ id: 'overgrow', name: 'Espesura', isHidden: false }],
              stats: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
              heightMeters: 2,
              weightKg: 100,
              baseExperience: 236,
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
              evolutionChain: [
                { id: 'bulbasaur', name: 'Bulbasaur', pokedexNumber: 1, variants: [] },
                { id: 'ivysaur', name: 'Ivysaur', pokedexNumber: 2, variants: [] },
                { id: 'venusaur', name: 'Venusaur', pokedexNumber: 3, variants: [] },
              ],
              sprites: { home: null, officialArtwork: null, showdown: null, default: null },
            },
          ],
        })),
        loadChampionsAvailability: vi.fn(async () => ({
          version: 'v1',
          generatedAt: '2026-04-18T00:00:00.000Z',
          game: { id: 'pokemon-champions', name: 'Pokemon Champions' },
          metadata: { maintainers: [], lastReviewedAt: '2026-04-18', notes: '' },
          entries: [
            {
              pokemonId: 'venusaur',
              formId: null,
              availability: 'available',
              introducedIn: 'launch',
              sourceType: 'official',
              sourceLabel: 'Official',
              sourceUrl: 'https://example.com',
              notes: '',
            },
          ],
        })),
        loadProfiles: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 1,
          bucketId: 1,
          generatedAt: '2026-04-18T00:00:00.000Z',
          profiles: [],
        })),
        loadProfileBucket: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 1,
          bucketId: 1,
          generatedAt: '2026-04-18T00:00:00.000Z',
          profiles: [],
        })),
        resetCache: vi.fn(),
      },
    }))

    const { useDexStore } = await import('./dex')
    const store = useDexStore()

    await store.ensureCatalogLoaded({ locale: 'es' })
    await store.ensureGenerationLoaded(1, 'es')

    expect(store.getPokemonProfileSummary('bulbasaur', 'es')?.gameAvailability).not.toContain('pokemon-champions')
    expect(store.getPokemonProfileSummary('ivysaur', 'es')?.gameAvailability).not.toContain('pokemon-champions')
    expect(store.getPokemonProfileSummary('venusaur', 'es')?.gameAvailability).toContain('pokemon-champions')
  })

  it('resolves Maushold alias lookups to family-of-four data', async () => {
    vi.stubEnv('VITE_DEX_SOURCE', 'snapshot')
    vi.doMock('@/services/dex-snapshot-service', () => ({
      dexSnapshotService: {
        loadCatalog: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generatedAt: '2026-04-26T00:00:00.000Z',
          pokemon: [
            {
              id: 'maushold-family-of-four',
              name: 'Maushold',
              pokedexNumber: 925,
              types: ['normal'],
              evolutionChain: ['tandemaus', 'maushold-family-of-four'],
              preEvolutionChain: ['tandemaus'],
              abilities: ['friend-guard', 'cheek-pouch', 'technician'],
              suggestedItems: ['leftovers', 'life-orb', 'choice-scarf'],
              suggestedMoves: ['population-bomb'],
              learnsetMoves: ['population-bomb'],
              defaultNature: 'jolly',
              baseStats: { hp: 74, atk: 75, def: 70, spa: 65, spd: 75, spe: 111 },
              roleTags: ['support'],
            },
            {
              id: 'maushold-family-of-three',
              name: 'Maushold',
              pokedexNumber: 925,
              types: ['normal'],
              evolutionChain: ['tandemaus', 'maushold-family-of-four'],
              preEvolutionChain: ['tandemaus'],
              abilities: ['friend-guard', 'cheek-pouch', 'technician'],
              suggestedItems: ['leftovers', 'life-orb', 'choice-scarf'],
              suggestedMoves: ['population-bomb'],
              learnsetMoves: ['population-bomb'],
              defaultNature: 'jolly',
              baseStats: { hp: 74, atk: 75, def: 70, spa: 65, spd: 75, spe: 111 },
              roleTags: ['support'],
            },
          ],
          moves: [],
          items: [],
          abilities: [
            { id: 'friend-guard', name: 'Compiescolta', shortEffect: '', effect: '' },
            { id: 'cheek-pouch', name: 'Carrillo', shortEffect: '', effect: '' },
            { id: 'technician', name: 'Experto', shortEffect: '', effect: '' },
          ],
          formsByPokemonId: {
            'maushold-family-of-four': ['maushold-family-of-four', 'maushold-family-of-three'],
            'maushold-family-of-three': ['maushold-family-of-four', 'maushold-family-of-three'],
          },
        })),
        loadGeneration: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 9,
          generatedAt: '2026-04-26T00:00:00.000Z',
          detailBucketsByPokemonId: {
            'maushold-family-of-four': 4,
            'maushold-family-of-three': 4,
          },
          profiles: [
            {
              id: 'maushold-family-of-four',
              pokedexNumber: 925,
              name: 'Maushold',
              genus: 'Family Pokemon',
              flavorText: '',
              types: ['normal'],
              abilities: [
                { id: 'friend-guard', name: 'Compiescolta', isHidden: false },
                { id: 'cheek-pouch', name: 'Carrillo', isHidden: false },
                { id: 'technician', name: 'Experto', isHidden: true },
              ],
              stats: { hp: 74, atk: 75, def: 70, spa: 65, spd: 75, spe: 111 },
              heightMeters: 0.3,
              weightKg: 2.3,
              baseExperience: 0,
              captureRate: 0,
              baseHappiness: 0,
              habitat: '',
              growthRate: '',
              generation: 'Generation IX',
              generationId: 9,
              gameAvailability: ['scarlet-violet'],
              eggGroups: [],
              isLegendary: false,
              isMythical: false,
              evolutionChain: [
                {
                  id: 'maushold-family-of-four',
                  name: 'Maushold',
                  pokedexNumber: 925,
                  variants: [{ id: 'maushold-family-of-three', name: 'Maushold Family Of Three', kind: 'form' }],
                },
              ],
              sprites: {
                home: 'https://example.com/maushold.png',
                officialArtwork: 'https://example.com/maushold-art.png',
                showdown: 'https://example.com/maushold.gif',
                default: 'https://example.com/maushold-default.png',
              },
            },
          ],
        })),
        loadChampionsAvailability: vi.fn(async () => ({
          version: 'v1',
          generatedAt: '2026-04-26T00:00:00.000Z',
          game: { id: 'pokemon-champions', name: 'Pokemon Champions' },
          metadata: { maintainers: [], lastReviewedAt: '2026-04-26', notes: '' },
          entries: [],
        })),
        loadProfiles: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 9,
          bucketId: 4,
          generatedAt: '2026-04-26T00:00:00.000Z',
          profiles: [],
        })),
        loadProfileBucket: vi.fn(async () => ({
          version: 'v1',
          locale: 'es',
          generationId: 9,
          bucketId: 4,
          generatedAt: '2026-04-26T00:00:00.000Z',
          profiles: [],
        })),
        resetCache: vi.fn(),
      },
    }))

    const { useDexStore } = await import('./dex')
    const store = useDexStore()

    await store.ensureCatalogLoaded({ locale: 'es' })
    await store.ensureGenerationLoaded(9, 'es')

    expect(store.getPokemon('vgc', 'maushold')?.id).toBe('maushold-family-of-four')
    expect(store.getPokemon('vgc', 'maushold-four')?.id).toBe('maushold-family-of-four')
    expect(store.getPokemon('vgc', 'maushold-three')?.id).toBe('maushold-family-of-three')
    expect(store.getPokemon('vgc', 'maushold-family-four')?.id).toBe('maushold-family-of-four')
    expect(store.getPokemon('vgc', 'Maushold (Family of Four)')?.id).toBe('maushold-family-of-four')
    expect(store.getPokemon('vgc', 'maushold')?.abilities).toContain('technician')
    expect(store.getPokemon('vgc', 'maushold')?.suggestedItems[0]).toBe('leftovers')
    expect(store.getPokemonProfileSummary('maushold', 'es')?.id).toBe('maushold-family-of-four')
    expect(store.getPokemonProfileSummary('maushold-four', 'es')?.id).toBe('maushold-family-of-four')
    expect(store.getPokemonForms('es', 'maushold').map((entry) => entry.id)).toEqual([
      'maushold-family-of-four',
      'maushold-family-of-three',
    ])
  })
})
