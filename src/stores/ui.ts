import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { BattleMode, LocaleCode, MobileTab, PokemonTypeKey } from '@/models/domain'
import type { DexAvailabilityFilterKey } from '@/models/dex'

interface UiPreferences {
  locale: LocaleCode
  mobileTab: MobileTab
  selectedTeamByMode: Record<BattleMode, string>
  selectedSlotByMode: Record<BattleMode, 1 | 2 | 3 | 4 | 5 | 6>
  selectedMoveIndexByMode: Record<BattleMode, 0 | 1 | 2 | 3>
  strategyObservationSourceByMode: Record<BattleMode, 'moves' | 'items' | 'abilities' | 'tera' | 'partners'>
  dexGenerationByMode: Record<BattleMode, number>
  dexTypeFilterByMode: Record<BattleMode, PokemonTypeKey | ''>
  dexAvailabilityFilterByMode: Record<BattleMode, 'all' | DexAvailabilityFilterKey>
  dexMoveFilterByMode: Record<BattleMode, string>
  damageCalcThreatAvailabilityFilterByMode: Record<BattleMode, 'all' | DexAvailabilityFilterKey>
}

export const useUiStore = defineStore('ui', () => {
  const defaults: UiPreferences = {
    locale: 'es',
    mobileTab: 'editor',
    selectedTeamByMode: {
      vgc: '',
      singles: '',
    },
    selectedSlotByMode: {
      vgc: 1,
      singles: 1,
    },
    selectedMoveIndexByMode: {
      vgc: 0,
      singles: 0,
    },
    strategyObservationSourceByMode: {
      vgc: 'moves',
      singles: 'moves',
    },
    dexGenerationByMode: {
      vgc: 1,
      singles: 1,
    },
    dexTypeFilterByMode: {
      vgc: '',
      singles: '',
    },
    dexAvailabilityFilterByMode: {
      vgc: 'all',
      singles: 'all',
    },
    dexMoveFilterByMode: {
      vgc: '',
      singles: '',
    },
    damageCalcThreatAvailabilityFilterByMode: {
      vgc: 'all',
      singles: 'all',
    },
  }

  const preferences = useStorage<UiPreferences>('pokeplan.v1.preferences', defaults)
  const favoritePokemonIds = useStorage<string[]>('pokeplan.v1.favorites', [])
  const builderCatalogSource = useStorage<'pokemon' | 'moves' | 'items' | 'threats'>(
    'pokeplan.v1.builderCatalogSource',
    'moves',
  )

  const lastMode = useStorage<BattleMode>('pokeplan.v1.lastMode', 'vgc')

  function toValidSlot(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
    return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 ? value : 1
  }

  function toValidMoveIndex(value: unknown): 0 | 1 | 2 | 3 {
    return value === 0 || value === 1 || value === 2 || value === 3 ? value : 0
  }

  function sanitizePreferences() {
    const current = (preferences.value ?? {}) as Partial<UiPreferences> & {
      selectedTeamByMode?: Partial<Record<BattleMode, string>>
      selectedSlotByMode?: Partial<Record<BattleMode, number>>
      selectedMoveIndexByMode?: Partial<Record<BattleMode, number>>
      strategyObservationSourceByMode?: Partial<Record<BattleMode, string>>
      dexGenerationByMode?: Partial<Record<BattleMode, number>>
      dexTypeFilterByMode?: Partial<Record<BattleMode, string>>
      dexAvailabilityFilterByMode?: Partial<Record<BattleMode, string>>
      dexMoveFilterByMode?: Partial<Record<BattleMode, string>>
      damageCalcThreatAvailabilityFilterByMode?: Partial<Record<BattleMode, string>>
    }

    preferences.value = {
      locale: current.locale === 'en' ? 'en' : 'es',
      mobileTab:
        current.mobileTab === 'team' || current.mobileTab === 'editor' || current.mobileTab === 'insights'
          ? current.mobileTab
          : 'editor',
      selectedTeamByMode: {
        vgc: current.selectedTeamByMode?.vgc ?? '',
        singles: current.selectedTeamByMode?.singles ?? '',
      },
      selectedSlotByMode: {
        vgc: toValidSlot(current.selectedSlotByMode?.vgc),
        singles: toValidSlot(current.selectedSlotByMode?.singles),
      },
      selectedMoveIndexByMode: {
        vgc: toValidMoveIndex(current.selectedMoveIndexByMode?.vgc),
        singles: toValidMoveIndex(current.selectedMoveIndexByMode?.singles),
      },
      strategyObservationSourceByMode: {
        vgc: toValidStrategyObservationSource(current.strategyObservationSourceByMode?.vgc),
        singles: toValidStrategyObservationSource(current.strategyObservationSourceByMode?.singles),
      },
      dexGenerationByMode: {
        vgc: toValidDexGeneration(current.dexGenerationByMode?.vgc),
        singles: toValidDexGeneration(current.dexGenerationByMode?.singles),
      },
      dexTypeFilterByMode: {
        vgc: toValidDexTypeFilter(current.dexTypeFilterByMode?.vgc),
        singles: toValidDexTypeFilter(current.dexTypeFilterByMode?.singles),
      },
      dexAvailabilityFilterByMode: {
        vgc: toValidDexAvailabilityFilter(current.dexAvailabilityFilterByMode?.vgc),
        singles: toValidDexAvailabilityFilter(current.dexAvailabilityFilterByMode?.singles),
      },
      dexMoveFilterByMode: {
        vgc: toValidDexMoveFilter(current.dexMoveFilterByMode?.vgc),
        singles: toValidDexMoveFilter(current.dexMoveFilterByMode?.singles),
      },
      damageCalcThreatAvailabilityFilterByMode: {
        vgc: toValidDexAvailabilityFilter(current.damageCalcThreatAvailabilityFilterByMode?.vgc),
        singles: toValidDexAvailabilityFilter(current.damageCalcThreatAvailabilityFilterByMode?.singles),
      },
    }

    if (lastMode.value !== 'vgc' && lastMode.value !== 'singles') {
      lastMode.value = 'vgc'
    }

    favoritePokemonIds.value = [...new Set((favoritePokemonIds.value ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0))]
  }

  sanitizePreferences()

  const locale = computed(() => preferences.value.locale)
  const mobileTab = computed(() => preferences.value.mobileTab)

  function setLocale(localeCode: LocaleCode) {
    preferences.value.locale = localeCode
  }

  function setMobileTab(tab: MobileTab) {
    preferences.value.mobileTab = tab
  }

  function setLastMode(mode: BattleMode) {
    lastMode.value = mode
  }

  function setSelectedTeam(mode: BattleMode, teamId: string) {
    preferences.value.selectedTeamByMode[mode] = teamId
  }

  function getSelectedTeam(mode: BattleMode): string {
    return preferences.value.selectedTeamByMode[mode]
  }

  function setSelectedSlot(mode: BattleMode, slot: 1 | 2 | 3 | 4 | 5 | 6) {
    preferences.value.selectedSlotByMode[mode] = slot
  }

  function getSelectedSlot(mode: BattleMode): 1 | 2 | 3 | 4 | 5 | 6 {
    return preferences.value.selectedSlotByMode[mode]
  }

  function setSelectedMoveIndex(mode: BattleMode, index: 0 | 1 | 2 | 3) {
    preferences.value.selectedMoveIndexByMode[mode] = index
  }

  function getSelectedMoveIndex(mode: BattleMode): 0 | 1 | 2 | 3 {
    return preferences.value.selectedMoveIndexByMode[mode]
  }

  function setStrategyObservationSource(mode: BattleMode, source: 'moves' | 'items' | 'abilities' | 'tera' | 'partners') {
    preferences.value.strategyObservationSourceByMode[mode] = toValidStrategyObservationSource(source)
  }

  function getStrategyObservationSource(mode: BattleMode): 'moves' | 'items' | 'abilities' | 'tera' | 'partners' {
    return toValidStrategyObservationSource(preferences.value.strategyObservationSourceByMode[mode])
  }

  function setDexGeneration(mode: BattleMode, generation: number) {
    preferences.value.dexGenerationByMode[mode] = toValidDexGeneration(generation)
  }

  function getDexGeneration(mode: BattleMode): number {
    return toValidDexGeneration(preferences.value.dexGenerationByMode[mode])
  }

  function setDexTypeFilter(mode: BattleMode, filter: PokemonTypeKey | null) {
    preferences.value.dexTypeFilterByMode[mode] = filter ?? ''
  }

  function getDexTypeFilter(mode: BattleMode): PokemonTypeKey | null {
    const value = preferences.value.dexTypeFilterByMode[mode]
    return value ? value : null
  }

  function setDexAvailabilityFilter(mode: BattleMode, filter: 'all' | DexAvailabilityFilterKey) {
    preferences.value.dexAvailabilityFilterByMode[mode] = toValidDexAvailabilityFilter(filter)
  }

  function getDexAvailabilityFilter(mode: BattleMode): 'all' | DexAvailabilityFilterKey {
    return toValidDexAvailabilityFilter(preferences.value.dexAvailabilityFilterByMode[mode])
  }

  function setDexMoveFilter(mode: BattleMode, filter: string) {
    preferences.value.dexMoveFilterByMode[mode] = toValidDexMoveFilter(filter)
  }

  function getDexMoveFilter(mode: BattleMode): string {
    return toValidDexMoveFilter(preferences.value.dexMoveFilterByMode[mode])
  }

  function setDamageCalcThreatAvailabilityFilter(mode: BattleMode, filter: 'all' | DexAvailabilityFilterKey) {
    preferences.value.damageCalcThreatAvailabilityFilterByMode[mode] = toValidDexAvailabilityFilter(filter)
  }

  function getDamageCalcThreatAvailabilityFilter(mode: BattleMode): 'all' | DexAvailabilityFilterKey {
    return toValidDexAvailabilityFilter(preferences.value.damageCalcThreatAvailabilityFilterByMode[mode])
  }

  function getFavoritePokemonIds(): string[] {
    return favoritePokemonIds.value
  }

  function isFavoritePokemon(pokemonId: string): boolean {
    return favoritePokemonIds.value.includes(pokemonId)
  }

  function toggleFavoritePokemon(pokemonId: string) {
    if (!pokemonId) return
    if (favoritePokemonIds.value.includes(pokemonId)) {
      favoritePokemonIds.value = favoritePokemonIds.value.filter((id) => id !== pokemonId)
      return
    }
    favoritePokemonIds.value = [...favoritePokemonIds.value, pokemonId]
  }

  function setBuilderCatalogSource(source: 'pokemon' | 'moves' | 'items' | 'threats') {
    builderCatalogSource.value = source
  }

  return {
    preferences,
    favoritePokemonIds,
    lastMode,
    locale,
    mobileTab,
    setLocale,
    setMobileTab,
    setLastMode,
    setSelectedTeam,
    getSelectedTeam,
    setSelectedSlot,
    getSelectedSlot,
    setSelectedMoveIndex,
    getSelectedMoveIndex,
    setStrategyObservationSource,
    getStrategyObservationSource,
    setDexGeneration,
    getDexGeneration,
    setDexTypeFilter,
    getDexTypeFilter,
    setDexAvailabilityFilter,
    getDexAvailabilityFilter,
    setDexMoveFilter,
    getDexMoveFilter,
    setDamageCalcThreatAvailabilityFilter,
    getDamageCalcThreatAvailabilityFilter,
    getFavoritePokemonIds,
    isFavoritePokemon,
    toggleFavoritePokemon,
    builderCatalogSource,
    setBuilderCatalogSource,
  }
})

function toValidDexGeneration(value: unknown): number {
  return typeof value === 'number' && value >= 1 && value <= 9 ? Math.trunc(value) : 1
}

function toValidDexTypeFilter(value: unknown): PokemonTypeKey | '' {
  const validTypes = new Set<PokemonTypeKey>([
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy',
  ])

  return typeof value === 'string' && validTypes.has(value as PokemonTypeKey) ? (value as PokemonTypeKey) : ''
}

function toValidDexAvailabilityFilter(value: unknown): 'all' | DexAvailabilityFilterKey {
  return value === 'scarlet-violet' ||
    value === 'sword-shield' ||
    value === 'pokemon-champions' ||
    value === 'all'
    ? value
    : 'all'
}

function toValidDexMoveFilter(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 80).trimStart() : ''
}

function toValidStrategyObservationSource(value: unknown): 'moves' | 'items' | 'abilities' | 'tera' | 'partners' {
  return value === 'items' ||
    value === 'abilities' ||
    value === 'tera' ||
    value === 'partners' ||
    value === 'moves'
    ? value
    : 'moves'
}
