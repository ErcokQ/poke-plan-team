import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { BattleMode, LocaleCode, MobileTab } from '@/models/domain'

interface UiPreferences {
  locale: LocaleCode
  mobileTab: MobileTab
  selectedTeamByMode: Record<BattleMode, string>
  selectedSlotByMode: Record<BattleMode, 1 | 2 | 3 | 4 | 5 | 6>
  selectedMoveIndexByMode: Record<BattleMode, 0 | 1 | 2 | 3>
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
  }

  const preferences = useStorage<UiPreferences>('pokeplan.v1.preferences', defaults)
  const favoritePokemonIds = useStorage<string[]>('pokeplan.v1.favorites', [])
  const builderCatalogSource = useStorage<'pokemon' | 'moves' | 'items'>(
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

  function setBuilderCatalogSource(source: 'pokemon' | 'moves' | 'items') {
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
    getFavoritePokemonIds,
    isFavoritePokemon,
    toggleFavoritePokemon,
    builderCatalogSource,
    setBuilderCatalogSource,
  }
})
