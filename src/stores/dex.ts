import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ArchetypeEntry,
  BattleMode,
  ItemEntry,
  LocaleCode,
  MoveEntry,
  PokemonEntry,
  PokemonTypeKey,
} from '@/models/domain'
import { NATURES } from '@/utils/team'
import { dexService, type DexCatalogOptions } from '@/services/dex-service'
import {
  getCached,
  isCacheValid,
  makeDexCacheKey,
  setCached,
  type DexCacheEnvelope,
} from '@/services/dex-cache-service'

import pokemonVgcRaw from '@/data/mock/pokemon.vgc.json'
import pokemonSinglesRaw from '@/data/mock/pokemon.singles.json'
import movesRaw from '@/data/mock/moves.json'
import itemsRaw from '@/data/mock/items.json'
import archetypesVgcRaw from '@/data/mock/archetypes.vgc.json'
import archetypesSinglesRaw from '@/data/mock/archetypes.singles.json'

const mockPokemonCatalog: Record<BattleMode, PokemonEntry[]> = {
  vgc: pokemonVgcRaw as PokemonEntry[],
  singles: pokemonSinglesRaw as PokemonEntry[],
}

const mockArchetypeCatalog: Record<BattleMode, ArchetypeEntry[]> = {
  vgc: archetypesVgcRaw as ArchetypeEntry[],
  singles: archetypesSinglesRaw as ArchetypeEntry[],
}

const mockMovesCatalog = movesRaw as MoveEntry[]
const mockItemsCatalog = itemsRaw as ItemEntry[]

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

const DEX_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type HydrationStatus = 'idle' | 'loading' | 'ready' | 'error'

