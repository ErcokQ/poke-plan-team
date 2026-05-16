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
import type {
  DexAbilityEntry,
  DexAvailabilityFilterKey,
  DexCatalogSnapshot,
  DexChampionsAvailabilitySnapshot,
  DexGenerationSnapshot,
  DexPokemonProfile,
  DexPokemonProfileDetails,
  DexPokemonProfileSummary,
  DexProfileSnapshot,
} from '@/models/dex'
import { NATURES } from '@/utils/team'
import { dexService, type DexCatalogOptions } from '@/services/dex-service'
import { dexSnapshotService } from '@/services/dex-snapshot-service'
import {
  DEX_CACHE_VERSION,
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
import { canonicalizePokemonId } from '@/utils/showdown'

const DEX_SOURCE = String(import.meta.env.VITE_DEX_SOURCE ?? 'snapshot').toLowerCase()
const DEX_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type RuntimeDexSource = 'mock' | 'snapshot' | 'api'
type HydrationStatus = 'idle' | 'loading' | 'ready' | 'error'

const GENERATION_RANGES = [
  { id: 1, start: 1, end: 151 },
  { id: 2, start: 152, end: 251 },
  { id: 3, start: 252, end: 386 },
  { id: 4, start: 387, end: 493 },
  { id: 5, start: 494, end: 649 },
  { id: 6, start: 650, end: 721 },
  { id: 7, start: 722, end: 809 },
  { id: 8, start: 810, end: 905 },
  { id: 9, start: 906, end: 9999 },
] as const

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

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function resolveGenerationId(pokedexNumber: number): number {
  return GENERATION_RANGES.find((range) => pokedexNumber >= range.start && pokedexNumber <= range.end)?.id ?? 9
}

function isMegaLikePokemonId(pokemonId: string): boolean {
  return /(?:-mega(?:-|$)|-primal(?:-|$))/.test(pokemonId)
}

function isGigantamaxPokemonId(pokemonId: string): boolean {
  return /-gmax(?:-|$)/.test(pokemonId)
}

function isTotemPokemonId(pokemonId: string): boolean {
  return /-totem(?:-|$)/.test(pokemonId)
}

function fallbackAbilityEntry(id: string): DexAbilityEntry {
  return {
    id,
    name: titleFromSlug(id),
    shortEffect: '',
    effect: '',
  }
}

function buildMockProfileSummary(
  pokemon: PokemonEntry,
  allPokemon: Map<string, PokemonEntry>,
): DexPokemonProfileSummary {
  return {
    id: pokemon.id,
    pokedexNumber: pokemon.pokedexNumber,
    name: pokemon.name,
    genus: '',
    flavorText: '',
    types: [...pokemon.types],
    abilities: pokemon.abilities.map((abilityId) => ({
      id: abilityId,
      name: titleFromSlug(abilityId),
      isHidden: false,
    })),
    stats: { ...pokemon.baseStats },
    heightMeters: 0,
    weightKg: 0,
    baseExperience: 0,
    captureRate: 0,
    baseHappiness: 0,
    habitat: 'Unknown',
    growthRate: 'Unknown',
    generation: `Generation ${resolveGenerationId(pokemon.pokedexNumber)}`,
    generationId: resolveGenerationId(pokemon.pokedexNumber),
    gameAvailability: ['scarlet-violet', 'sword-shield'],
    eggGroups: [],
    isLegendary: false,
    isMythical: false,
    evolutionChain: (pokemon.evolutionChain ?? [pokemon.id]).map((entryId) => {
      const resolved = allPokemon.get(entryId)
      return {
        id: entryId,
        name: resolved?.name ?? titleFromSlug(entryId),
        pokedexNumber: resolved?.pokedexNumber ?? pokemon.pokedexNumber,
        variants: [],
      }
    }),
    sprites: {
      home: null,
      officialArtwork: null,
      showdown: null,
      default: null,
    },
  }
}

function buildMockProfileDetails(pokemon: PokemonEntry, moveMap: Map<string, MoveEntry>): DexPokemonProfileDetails {
  const moveIds = [...new Set([...(pokemon.learnsetMoves ?? []), ...(pokemon.suggestedMoves ?? [])])].filter(Boolean)
  const moves: DexPokemonProfileDetails['moves'] = []
  for (const moveId of moveIds) {
    const move = moveMap.get(moveId)
    if (!move) continue
    moves.push({
      id: move.id,
      name: move.name,
      category: move.category,
      type: move.type,
      versionGroups: ['scarlet-violet'],
      learnMethods: ['level-up'],
      minLevel: null,
    })
  }

  return {
    id: pokemon.id,
    moves,
  }
}

function mockFormsMap(pokemonEntries: PokemonEntry[]): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const pokemon of pokemonEntries) {
    next[pokemon.id] = [pokemon.id]
  }
  return next
}