export const useDexStore = defineStore('dex', () => {
  const pokemonCatalog = ref<Record<BattleMode, PokemonEntry[]>>(cloneValue(mockPokemonCatalog))
  const movesCatalog = ref<MoveEntry[]>(cloneValue(mockMovesCatalog))
  const itemsCatalog = ref<ItemEntry[]>(cloneValue(mockItemsCatalog))
  const source = ref<'mock' | 'api'>('mock')
  const hydrationStatus = ref<HydrationStatus>('idle')
  const pendingHydration = ref<Promise<void> | null>(null)
  const lastHydratedAt = ref<string | null>(null)
  const hydratedLocale = ref<LocaleCode | null>(null)
  const formsByLocaleAndPokemon = ref<Record<string, PokemonEntry[]>>({})
  const pendingForms = new Map<string, Promise<PokemonEntry[]>>()
  const pendingMoves = new Map<string, Promise<MoveEntry | null>>()
  const hydrateError = ref<string | null>(null)
  const isHydrating = computed(() => hydrationStatus.value === 'loading')
  const isHydrated = computed(() => hydrationStatus.value === 'ready')

  const moveMap = computed(() => new Map(movesCatalog.value.map((move) => [move.id, move])))
  const itemMap = computed(() => new Map(itemsCatalog.value.map((item) => [item.id, item])))

  function getPokemonByMode(mode: BattleMode): PokemonEntry[] {
    return pokemonCatalog.value[mode]
  }

  function getPokemon(mode: BattleMode, id: string): PokemonEntry | undefined {
    return pokemonCatalog.value[mode].find((entry) => entry.id === id)
  }

  function getMove(id: string): MoveEntry | undefined {
    return moveMap.value.get(id)
  }

  async function ensureMovesByIds(moveIds: string[], locale: LocaleCode = hydratedLocale.value ?? 'es') {
    const uniqueMissing = [...new Set(moveIds.filter(Boolean))].filter((id) => !moveMap.value.has(id))
    if (uniqueMissing.length === 0) return

    const loaded = await Promise.all(
      uniqueMissing.map(async (moveId) => {
        if (!pendingMoves.has(moveId)) {
          const task = dexService
            .loadMoveEntry(moveId, locale)
            .finally(() => {
              pendingMoves.delete(moveId)
            })
          pendingMoves.set(moveId, task)
        }
        return pendingMoves.get(moveId)!
      }),
    )

    const valid = loaded.filter((entry): entry is MoveEntry => Boolean(entry))
    if (valid.length === 0) return

    const byId = new Map(movesCatalog.value.map((entry) => [entry.id, entry]))
    for (const move of valid) {
      byId.set(move.id, move)
    }
    movesCatalog.value = [...byId.values()]
  }

  function getMoveType(id: string): PokemonTypeKey | null {
    return moveMap.value.get(id)?.type ?? null
  }

  function getItem(id: string): ItemEntry | undefined {
    return itemMap.value.get(id)
  }

  function getArchetypes(mode: BattleMode): ArchetypeEntry[] {
    return mockArchetypeCatalog[mode]
  }

  function formsCacheKey(locale: LocaleCode, pokemonId: string): string {
    return `${locale}:${pokemonId}`
  }

  function mergePokemonEntriesIntoCatalog(entries: PokemonEntry[]) {
    if (!entries.length) return

    const mergeCatalog = (catalog: PokemonEntry[]): PokemonEntry[] => {
      const byId = new Map(catalog.map((entry) => [entry.id, entry]))
      for (const entry of entries) {
        byId.set(entry.id, entry)
      }
      return [...byId.values()].sort(
        (a, b) =>
          a.pokedexNumber - b.pokedexNumber ||
          a.name.localeCompare(b.name, hydratedLocale.value === 'es' ? 'es' : 'en'),
      )
    }

    pokemonCatalog.value = {
      vgc: mergeCatalog(pokemonCatalog.value.vgc),
      singles: mergeCatalog(pokemonCatalog.value.singles),
    }
  }

  function getPokemonForms(locale: LocaleCode, pokemonId: string): PokemonEntry[] {
    if (!pokemonId) return []
    return formsByLocaleAndPokemon.value[formsCacheKey(locale, pokemonId)] ?? []
  }

  async function ensurePokemonForms(
    _mode: BattleMode,
    pokemonId: string,
    locale: LocaleCode = 'es',
  ): Promise<PokemonEntry[]> {
    if (!pokemonId) return []
    const key = formsCacheKey(locale, pokemonId)
    const cached = formsByLocaleAndPokemon.value[key]
    if (cached && cached.length > 0) return cached

    if (pendingForms.has(key)) {
      return pendingForms.get(key)!
    }

    const task = (async () => {
      try {
        const forms = await dexService.loadPokemonForms(pokemonId, locale)
        if (!forms.length) return []

        mergePokemonEntriesIntoCatalog(forms)

        const nextCache = { ...formsByLocaleAndPokemon.value }
        for (const form of forms) {
          nextCache[formsCacheKey(locale, form.id)] = forms
        }
        nextCache[key] = forms
        formsByLocaleAndPokemon.value = nextCache
        return forms
      } catch {
        return []
      }
    })()

    pendingForms.set(key, task)
    try {
      return await task
    } finally {
      pendingForms.delete(key)
    }
  }

  async function ensureHydrated(options: DexCatalogOptions = {}) {
    const locale: LocaleCode = options.locale ?? 'es'
    if (isHydrated.value && hydratedLocale.value === locale && source.value === 'api') return
    if (pendingHydration.value) {
      await pendingHydration.value
      return
    }

    hydrationStatus.value = 'loading'
    hydrateError.value = null

    const pokemonKey = makeDexCacheKey(locale, 'pokemon')
    const movesKey = makeDexCacheKey(locale, 'moves')
    const itemsKey = makeDexCacheKey(locale, 'items')

    const task = (async () => {
      const [cachedPokemon, cachedMoves, cachedItems] = await Promise.all([
        getCached<PokemonEntry[]>(pokemonKey),
        getCached<MoveEntry[]>(movesKey),
        getCached<ItemEntry[]>(itemsKey),
      ])

      if (isCacheValid(cachedPokemon) && isCacheValid(cachedMoves) && isCacheValid(cachedItems)) {
        pokemonCatalog.value.vgc = cloneValue(cachedPokemon.payload)
        pokemonCatalog.value.singles = cloneValue(cachedPokemon.payload)
        movesCatalog.value = cloneValue(cachedMoves.payload)
        itemsCatalog.value = cloneValue(cachedItems.payload)
        hydratedLocale.value = locale
        lastHydratedAt.value = new Date(
          Math.max(cachedPokemon.createdAt, cachedMoves.createdAt, cachedItems.createdAt),
        ).toISOString()
        hydrationStatus.value = 'ready'
        source.value = 'api'
        return
      }

      const [pokemon, moves, items] = await Promise.all([
        dexService.loadPokemonCatalog({ ...options, locale }),
        dexService.loadMovesCatalog({ ...options, locale }),
        dexService.loadItemsCatalog({ ...options, locale }),
      ])

      if (pokemon.length > 0) {
        pokemonCatalog.value.vgc = pokemon
        pokemonCatalog.value.singles = pokemon
      }
      if (moves.length > 0) movesCatalog.value = moves
      if (items.length > 0) itemsCatalog.value = items

      const now = Date.now()
      const pokemonEnvelope: DexCacheEnvelope<PokemonEntry[]> = {
        version: 'v3',
        locale,
        createdAt: now,
        ttlMs: DEX_CACHE_TTL_MS,
        payload: pokemon,
      }
      const movesEnvelope: DexCacheEnvelope<MoveEntry[]> = {
        version: 'v3',
        locale,
        createdAt: now,
        ttlMs: DEX_CACHE_TTL_MS,
        payload: moves,
      }
      const itemsEnvelope: DexCacheEnvelope<ItemEntry[]> = {
        version: 'v3',
        locale,
        createdAt: now,
        ttlMs: DEX_CACHE_TTL_MS,
        payload: items,
      }

      await Promise.all([
        setCached(pokemonKey, pokemonEnvelope),
        setCached(movesKey, movesEnvelope),
        setCached(itemsKey, itemsEnvelope),
      ])

      source.value = 'api'
      hydratedLocale.value = locale
      lastHydratedAt.value = new Date(now).toISOString()
      hydrationStatus.value = 'ready'
    })()

    pendingHydration.value = task

    try {
      await task
    } catch (error) {
      hydrationStatus.value = 'error'
      source.value = 'mock'
      hydrateError.value = (error as Error).message
    } finally {
      pendingHydration.value = null
    }
  }

  async function hydrateFromApi(options: DexCatalogOptions = {}) {
    await ensureHydrated(options)
  }

  function invalidateHydration() {
    hydratedLocale.value = null
    lastHydratedAt.value = null
    formsByLocaleAndPokemon.value = {}
    pendingForms.clear()
    hydrateError.value = null
    hydrationStatus.value = 'idle'
    pendingHydration.value = null
  }

  function resetToMock() {
    pokemonCatalog.value = cloneValue(mockPokemonCatalog)
    movesCatalog.value = cloneValue(mockMovesCatalog)
    itemsCatalog.value = cloneValue(mockItemsCatalog)
    source.value = 'mock'
    hydrationStatus.value = 'idle'
    pendingHydration.value = null
    lastHydratedAt.value = null
    hydratedLocale.value = null
    formsByLocaleAndPokemon.value = {}
    pendingForms.clear()
    hydrateError.value = null
  }

  return {
    source,
    hydrationStatus,
    pendingHydration,
    lastHydratedAt,
    isHydrated,
    isHydrating,
    hydrateError,
    natures: NATURES,
    moves: movesCatalog,
    items: itemsCatalog,
    getPokemonByMode,
    getPokemon,
    getMove,
    ensureMovesByIds,
    getMoveType,
    getItem,
    getArchetypes,
    getPokemonForms,
    ensurePokemonForms,
    ensureHydrated,
    invalidateHydration,
    hydrateFromApi,
    resetToMock,
  }
})