export const useDexStore = defineStore('dex', () => {
  const pokemonCatalog = ref<Record<BattleMode, PokemonEntry[]>>(cloneValue(mockPokemonCatalog))
  const movesCatalog = ref<MoveEntry[]>(cloneValue(mockMovesCatalog))
  const itemsCatalog = ref<ItemEntry[]>(cloneValue(mockItemsCatalog))
  const abilitiesCatalog = ref<DexAbilityEntry[]>([])
  const source = ref<RuntimeDexSource>('mock')
  const hydrationStatus = ref<HydrationStatus>('idle')
  const pendingHydration = ref<Promise<void> | null>(null)
  const lastHydratedAt = ref<string | null>(null)
  const hydratedLocale = ref<LocaleCode | null>(null)
  const formsByLocaleAndPokemon = ref<Record<string, string[]>>({})
  const profileSummariesByLocale = ref<Record<LocaleCode, Record<string, DexPokemonProfileSummary>>>({
    es: {},
    en: {},
  })
  const profileDetailsByLocale = ref<Record<LocaleCode, Record<string, DexPokemonProfileDetails>>>({
    es: {},
    en: {},
  })
  const loadedGenerationsByLocale = ref<Record<LocaleCode, Set<number>>>({
    es: new Set<number>(),
    en: new Set<number>(),
  })
  const detailBucketByPokemonIdByLocale = ref<Record<LocaleCode, Record<string, number>>>({
    es: {},
    en: {},
  })
  const championsAvailabilityIds = ref<Set<string>>(new Set())
  const pendingGenerationSnapshots = new Map<string, Promise<void>>()
  const pendingProfileBuckets = new Map<string, Promise<void>>()
  const pendingForms = new Map<string, Promise<PokemonEntry[]>>()
  const pendingMoves = new Map<string, Promise<MoveEntry | null>>()
  const hydrateError = ref<string | null>(null)
  const isHydrating = computed(() => hydrationStatus.value === 'loading')
  const isHydrated = computed(() => hydrationStatus.value === 'ready')

  const moveMap = computed(() => new Map(movesCatalog.value.map((move) => [move.id, move])))
  const itemMap = computed(() => new Map(itemsCatalog.value.map((item) => [item.id, item])))
  const abilityMap = computed(() => new Map(abilitiesCatalog.value.map((ability) => [ability.id, ability])))
  const pokemonMap = computed(() => ({
    vgc: new Map(pokemonCatalog.value.vgc.map((entry) => [entry.id, entry])),
    singles: new Map(pokemonCatalog.value.singles.map((entry) => [entry.id, entry])),
  }))
  const basePokemonIdByPokemonId = computed(() => {
    const byPokedex = new Map<number, PokemonEntry[]>()
    for (const pokemon of pokemonCatalog.value.vgc) {
      const bucket = byPokedex.get(pokemon.pokedexNumber)
      if (bucket) {
        bucket.push(pokemon)
      } else {
        byPokedex.set(pokemon.pokedexNumber, [pokemon])
      }
    }

    const map = new Map<string, string>()
    for (const pokemon of pokemonCatalog.value.vgc) {
      const variants = byPokedex.get(pokemon.pokedexNumber) ?? [pokemon]
      const plainBase = variants.find((entry) => !entry.id.includes('-'))
      map.set(pokemon.id, plainBase?.id ?? variants[0]?.id ?? pokemon.id)
    }
    return map
  })
  const gameAvailabilityByPokemonId = computed<Record<LocaleCode, Map<string, DexAvailabilityFilterKey[]>>>(() => {
    const buildForLocale = (locale: LocaleCode) => {
      const summaryMap = profileSummariesByLocale.value[locale] ?? {}
      const availabilityMap = new Map<string, DexAvailabilityFilterKey[]>()

      for (const pokemon of pokemonCatalog.value.vgc) {
        const basePokemonId = basePokemonIdByPokemonId.value.get(pokemon.id) ?? pokemon.id
        const exactSummaryRaw = summaryMap[pokemon.id]
        const baseSummaryRaw = summaryMap[basePokemonId]
        const exactSummary = exactSummaryRaw ? withAvailabilityOverlay(exactSummaryRaw) : undefined
        const baseSummary = baseSummaryRaw ? withAvailabilityOverlay(baseSummaryRaw) : undefined
        const availability = new Set<DexAvailabilityFilterKey>(
          exactSummary?.gameAvailability ?? baseSummary?.gameAvailability ?? ['scarlet-violet', 'sword-shield'],
        )

        if (isMegaLikePokemonId(pokemon.id) || isTotemPokemonId(pokemon.id)) {
          availability.delete('scarlet-violet')
          availability.delete('sword-shield')
        }

        if (isGigantamaxPokemonId(pokemon.id)) {
          availability.delete('scarlet-violet')
          availability.delete('pokemon-champions')
          availability.add('sword-shield')
        }

        const requiresExactChampionsEntry =
          isMegaLikePokemonId(pokemon.id) || isGigantamaxPokemonId(pokemon.id) || isTotemPokemonId(pokemon.id)
        const supportsChampions = requiresExactChampionsEntry
          ? championsAvailabilityIds.value.has(pokemon.id)
          : availability.has('pokemon-champions') ||
            championsAvailabilityIds.value.has(pokemon.id) ||
            championsAvailabilityIds.value.has(basePokemonId)

        if (supportsChampions) {
          availability.add('pokemon-champions')
        } else if (requiresExactChampionsEntry) {
          availability.delete('pokemon-champions')
        }

        availabilityMap.set(pokemon.id, [...availability])
      }

      return availabilityMap
    }

    return {
      es: buildForLocale('es'),
      en: buildForLocale('en'),
    }
  })

  function loadMockState(locale: LocaleCode) {
    const pokemonById = new Map(
      [...mockPokemonCatalog.vgc, ...mockPokemonCatalog.singles].map((entry) => [entry.id, entry]),
    )
    const mockAbilities = Array.from(
      new Set([...mockPokemonCatalog.vgc, ...mockPokemonCatalog.singles].flatMap((entry) => entry.abilities)),
    ).map((abilityId) => fallbackAbilityEntry(abilityId))
    const moveLookup = new Map(mockMovesCatalog.map((move) => [move.id, move]))
    const summaries = Object.fromEntries(
      [...pokemonById.values()].map((pokemon) => [pokemon.id, buildMockProfileSummary(pokemon, pokemonById)]),
    )
    const details = Object.fromEntries(
      [...pokemonById.values()].map((pokemon) => [pokemon.id, buildMockProfileDetails(pokemon, moveLookup)]),
    )

    pokemonCatalog.value = cloneValue(mockPokemonCatalog)
    movesCatalog.value = cloneValue(mockMovesCatalog)
    itemsCatalog.value = cloneValue(mockItemsCatalog)
    abilitiesCatalog.value = mockAbilities
    formsByLocaleAndPokemon.value = mockFormsMap([...pokemonById.values()])
    profileSummariesByLocale.value = {
      ...profileSummariesByLocale.value,
      [locale]: summaries,
    }
    profileDetailsByLocale.value = {
      ...profileDetailsByLocale.value,
      [locale]: details,
    }
    hydratedLocale.value = locale
    lastHydratedAt.value = new Date().toISOString()
    hydrationStatus.value = 'ready'
    source.value = 'mock'
    hydrateError.value = null
  }

  function applyCatalogSnapshot(snapshot: DexCatalogSnapshot) {
    const pokemon = snapshot.pokemon
      .slice()
      .sort((a, b) => a.pokedexNumber - b.pokedexNumber || a.name.localeCompare(b.name))

    pokemonCatalog.value = {
      vgc: cloneValue(pokemon),
      singles: cloneValue(pokemon),
    }
    movesCatalog.value = cloneValue(snapshot.moves)
    itemsCatalog.value = cloneValue(snapshot.items)
    abilitiesCatalog.value = cloneValue(snapshot.abilities)
    formsByLocaleAndPokemon.value = cloneValue(snapshot.formsByPokemonId)
    profileSummariesByLocale.value = {
      ...profileSummariesByLocale.value,
      [snapshot.locale]: profileSummariesByLocale.value[snapshot.locale] ?? {},
    }
    profileDetailsByLocale.value = {
      ...profileDetailsByLocale.value,
      [snapshot.locale]: profileDetailsByLocale.value[snapshot.locale] ?? {},
    }
    hydratedLocale.value = snapshot.locale
    lastHydratedAt.value = snapshot.generatedAt
    hydrationStatus.value = 'ready'
    source.value = 'snapshot'
    hydrateError.value = null
  }

  function applyGenerationSnapshot(snapshot: DexGenerationSnapshot) {
    profileSummariesByLocale.value = {
      ...profileSummariesByLocale.value,
      [snapshot.locale]: {
        ...(profileSummariesByLocale.value[snapshot.locale] ?? {}),
        ...Object.fromEntries(snapshot.profiles.map((profile) => [profile.id, profile])),
      },
    }
    detailBucketByPokemonIdByLocale.value = {
      ...detailBucketByPokemonIdByLocale.value,
      [snapshot.locale]: {
        ...(detailBucketByPokemonIdByLocale.value[snapshot.locale] ?? {}),
        ...snapshot.detailBucketsByPokemonId,
      },
    }
    loadedGenerationsByLocale.value = {
      ...loadedGenerationsByLocale.value,
      [snapshot.locale]: new Set([...(loadedGenerationsByLocale.value[snapshot.locale] ?? new Set<number>()), snapshot.generationId]),
    }
  }

  function applyChampionsAvailabilitySnapshot(snapshot: DexChampionsAvailabilitySnapshot) {
    championsAvailabilityIds.value = new Set(
      snapshot.entries
        .filter((entry) => entry.availability === 'available' || entry.availability === 'limited')
        .map((entry) => entry.formId ?? entry.pokemonId)
        .filter(Boolean),
    )
  }

  function summarySupportsChampions(summary: DexPokemonProfileSummary): boolean {
    if (championsAvailabilityIds.value.size === 0) return false
    return championsAvailabilityIds.value.has(summary.id)
  }

  function withAvailabilityOverlay(summary: DexPokemonProfileSummary): DexPokemonProfileSummary {
    if (!summarySupportsChampions(summary)) return summary
    if (summary.gameAvailability.includes('pokemon-champions')) return summary

    return {
      ...summary,
      gameAvailability: [...summary.gameAvailability, 'pokemon-champions'],
    }
  }

  async function ensureChampionsAvailabilityLoaded() {
    if (source.value === 'mock' || championsAvailabilityIds.value.size > 0) return

    try {
      const snapshot = await dexSnapshotService.loadChampionsAvailability()
      applyChampionsAvailabilitySnapshot(snapshot)
    } catch {
      championsAvailabilityIds.value = new Set()
    }
  }

  function buildApiProfileSummaries(): Record<string, DexPokemonProfileSummary> {
    const pokemonById = pokemonMap.value.vgc
    return Object.fromEntries(
      pokemonCatalog.value.vgc.map((pokemon) => [pokemon.id, buildMockProfileSummary(pokemon, pokemonById)]),
    ) as Record<string, DexPokemonProfileSummary>
  }

  function getPokemonByMode(mode: BattleMode): PokemonEntry[] {
    return pokemonCatalog.value[mode]
  }

  function getPokemon(mode: BattleMode, id: string): PokemonEntry | undefined {
    const canonicalId = canonicalizePokemonId(id)
    return pokemonMap.value[mode].get(canonicalId || id)
  }

  function getMove(id: string): MoveEntry | undefined {
    return moveMap.value.get(id)
  }

  function getMoveType(id: string): PokemonTypeKey | null {
    return moveMap.value.get(id)?.type ?? null
  }

  function getItem(id: string): ItemEntry | undefined {
    return itemMap.value.get(id)
  }

  function getAbilityMeta(id: string): DexAbilityEntry {
    return abilityMap.value.get(id) ?? fallbackAbilityEntry(id)
  }

  function getArchetypes(mode: BattleMode): ArchetypeEntry[] {
    return mockArchetypeCatalog[mode]
  }

  function getPokemonProfileSummary(id: string, locale: LocaleCode = hydratedLocale.value ?? 'es') {
    const canonicalId = canonicalizePokemonId(id)
    const summary = profileSummariesByLocale.value[locale]?.[canonicalId || id]
    return summary ? withAvailabilityOverlay(summary) : undefined
  }

  function resolveBasePokemonId(pokemonId: string): string | null {
    const pokemon = getPokemon('vgc', pokemonId) ?? getPokemon('singles', pokemonId)
    if (!pokemon) return null

    const candidates = pokemonCatalog.value.vgc.filter((entry) => entry.pokedexNumber === pokemon.pokedexNumber)
    const exactBase = candidates.find((entry) => entry.id === pokemon.id)
    if (exactBase && !exactBase.id.includes('-')) return exactBase.id

    const plainBase = candidates.find((entry) => !entry.id.includes('-'))
    if (plainBase) return plainBase.id

    return candidates[0]?.id ?? pokemon.id
  }

  function getGameAvailabilityForPokemon(
    pokemonId: string,
    locale: LocaleCode = hydratedLocale.value ?? 'es',
  ): DexAvailabilityFilterKey[] {
    return [...(gameAvailabilityByPokemonId.value[locale].get(pokemonId) ?? ['scarlet-violet', 'sword-shield'])]
  }

  function getPokemonProfileDetails(id: string, locale: LocaleCode = hydratedLocale.value ?? 'es') {
    const canonicalId = canonicalizePokemonId(id)
    return profileDetailsByLocale.value[locale]?.[canonicalId || id]
  }

  function getPokemonProfile(id: string, locale: LocaleCode = hydratedLocale.value ?? 'es'): DexPokemonProfile | null {
    const summary = getPokemonProfileSummary(id, locale)
    if (!summary) return null
    const details = getPokemonProfileDetails(id, locale)
    return {
      ...summary,
      moves: details?.moves ?? [],
    }
  }

  function getGenerationEntries(generationId: number, locale: LocaleCode = hydratedLocale.value ?? 'es') {
    const deduped = new Map<number, DexPokemonProfileSummary>()
    for (const entry of Object.values(profileSummariesByLocale.value[locale] ?? {})) {
      if (entry.generationId !== generationId) continue
      if (!deduped.has(entry.pokedexNumber)) {
        deduped.set(entry.pokedexNumber, withAvailabilityOverlay(entry))
      }
    }

    return [...deduped.values()]
      .filter((entry) => entry.generationId === generationId)
      .map((entry) => ({
        id: entry.id,
        pokedexNumber: entry.pokedexNumber,
        name: entry.name,
        types: entry.types,
        gameAvailability: entry.gameAvailability,
        variants:
          entry.evolutionChain.find((link) => link.pokedexNumber === entry.pokedexNumber)?.variants ?? [],
        variantCount:
          entry.evolutionChain.find((link) => link.pokedexNumber === entry.pokedexNumber)?.variants.length ?? 0,
      }))
      .sort((a, b) => a.pokedexNumber - b.pokedexNumber)
  }

  function resolveGenerationIdForPokemon(pokemonId: string): number | null {
    const pokemon = getPokemon('vgc', pokemonId) ?? getPokemon('singles', pokemonId)
    if (!pokemon) return null
    return resolveGenerationId(pokemon.pokedexNumber)
  }

  async function ensureGenerationLoaded(generationId: number, locale: LocaleCode = hydratedLocale.value ?? 'es') {
    if ((loadedGenerationsByLocale.value[locale] ?? new Set<number>()).has(generationId)) return

    if (source.value === 'mock' || source.value === 'api') {
      loadedGenerationsByLocale.value = {
        ...loadedGenerationsByLocale.value,
        [locale]: new Set([...(loadedGenerationsByLocale.value[locale] ?? new Set<number>()), generationId]),
      }
      return
    }

    const cacheKey = makeDexCacheKey(locale, `generation-${generationId}`)
    const pendingKey = `${locale}:${generationId}`
    if (pendingGenerationSnapshots.has(pendingKey)) {
      await pendingGenerationSnapshots.get(pendingKey)
      return
    }

    const task = (async () => {
      const cached = await getCached<DexGenerationSnapshot>(cacheKey)
      let snapshot: DexGenerationSnapshot

      if (isCacheValid(cached)) {
        snapshot = cached.payload
      } else {
        snapshot = await dexSnapshotService.loadGeneration(locale, generationId)
        const envelope: DexCacheEnvelope<DexGenerationSnapshot> = {
          version: DEX_CACHE_VERSION,
          locale,
          createdAt: Date.now(),
          ttlMs: DEX_CACHE_TTL_MS,
          payload: snapshot,
        }
        await setCached(cacheKey, envelope)
      }

      applyGenerationSnapshot(snapshot)
    })()

    pendingGenerationSnapshots.set(pendingKey, task)
    try {
      await task
    } finally {
      pendingGenerationSnapshots.delete(pendingKey)
    }
  }

  async function ensureMovesByIds(moveIds: string[], locale: LocaleCode = hydratedLocale.value ?? 'es') {
    const uniqueMissing = [...new Set(moveIds.filter(Boolean))].filter((id) => !moveMap.value.has(id))
    if (uniqueMissing.length === 0 || source.value !== 'api') return

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

  function getPokemonForms(locale: LocaleCode, pokemonId: string): PokemonEntry[] {
    if (!pokemonId) return []
    const canonicalId = canonicalizePokemonId(pokemonId) || pokemonId
    const ids = formsByLocaleAndPokemon.value[canonicalId] ?? [canonicalId]
    return ids
      .map((id) => getPokemon('vgc', id) ?? getPokemon('singles', id))
      .filter((entry): entry is PokemonEntry => Boolean(entry))
  }

  async function ensurePokemonForms(
    _mode: BattleMode,
    pokemonId: string,
    locale: LocaleCode = hydratedLocale.value ?? 'es',
  ): Promise<PokemonEntry[]> {
    if (!pokemonId) return []
    const cached = getPokemonForms(locale, pokemonId)
    if (cached.length > 0) return cached

    if (source.value !== 'api') {
      const self = getPokemon('vgc', pokemonId) ?? getPokemon('singles', pokemonId)
      return self ? [self] : []
    }

    if (pendingForms.has(pokemonId)) {
      return pendingForms.get(pokemonId)!
    }

    const task = (async () => {
      try {
        const forms = await dexService.loadPokemonForms(pokemonId, locale)
        if (!forms.length) return []
        const byId = new Map(pokemonCatalog.value.vgc.map((entry) => [entry.id, entry]))
        for (const form of forms) {
          byId.set(form.id, form)
        }
        const merged = [...byId.values()].sort((a, b) => a.pokedexNumber - b.pokedexNumber)
        pokemonCatalog.value = { vgc: merged, singles: merged }
        formsByLocaleAndPokemon.value = {
          ...formsByLocaleAndPokemon.value,
          [pokemonId]: forms.map((entry) => entry.id),
          ...Object.fromEntries(forms.map((entry) => [entry.id, forms.map((form) => form.id)])),
        }
        return forms
      } catch {
        return []
      }
    })()

    pendingForms.set(pokemonId, task)
    try {
      return await task
    } finally {
      pendingForms.delete(pokemonId)
    }
  }

  async function ensurePokemonProfileDetails(
    pokemonId: string,
    locale: LocaleCode = hydratedLocale.value ?? 'es',
  ): Promise<DexPokemonProfileDetails | null> {
    let existing = getPokemonProfileDetails(pokemonId, locale)
    if (existing) return existing

    let summary = getPokemonProfileSummary(pokemonId, locale)
    if (!summary) {
      const generationId = resolveGenerationIdForPokemon(pokemonId)
      if (generationId) {
        await ensureGenerationLoaded(generationId, locale)
        summary = getPokemonProfileSummary(pokemonId, locale)
        existing = getPokemonProfileDetails(pokemonId, locale)
        if (existing) return existing
      }
    }
    if (!summary) return null

    if (source.value === 'mock') {
      return profileDetailsByLocale.value[locale]?.[pokemonId] ?? null
    }

    if (source.value === 'api') {
      const full = await dexService.loadPokemonProfile(pokemonId, locale)
      const nextDetail: DexPokemonProfileDetails = {
        id: pokemonId,
        moves: full.moves,
      }
      profileDetailsByLocale.value = {
        ...profileDetailsByLocale.value,
        [locale]: {
          ...(profileDetailsByLocale.value[locale] ?? {}),
          [pokemonId]: nextDetail,
        },
      }
      return nextDetail
    }

    const generationId = summary.generationId
    const bucketId = detailBucketByPokemonIdByLocale.value[locale]?.[pokemonId] ?? 1
    const cacheKey = makeDexCacheKey(locale, `profiles-${generationId}-${bucketId}`)
    const pendingKey = `${locale}:${generationId}:${bucketId}`
    if (pendingProfileBuckets.has(pendingKey)) {
      await pendingProfileBuckets.get(pendingKey)
      return getPokemonProfileDetails(pokemonId, locale) ?? null
    }

    const task = (async () => {
      const cached = await getCached<DexProfileSnapshot>(cacheKey)
      let snapshot: DexProfileSnapshot

      if (isCacheValid(cached)) {
        snapshot = cached.payload
      } else {
        snapshot = await dexSnapshotService.loadProfileBucket(locale, generationId, bucketId)
        const envelope: DexCacheEnvelope<DexProfileSnapshot> = {
          version: DEX_CACHE_VERSION,
          locale,
          createdAt: Date.now(),
          ttlMs: DEX_CACHE_TTL_MS,
          payload: snapshot,
        }
        await setCached(cacheKey, envelope)
      }

      profileDetailsByLocale.value = {
        ...profileDetailsByLocale.value,
        [locale]: {
          ...(profileDetailsByLocale.value[locale] ?? {}),
          ...Object.fromEntries(snapshot.profiles.map((profile) => [profile.id, profile])),
        },
      }
    })()

    pendingProfileBuckets.set(pendingKey, task)
    try {
      await task
    } finally {
      pendingProfileBuckets.delete(pendingKey)
    }

    return getPokemonProfileDetails(pokemonId, locale) ?? null
  }

  async function ensureCatalogLoaded(options: DexCatalogOptions = {}) {
    const locale: LocaleCode = options.locale ?? 'es'
    if (isHydrated.value && hydratedLocale.value === locale) return
    if (pendingHydration.value) {
      await pendingHydration.value
      return
    }

    hydrationStatus.value = 'loading'
    hydrateError.value = null

    const task = (async () => {
      if (DEX_SOURCE === 'mock') {
        loadMockState(locale)
        return
      }

      if (DEX_SOURCE === 'snapshot') {
        const cacheKey = makeDexCacheKey(locale, 'catalog')
        const cached = await getCached<DexCatalogSnapshot>(cacheKey)
        if (isCacheValid(cached)) {
          applyCatalogSnapshot(cached.payload)
          await ensureChampionsAvailabilityLoaded()
          return
        }

        const snapshot = await dexSnapshotService.loadCatalog(locale)
        applyCatalogSnapshot(snapshot)

        const envelope: DexCacheEnvelope<DexCatalogSnapshot> = {
          version: DEX_CACHE_VERSION,
          locale,
          createdAt: Date.now(),
          ttlMs: DEX_CACHE_TTL_MS,
          payload: snapshot,
        }
        await setCached(cacheKey, envelope)
        await ensureChampionsAvailabilityLoaded()
        return
      }

      const [pokemon, moves, items] = await Promise.all([
        dexService.loadPokemonCatalog({ ...options, locale }),
        dexService.loadMovesCatalog({ ...options, locale }),
        dexService.loadItemsCatalog({ ...options, locale }),
      ])

      pokemonCatalog.value = { vgc: pokemon, singles: pokemon }
      movesCatalog.value = moves
      itemsCatalog.value = items
      abilitiesCatalog.value = Array.from(
        new Set(pokemon.flatMap((entry) => entry.abilities)),
      ).map((abilityId) => fallbackAbilityEntry(abilityId))
      formsByLocaleAndPokemon.value = mockFormsMap(pokemon)
      profileSummariesByLocale.value = {
        ...profileSummariesByLocale.value,
        [locale]: buildApiProfileSummaries(),
      }
      profileDetailsByLocale.value = {
        ...profileDetailsByLocale.value,
        [locale]: {},
      }
      source.value = 'api'
      hydratedLocale.value = locale
      lastHydratedAt.value = new Date().toISOString()
      hydrationStatus.value = 'ready'
      await ensureChampionsAvailabilityLoaded()
    })()

    pendingHydration.value = task

    try {
      await task
      hydrationStatus.value = 'ready'
    } catch (error) {
      hydrateError.value = (error as Error).message
      hydrationStatus.value = 'error'
      loadMockState(locale)
    } finally {
      pendingHydration.value = null
    }
  }

  async function ensureHydrated(options: DexCatalogOptions = {}) {
    await ensureCatalogLoaded(options)
  }

  async function hydrateFromApi(options: DexCatalogOptions = {}) {
    await ensureCatalogLoaded(options)
  }

  function invalidateHydration() {
    hydratedLocale.value = null
    lastHydratedAt.value = null
    formsByLocaleAndPokemon.value = {}
    profileSummariesByLocale.value = { es: {}, en: {} }
    profileDetailsByLocale.value = { es: {}, en: {} }
    loadedGenerationsByLocale.value = { es: new Set<number>(), en: new Set<number>() }
    detailBucketByPokemonIdByLocale.value = { es: {}, en: {} }
    championsAvailabilityIds.value = new Set()
    pendingGenerationSnapshots.clear()
    pendingForms.clear()
    pendingMoves.clear()
    pendingProfileBuckets.clear()
    dexSnapshotService.resetCache()
    hydrateError.value = null
    hydrationStatus.value = 'idle'
    pendingHydration.value = null
  }

  function resetToMock() {
    loadMockState(hydratedLocale.value ?? 'es')
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
    abilities: abilitiesCatalog,
    getPokemonByMode,
    getPokemon,
    getMove,
    ensureMovesByIds,
    getMoveType,
    getItem,
    getAbilityMeta,
    getArchetypes,
    getPokemonForms,
    ensurePokemonForms,
    ensureGenerationLoaded,
    getGenerationEntries,
    getPokemonProfileSummary,
    getGameAvailabilityForPokemon,
    getPokemonProfileDetails,
    getPokemonProfile,
    ensurePokemonProfileDetails,
    ensureCatalogLoaded,
    ensureHydrated,
    invalidateHydration,
    hydrateFromApi,
    resetToMock,
  }
})
