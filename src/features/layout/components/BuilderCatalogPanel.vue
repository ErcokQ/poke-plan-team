<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDebounce } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type {
  BattleMode,
  MoveEntry,
  PokemonEntry,
  PokemonTypeKey,
  TeamMember,
  TeamRole,
} from '@/models/domain'
import type { DexAvailabilityFilterKey } from '@/models/dex'
import type { DamageSlotNumber } from '@/models/damage-calc'
import type { PokemonMetaUsage } from '@/models/meta'
import { TEAM_ROLES, TYPE_KEYS } from '@/models/domain'
import { useDexStore } from '@/stores/dex'
import { useDamageCalcStore } from '@/stores/damage-calc'
import { useMetaUsageStore } from '@/stores/meta-usage'
import { useStrategyStore } from '@/stores/strategy'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'
import type { BuilderCatalogSource } from '@/stores/ui'
import { TYPE_META } from '@/models/type-meta'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { moveTypeGradientStyle } from '@/utils/move-type-style'
import {
  getRequiredItemIdForPokemon,
  isItemLockedForPokemon,
  resolveInitialItemIdForPokemon,
} from '@/utils/form-item-rules'
import { getEffectiveLearnsetMoveIds, getPreferredLegalMoves } from '@/utils/move-legality'
import { onPokemonSpriteError, primaryPokemonSpriteUrl } from '@/utils/pokemon-sprite'
import { calculateFavorableSpeedBenchmark, speedComparisonPokemonName } from '@/utils/speed-comparison'

interface PanelMoveEntry {
  id: string
  name: string
  idNorm: string
  nameNorm: string
  effectNorm: string
  type: PokemonTypeKey | null
  category: MoveEntry['category'] | null
  power: number | null
  accuracy: number | null
  pp: number | null
  priority: number
  effect: string
}

interface PanelItemEntry {
  id: string
  name: string
  idNorm: string
  nameNorm: string
  effectNorm: string
  effect: string
}

interface PanelPokemonEntry {
  id: string
  name: string
  idNorm: string
  nameNorm: string
  pokedexNorm: string
  pokedexNumber: number
  types: PokemonTypeKey[]
}

interface RankedPokemonEntry extends PanelPokemonEntry {
  roleSimilarity: number
  primaryTypeMatch: number
  secondaryTypeOverlap: number
  teamComplement: number
  usage: number
  score: number
}

interface ThreatEntry {
  id: string
  name: string
  idNorm: string
  nameNorm: string
  abilityName: string
  abilityNorm: string
  pokedexNumber: number
  types: PokemonTypeKey[]
  availability: DexAvailabilityFilterKey[]
  baseSpeed: number
  usage: number
  offenseBias: 'physical' | 'special' | 'mixed'
  stabPressure: number
  counterPressure: number
  pressureScore: number
  counterPressureScore: number
  usageScore: number
  speedScore: number
  damageChannelScore: number
  reasons: string[]
  score: number
}

interface ChampionsMetaEntry extends PanelPokemonEntry {
  abilityName: string
  abilityNorm: string
  baseSpeed: number
  usage: number
  offenseBias: 'physical' | 'special' | 'mixed'
  rank: number
}

interface SeenThreatEntry {
  id: string
  name: string
  nameNorm: string
  timesSeen: number
  maxSpeed: number
  baseSpeed: number
}

interface TeamComplementContext {
  missingRoles: TeamRole[]
  weaknesses: Record<PokemonTypeKey, number>
}

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const uiStore = useUiStore()
const dexStore = useDexStore()
const damageCalcStore = useDamageCalcStore()
const metaUsageStore = useMetaUsageStore()
const strategyStore = useStrategyStore()
const teamStore = useTeamStore()

const searchRaw = ref('')
const searchDebounced = useDebounce(searchRaw, 160)
const PREVIEW_LIMIT_BY_SOURCE = {
  pokemon: 48,
  items: 120,
  moves: 120,
  threats: 24,
  'seen-threats': 24,
  meta: 50,
} as const
const SEARCH_LIMIT_BY_SOURCE = {
  pokemon: 140,
  items: 260,
  moves: 260,
  threats: 80,
  'seen-threats': 80,
  meta: 120,
} as const
const THREAT_AVAILABILITY_OPTIONS: Array<{
  key: 'all' | DexAvailabilityFilterKey
  short: string
  labelEs: string
  labelEn: string
}> = [
  { key: 'all', short: 'Any', labelEs: 'Cualquier juego', labelEn: 'Any game' },
  { key: 'scarlet-violet', short: 'SV', labelEs: 'Escarlata/Purpura', labelEn: 'Scarlet/Violet' },
  { key: 'sword-shield', short: 'SwSh', labelEs: 'Espada/Escudo', labelEn: 'Sword/Shield' },
  { key: 'pokemon-champions', short: 'CH', labelEs: 'Pokemon Champions', labelEn: 'Pokemon Champions' },
]
const THREAT_AVAILABILITY_PRIORITY: DexAvailabilityFilterKey[] = [
  'pokemon-champions',
  'scarlet-violet',
  'sword-shield',
]
const EMPTY_SLOT_SHORTLIST_LIMIT = 260
const FILLED_SLOT_SHORTLIST_LIMIT = 340
const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const isBuilderRoute = computed(() => route.name === 'builder')
const source = computed(() => uiStore.builderCatalogSource)
const activeTeam = computed(() => teamStore.getActiveTeam(mode.value))
const selectedSlot = computed(() => uiStore.getSelectedSlot(mode.value))
const selectedMoveIndex = computed(() => uiStore.getSelectedMoveIndex(mode.value))
const activeMember = computed(
  () => activeTeam.value.members.find((member) => member.slot === selectedSlot.value) ?? activeTeam.value.members[0],
)

const activePokemon = computed(() => {
  if (!activeMember.value?.pokemonId) return undefined
  return dexStore.getPokemon(mode.value, activeMember.value.pokemonId)
})
const lockedItemId = computed(() => getRequiredItemIdForPokemon(activePokemon.value))
const isItemSelectionLocked = computed(() => isItemLockedForPokemon(activePokemon.value))
const lockedItemLabel = computed(() => {
  if (!lockedItemId.value) return ''
  return dexStore.getItem(lockedItemId.value)?.name ?? prettifySlug(lockedItemId.value)
})

const metaStatus = computed(() => metaUsageStore.getModeStatus(mode.value))
const isMetaLoading = computed(() => metaStatus.value === 'loading' || metaStatus.value === 'idle')
const isMetaFallback = computed(() => metaStatus.value === 'error')
const threatAvailabilityFilter = ref<'all' | DexAvailabilityFilterKey>('all')
const damageCalcTargetSlot = ref<DamageSlotNumber>(1)

watch(
  [mode, isBuilderRoute],
  ([currentMode, onBuilder]) => {
    if (!onBuilder) return
    void metaUsageStore.ensureModeLoaded(currentMode)
  },
  { immediate: true },
)

watch(selectedSlot, (nextSlot, previousSlot) => {
  if (nextSlot === previousSlot) return
  uiStore.setBuilderCatalogSource('pokemon')
  searchRaw.value = ''
})

watch(mode, (nextMode, previousMode) => {
  if (nextMode === previousMode) return
  uiStore.setBuilderCatalogSource('pokemon')
  searchRaw.value = ''
  damageCalcTargetSlot.value = nextMode === 'vgc' ? 1 : 1
})

watch(source, (nextSource, previousSource) => {
  if (nextSource === previousSource) return
  searchRaw.value = ''
})

const previewRoleCache = new Map<string, TeamRole[]>()
const isChampionsMetaMode = computed(() => mode.value === 'vgc')

const teamMembersWithoutCurrentSlot = computed(() =>
  activeTeam.value.members.filter((member) => member.slot !== activeMember.value.slot && member.pokemonId),
)
const duplicateBlockedPokemonIds = computed(() => new Set(teamMembersWithoutCurrentSlot.value.map((member) => member.pokemonId)))
const pokemonCatalog = computed(() => dexStore.getPokemonByMode(mode.value))
const recommendationPokemonCatalog = computed(() => {
  if (!isChampionsMetaMode.value) return pokemonCatalog.value
  const currentPokemonId = activeMember.value?.pokemonId
  return pokemonCatalog.value.filter((pokemon) => {
    if (pokemon.id === currentPokemonId) return true
    return availabilityForPokemon(pokemon.id).includes('pokemon-champions')
  })
})

const pokemonById = computed(() => new Map(pokemonCatalog.value.map((pokemon) => [pokemon.id, pokemon])))
const seenThreatEntries = computed<SeenThreatEntry[]>(() =>
  strategyStore.ensureDraft(mode.value).threatNotes.flatMap((note) => {
    const pokemon = dexStore.getPokemon(mode.value, note.pokemonId)
    if (!pokemon) return []
    const name = speedComparisonPokemonName(pokemon)
    return [{
      id: pokemon.id,
      name,
      nameNorm: normalizeText(name),
      timesSeen: note.timesSeen,
      maxSpeed: calculateFavorableSpeedBenchmark(pokemon),
      baseSpeed: pokemon.baseStats.spe,
    }]
  }).sort((a, b) => b.timesSeen - a.timesSeen || a.name.localeCompare(b.name, localeCode())),
)
const filteredSeenThreats = computed(() => {
  const needle = normalizeText(searchDebounced.value)
  const entries = needle
    ? seenThreatEntries.value.filter((entry) => entry.nameNorm.includes(needle) || entry.id.includes(needle))
    : seenThreatEntries.value
  return applyRenderWindow(entries, Boolean(needle), 'seen-threats')
})
const moveById = computed(() => new Map(dexStore.moves.map((move) => [move.id, move])))
watch([mode, metaStatus, () => pokemonCatalog.value.length], () => {
  previewRoleCache.clear()
})
const usageByPokemonId = computed(() => {
  const map = new Map<string, number>()
  for (const pokemon of recommendationPokemonCatalog.value) {
    const usage = metaUsageStore.getExactPokemonMeta(mode.value, pokemon.id)?.usage ?? 0
    if (usage > 0) map.set(pokemon.id, usage)
  }
  return map
})

const damageCalcScenario = computed(() => damageCalcStore.getScenario(mode.value))
const damageCalcTargetSlotOptions = computed<DamageSlotNumber[]>(() =>
  mode.value === 'vgc' ? ([1, 2, 3, 4] as DamageSlotNumber[]) : ([1, 2, 3, 4, 5, 6] as DamageSlotNumber[]),
)
const damageCalcTargetMember = computed(() => {
  return (
    damageCalcScenario.value.sideB.slots.find((slotSet) => slotSet.slot === damageCalcTargetSlot.value) ?? null
  )
})
const damageCalcTargetPokemonName = computed(() => {
  const pokemonId = damageCalcTargetMember.value?.pokemonId
  if (!pokemonId) return t('common.none')
  return dexStore.getPokemon(mode.value, pokemonId)?.name ?? prettifySlug(pokemonId)
})
const teammateSynergyByCandidate = computed(() => {
  const map = new Map<string, number>()
  const allowedCandidates = new Set(recommendationPokemonCatalog.value.map((pokemon) => pokemon.id))
  const relatedMembers = teamMembersWithoutCurrentSlot.value.filter((member) => member.pokemonId)
  for (const member of relatedMembers) {
    const teammateUsage = metaUsageStore.getPokemonMeta(mode.value, member.pokemonId)
    if (!teammateUsage) continue
    for (const entry of teammateUsage.teammates) {
      if (isChampionsMetaMode.value && !allowedCandidates.has(entry.id)) continue
      map.set(entry.id, (map.get(entry.id) ?? 0) + entry.weight)
    }
  }
  return map
})

const contextualHint = computed(() => {
  if (source.value === 'items' && !activePokemon.value) return t('builder.catalogItemsNeedPokemon')
  if (source.value === 'moves' && !activePokemon.value) return t('builder.catalogMovesNeedPokemon')
  if (source.value === 'threats' && !activePokemon.value) return t('builder.catalogThreatsNeedPokemon')
  if (source.value === 'meta') return t('builder.catalogMetaHint')
  if (source.value === 'seen-threats') return t('builder.catalogSeenThreatsHint')
  if (source.value === 'pokemon' && !activePokemon.value) return t('builder.catalogPokemonHintEmpty')
  if (source.value === 'pokemon' && activePokemon.value) return t('builder.catalogPokemonHintFilled')
  if (source.value === 'threats' && activePokemon.value) return t('builder.catalogThreatsHint')
  return ''
})

watch(source, (nextSource, previousSource) => {
  if (nextSource === previousSource) return
  if (nextSource === 'threats') {
    threatAvailabilityFilter.value = preferredThreatAvailability()
    const preferredSlot = damageCalcScenario.value.selectedPair.defenderSlot
    if (damageCalcTargetSlotOptions.value.includes(preferredSlot)) {
      damageCalcTargetSlot.value = preferredSlot
      return
    }
    damageCalcTargetSlot.value = damageCalcTargetSlotOptions.value[0] ?? 1
    return
  }
  threatAvailabilityFilter.value = 'all'
})

const metaStatusText = computed(() => {
  if (!isBuilderRoute.value) return ''
  if (isMetaFallback.value) return t('builder.catalogMetaFallback')
  if (isMetaLoading.value) return t('builder.catalogMetaLoading')
  return t('builder.catalogMetaReady')
})

const moveEntries = computed<PanelMoveEntry[]>(() => {
  if (!activePokemon.value) return []
  const allowedIds = allowedMoveIds(activePokemon.value, activeMember.value)

  return allowedIds
    .map((moveId) => {
      const move = moveById.value.get(moveId)
      if (!move) {
        const fallbackName = prettifySlug(moveId)
        return {
          id: moveId,
          name: fallbackName,
          idNorm: normalizeText(moveId),
          nameNorm: normalizeText(fallbackName),
          effectNorm: '',
          type: null,
          category: null,
          power: null,
          accuracy: null,
          pp: null,
          priority: 0,
          effect: '',
        } satisfies PanelMoveEntry
      }
      return {
        id: move.id,
        name: move.name,
        idNorm: normalizeText(move.id),
        nameNorm: normalizeText(move.name),
        effectNorm: normalizeText(move.description || move.effect || ''),
        type: move.type,
        category: move.category,
        power: move.power > 0 ? move.power : null,
        accuracy: move.accuracy ?? null,
        pp: move.pp ?? null,
        priority: move.priority ?? 0,
        effect: move.description || move.effect || '',
      } satisfies PanelMoveEntry
    })
    .sort((a, b) => a.name.localeCompare(b.name, localeCode()))
})

const moveIdsForActiveMember = computed<string[]>(() => {
  if (!activePokemon.value) return []
  return allowedMoveIds(activePokemon.value, activeMember.value)
})

watch(
  [moveIdsForActiveMember, () => locale.value],
  ([ids]) => {
    if (!ids.length) return
    const missing = ids.filter((moveId) => !moveById.value.has(moveId))
    if (!missing.length) return
    void dexStore.ensureMovesByIds(missing, localeCode())
  },
  { immediate: true },
)

const itemEntries = computed<PanelItemEntry[]>(() => {
  return dexStore.items
    .filter((item) => mode.value !== 'vgc' || item.championsAvailable !== false)
    .map((item) => ({
      id: item.id,
      name: item.name,
      idNorm: normalizeText(item.id),
      nameNorm: normalizeText(item.name),
      effectNorm: normalizeText(item.description || item.effect || ''),
      effect: item.description || item.effect || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, localeCode()))
})

const rankedItemEntries = computed<PanelItemEntry[]>(() => {
  const activePokemonEntry = activePokemon.value
  if (!activePokemonEntry) return itemEntries.value

  const fallbackRanking = rankingFromOrderedIds(activePokemonEntry.suggestedItems ?? [])
  const rankedByMeta = rankingFromWeightedIds(effectivePokemonMeta(activePokemonEntry)?.items ?? [])

  return [...itemEntries.value].sort((a, b) => {
    const rankCompare = compareRankedIds(a.id, b.id, rankedByMeta, fallbackRanking)
    if (rankCompare !== 0) return rankCompare
    return a.name.localeCompare(b.name, localeCode())
  })
})

const filteredItems = computed(() => {
  const needle = normalizeText(searchDebounced.value)
  if (!needle) return applyRenderWindow(rankedItemEntries.value, false, 'items')
  const filtered = rankedItemEntries.value.filter(
    (item) => item.nameNorm.includes(needle) || item.idNorm.includes(needle) || item.effectNorm.includes(needle),
  )
  return applyRenderWindow(filtered, true, 'items')
})

const rankedMoveEntries = computed<PanelMoveEntry[]>(() => {
  if (!activePokemon.value) return []

  const fallbackRanking = rankingFromOrderedIds(activePokemon.value.suggestedMoves ?? [])
  const rankedByMeta = rankingFromWeightedIds(effectivePokemonMeta(activePokemon.value)?.moves ?? [])

  return [...moveEntries.value].sort((a, b) => {
    const rankCompare = compareRankedIds(a.id, b.id, rankedByMeta, fallbackRanking)
    if (rankCompare !== 0) return rankCompare
    return a.name.localeCompare(b.name, localeCode())
  })
})

const filteredMoves = computed(() => {
  const needle = normalizeText(searchDebounced.value)
  if (!needle) return applyRenderWindow(rankedMoveEntries.value, false, 'moves')
  const filtered = rankedMoveEntries.value.filter(
    (move) => move.nameNorm.includes(needle) || move.idNorm.includes(needle) || move.effectNorm.includes(needle),
  )
  return applyRenderWindow(filtered, true, 'moves')
})

function availabilityForPokemon(pokemonId: string): DexAvailabilityFilterKey[] {
  return dexStore.getGameAvailabilityForPokemon(pokemonId, localeCode())
}

function isTechnicalThreatForm(pokemonId: string): boolean {
  return /(?:low-power-mode|drive-mode|aquatic-mode|glide-mode|limited-build|sprinting-build|swimming-build|gliding-build)$/.test(
    pokemonId,
  )
}

function threatAvailabilityLabel(filter: 'all' | DexAvailabilityFilterKey): string {
  const option = THREAT_AVAILABILITY_OPTIONS.find((entry) => entry.key === filter)
  if (!option) return filter
  return locale.value === 'es' ? option.labelEs : option.labelEn
}

function preferredThreatAvailability(): 'all' | DexAvailabilityFilterKey {
  if (!activePokemon.value) return 'all'
  const availability = availabilityForPokemon(activePokemon.value.id)
  return THREAT_AVAILABILITY_PRIORITY.find((key) => availability.includes(key)) ?? 'all'
}

function emptyDamageEvs() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function maxDamageIvs() {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
}

const scoredThreatEntries = computed<ThreatEntry[]>(() => {
  const defender = activePokemon.value
  if (!defender) return []

  const rawThreats = recommendationPokemonCatalog.value
    .filter((pokemon) => pokemon.id !== defender.id && !isTechnicalThreatForm(pokemon.id))
    .map((pokemon) => {
      const stabPressure = Math.max(
        ...pokemon.types.map((type) => effectivenessAgainstDual(type, defender.types[0], defender.types[1])),
      )
      const counterPressure = Math.max(
        ...defender.types.map((type) => effectivenessAgainstDual(type, pokemon.types[0], pokemon.types[1])),
      )
      const usage = usageValue(pokemon.id)
      return {
        pokemon,
        stabPressure,
        counterPressure,
        usage,
      }
    })
    .filter((entry) => entry.stabPressure > 1 || entry.usage > 0)
  const maxUsage = Math.max(0, ...rawThreats.map((entry) => entry.usage))
  const defenderSpeed = Math.max(1, defender.baseStats.spe)
  const entries: ThreatEntry[] = []

  for (const { pokemon, stabPressure, counterPressure, usage } of rawThreats) {

    const offenseBias =
      pokemon.baseStats.atk - pokemon.baseStats.spa >= 20
        ? 'physical'
        : pokemon.baseStats.spa - pokemon.baseStats.atk >= 20
          ? 'special'
          : 'mixed'
    const abilityName = dexStore.getAbilityMeta(pokemon.abilities[0] ?? '').name
    const reasons: string[] = []

    if (stabPressure >= 4) {
      reasons.push(t('builder.threatReasonQuad'))
    } else if (stabPressure > 1) {
      reasons.push(t('builder.threatReasonSuper'))
    }
    if (pokemon.baseStats.spe > defender.baseStats.spe) {
      reasons.push(t('builder.threatReasonFast'))
    }
    if (isHighMetaUsage(usage)) {
      reasons.push(t('builder.threatReasonMeta'))
    }

    const pressureScore = threatEffectivenessScore(stabPressure)
    const counterPressureScore = threatEffectivenessScore(counterPressure)
    const usageScore =
      isChampionsMetaMode.value && maxUsage > 0 ? Math.min(1, usage / maxUsage) : normalizedUsageScore(usage)
    const speedScore =
      pokemon.baseStats.spe > defenderSpeed
        ? Math.min(1, 0.55 + (pokemon.baseStats.spe - defenderSpeed) / 80)
        : Math.min(0.45, (pokemon.baseStats.spe / defenderSpeed) * 0.35)
    const offenseScore = Math.min(1, Math.max(pokemon.baseStats.atk, pokemon.baseStats.spa) / 170)
    const damageChannelScore = offensiveChannelScore(pokemon, defender, offenseBias)
    const championsMetaFloor = isChampionsMetaMode.value && isHighMetaUsage(usage) ? 0.08 : 0
    const counterPenalty = isChampionsMetaMode.value ? counterPressureScore * 0.18 : 0
    const score = isChampionsMetaMode.value
      ? Math.max(
          0,
          usageScore * 0.38 +
            pressureScore * 0.22 +
            speedScore * 0.17 +
            damageChannelScore * 0.13 +
            offenseScore * 0.1 +
            championsMetaFloor -
            counterPenalty,
        )
      : pressureScore * 0.5 + usageScore * 0.22 + speedScore * 0.18 + offenseScore * 0.1
    const displayName = displayPokemonName(pokemon.id, pokemon.name)

    entries.push({
      id: pokemon.id,
      name: displayName,
      idNorm: normalizeText(pokemon.id),
      nameNorm: normalizeText(displayName),
      abilityName,
      abilityNorm: normalizeText(abilityName),
      pokedexNumber: pokemon.pokedexNumber,
      types: pokemon.types,
      availability: availabilityForPokemon(pokemon.id),
      baseSpeed: pokemon.baseStats.spe,
      usage,
      offenseBias,
      stabPressure,
      counterPressure,
      pressureScore,
      counterPressureScore,
      usageScore,
      speedScore,
      damageChannelScore,
      reasons,
      score,
    })
  }

  return entries.sort((a, b) => {
    if (isChampionsMetaMode.value) {
      return (
        b.score - a.score ||
        b.usage - a.usage ||
        a.counterPressureScore - b.counterPressureScore ||
        b.speedScore - a.speedScore ||
        b.pressureScore - a.pressureScore ||
        b.damageChannelScore - a.damageChannelScore ||
        b.baseSpeed - a.baseSpeed ||
        a.name.localeCompare(b.name, localeCode())
      )
    }

    return (
      b.score - a.score ||
      b.stabPressure - a.stabPressure ||
      b.usage - a.usage ||
      b.baseSpeed - a.baseSpeed ||
      a.name.localeCompare(b.name, localeCode())
    )
  })
})

const rankedThreatEntries = computed<ThreatEntry[]>(() => {
  const selectedAvailability =
    threatAvailabilityFilter.value === 'all' ? null : threatAvailabilityFilter.value
  const availabilityFiltered = selectedAvailability
    ? scoredThreatEntries.value.filter((entry) => entry.availability.includes(selectedAvailability))
    : scoredThreatEntries.value

  const deduped = new Map<number, ThreatEntry>()
  for (const entry of availabilityFiltered) {
    const current = deduped.get(entry.pokedexNumber)
    if (!current) {
      deduped.set(entry.pokedexNumber, entry)
      continue
    }

    const currentIsTechnical = isTechnicalThreatForm(current.id)
    const nextIsTechnical = isTechnicalThreatForm(entry.id)
    if (!nextIsTechnical && currentIsTechnical) {
      deduped.set(entry.pokedexNumber, entry)
      continue
    }
    if (nextIsTechnical && !currentIsTechnical) {
      continue
    }
    if (entry.score > current.score || (entry.score === current.score && entry.usage > current.usage)) {
      deduped.set(entry.pokedexNumber, entry)
    }
  }

  return [...deduped.values()]
})

const filteredThreats = computed(() => {
  const needle = normalizeText(searchDebounced.value)
  if (!needle) return applyRenderWindow(rankedThreatEntries.value, false, 'threats')
  const filtered = rankedThreatEntries.value.filter(
    (entry) =>
      entry.nameNorm.includes(needle) ||
      entry.idNorm.includes(needle) ||
      entry.abilityNorm.includes(needle),
  )
  return applyRenderWindow(filtered, true, 'threats')
})

const championsMetaEntries = computed<ChampionsMetaEntry[]>(() => {
  if (!isChampionsMetaMode.value) return []

  return recommendationPokemonCatalog.value
    .map((pokemon) => {
      const usage = usageValue(pokemon.id)
      if (usage <= 0) return null
      const displayName = displayPokemonName(pokemon.id, pokemon.name)
      const offenseBias =
        pokemon.baseStats.atk - pokemon.baseStats.spa >= 20
          ? 'physical'
          : pokemon.baseStats.spa - pokemon.baseStats.atk >= 20
            ? 'special'
            : 'mixed'
      const abilityName = dexStore.getAbilityMeta(pokemon.abilities[0] ?? '').name

      return {
        id: pokemon.id,
        name: displayName,
        idNorm: normalizeText(pokemon.id),
        nameNorm: normalizeText(displayName),
        pokedexNorm: String(pokemon.pokedexNumber),
        pokedexNumber: pokemon.pokedexNumber,
        types: pokemon.types,
        abilityName,
        abilityNorm: normalizeText(abilityName),
        baseSpeed: pokemon.baseStats.spe,
        usage,
        offenseBias,
        rank: 0,
      } satisfies ChampionsMetaEntry
    })
    .filter((entry): entry is ChampionsMetaEntry => entry !== null)
    .sort((a, b) => b.usage - a.usage || b.baseSpeed - a.baseSpeed || a.name.localeCompare(b.name, localeCode()))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
})

const filteredChampionsMeta = computed(() => {
  const needle = normalizeText(searchDebounced.value)
  if (!needle) return applyRenderWindow(championsMetaEntries.value, false, 'meta')
  const filtered = championsMetaEntries.value.filter(
    (entry) =>
      entry.nameNorm.includes(needle) ||
      entry.idNorm.includes(needle) ||
      entry.pokedexNorm.includes(needle) ||
      entry.abilityNorm.includes(needle),
  )
  return applyRenderWindow(filtered, true, 'meta')
})

const rankedPokemonEntries = computed<RankedPokemonEntry[]>(() => {
  const optimizeForPreview = !normalizeText(searchDebounced.value)
  if (activePokemon.value) {
    return rankPokemonForFilledSlot(activePokemon.value, optimizeForPreview)
  }

  return rankPokemonForEmptySlot(optimizeForPreview)
})

const filteredPokemon = computed<RankedPokemonEntry[]>(() => {
  const needle = normalizeText(searchDebounced.value)
  const ranked = rankedPokemonEntries.value

  if (!needle) {
    if (!activePokemon.value) return applyRenderWindow(ranked.slice(0, 12), false, 'pokemon')
    return applyRenderWindow(ranked, false, 'pokemon')
  }

  const filtered = ranked.filter(
    (pokemon) =>
      pokemon.nameNorm.includes(needle) ||
      pokemon.idNorm.includes(needle) ||
      pokemon.pokedexNorm.includes(needle),
  )
  return applyRenderWindow(filtered, true, 'pokemon')
})

const panelTitle = computed(() =>
  source.value === 'items'
    ? t('builder.catalogPanelItems')
    : source.value === 'pokemon'
      ? t('builder.catalogPanelPokemon')
      : source.value === 'threats'
        ? t('builder.catalogPanelThreats')
        : source.value === 'seen-threats'
          ? t('builder.catalogPanelSeenThreats')
        : source.value === 'meta'
          ? t('builder.catalogPanelMeta')
          : t('builder.catalogPanelMoves'),
)

const searchPlaceholder = computed(() =>
  source.value === 'items'
    ? t('builder.catalogSearchItems')
    : source.value === 'pokemon'
      ? t('builder.catalogSearchPokemon')
      : source.value === 'threats'
        ? t('builder.catalogSearchThreats')
        : source.value === 'seen-threats'
          ? t('builder.catalogSearchSeenThreats')
        : source.value === 'meta'
          ? t('builder.catalogSearchMeta')
          : t('builder.catalogSearchMoves'),
)

function prettifySlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function applyRenderWindow<T>(
  entries: T[],
  isSearchActive: boolean,
  sourceKind: BuilderCatalogSource,
): T[] {
  const limit = isSearchActive ? SEARCH_LIMIT_BY_SOURCE[sourceKind] : PREVIEW_LIMIT_BY_SOURCE[sourceKind]
  return entries.slice(0, limit)
}

function localeCode(): 'es' | 'en' {
  return locale.value === 'es' ? 'es' : 'en'
}

function typeLabel(type: PokemonTypeKey): string {
  return locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en
}

function moveSurfaceStyle(type: PokemonTypeKey | null) {
  return moveTypeGradientStyle(type)
}

function categoryLabel(category: MoveEntry['category'] | null): string {
  if (category === 'physical') return t('builder.moveCategoryPhysical')
  if (category === 'special') return t('builder.moveCategorySpecial')
  if (category === 'status') return t('builder.moveCategoryStatus')
  return '-'
}

function statLabel(value: number | null, suffix = ''): string {
  if (value == null) return '-'
  return `${value}${suffix}`
}

function priorityLabel(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

function threatOffenseBiasLabel(bias: ThreatEntry['offenseBias']): string {
  if (bias === 'physical') return t('builder.threatBiasPhysical')
  if (bias === 'special') return t('builder.threatBiasSpecial')
  return t('builder.threatBiasMixed')
}

function usagePercentLabel(usage: number): string {
  if (!Number.isFinite(usage) || usage <= 0) return '0%'
  const normalized = usage <= 1 ? usage * 100 : usage
  return `${normalized.toFixed(2)}%`
}

function spriteUrl(pokemonId: string): string {
  return primaryPokemonSpriteUrl(pokemonId)
}

function formSuffixFromPokemonId(pokemonId: string): string {
  if (!pokemonId.includes('-')) return ''
  const suffixParts = pokemonId.split('-').slice(1)
  if (!suffixParts.length) return ''

  const [head, ...tail] = suffixParts
  if (head === 'mega') {
    return tail.length
      ? `Mega ${tail.map((part) => prettifySlug(part)).join(' ')}`
      : 'Mega'
  }
  if (head === 'gmax') return 'Gmax'
  if (head === 'alola' || head === 'galar' || head === 'hisui' || head === 'paldea') {
    const region = prettifySlug(head)
    const rest = tail.map((part) => prettifySlug(part)).join(' ')
    return rest ? `${region} ${rest}` : region
  }
  return suffixParts.map((part) => prettifySlug(part)).join(' ')
}

function displayPokemonName(pokemonId: string, baseName: string): string {
  const suffix = formSuffixFromPokemonId(pokemonId)
  return suffix ? `${baseName} (${suffix})` : baseName
}

function preferredItemForPokemon(pokemon: PokemonEntry | undefined): string {
  if (!pokemon) return ''
  const required = getRequiredItemIdForPokemon(pokemon)
  if (required) return required
  const ranked = effectivePokemonMeta(pokemon)?.items ?? []
  const metaItem = ranked.find((entry) => {
    const item = dexStore.getItem(entry.id)
    return item && (mode.value !== 'vgc' || item.championsAvailable !== false)
  })
  return metaItem?.id ?? resolveInitialItemIdForPokemon(pokemon)
}

let pokemonSelectionRequest = 0
async function applyPokemonSelection(pokemonId: string) {
  if (!pokemonId) return
  const requestId = ++pokemonSelectionRequest
  const selectedMode = mode.value
  const selectedSlot = activeMember.value.slot
  await metaUsageStore.ensureModeLoaded(selectedMode)
  if (requestId !== pokemonSelectionRequest || mode.value !== selectedMode || activeMember.value.slot !== selectedSlot) return
  uiStore.setBuilderCatalogSource('pokemon')
  const pokemon = dexStore.getPokemon(mode.value, pokemonId)
  const suggestedMoves = pokemon ? preferredMovesForPokemon(pokemon) : ['', '', '', '']

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    pokemonId,
    abilityId: pokemon?.abilities[0] ?? '',
    itemId: preferredItemForPokemon(pokemon),
    natureId: pokemon?.defaultNature ?? activeMember.value.natureId,
    moves: [
      suggestedMoves[0],
      suggestedMoves[1],
      suggestedMoves[2],
      suggestedMoves[3],
    ],
    roleTags: pokemon ? resolveRoleTagsForSet(suggestedMoves, pokemon.roleTags, pokemon) : [],
  })

  if (isItemLockedForPokemon(pokemon)) {
    uiStore.setBuilderCatalogSource('items')
  }
}

function applyItemSelection(itemId: string) {
  if (isItemSelectionLocked.value) return
  uiStore.setBuilderCatalogSource('items')
  teamStore.updateMember(mode.value, activeMember.value.slot, { itemId })
}

function resolveMoveTargetIndex(moveId: string): 0 | 1 | 2 | 3 {
  const currentMoves = [...activeMember.value.moves]
  const focusedIndex = selectedMoveIndex.value

  if (!currentMoves[focusedIndex] || currentMoves[focusedIndex] === moveId) {
    return focusedIndex
  }

  const existingIndex = currentMoves.findIndex((entry) => entry === moveId)
  if (existingIndex >= 0) return existingIndex as 0 | 1 | 2 | 3

  const emptyIndex = currentMoves.findIndex((entry) => !entry)
  if (emptyIndex >= 0) return emptyIndex as 0 | 1 | 2 | 3

  return focusedIndex
}

function applyMoveSelection(moveId: string) {
  if (!moveId || !activePokemon.value) return

  uiStore.setBuilderCatalogSource('moves')
  const targetIndex = resolveMoveTargetIndex(moveId)
  const moves = [...activeMember.value.moves]
  moves[targetIndex] = moveId
  uiStore.setSelectedMoveIndex(mode.value, targetIndex)

  const nextMoves: [string, string, string, string] = [
    moves[0] ?? '',
    moves[1] ?? '',
    moves[2] ?? '',
    moves[3] ?? '',
  ]
  teamStore.updateMember(mode.value, activeMember.value.slot, {
    moves: nextMoves,
    roleTags: resolveRoleTagsForSet(nextMoves, activePokemon.value.roleTags, activePokemon.value),
  })
}

async function addThreatToDamageCalc(pokemonId: string) {
  const pokemon = dexStore.getPokemon(mode.value, pokemonId)
  if (!pokemon) return

  const slot = damageCalcTargetSlot.value
  const level = mode.value === 'vgc' ? 50 : 100

  damageCalcStore.initFromBuilder(mode.value)
  damageCalcStore.updateSlotSet(mode.value, 'B', slot, {
    pokemonId,
    abilityId: pokemon.abilities[0] ?? '',
    itemId: resolveInitialItemIdForPokemon(pokemon),
    natureId: pokemon.defaultNature || 'jolly',
    teraType: pokemon.types[0],
    isTeraActive: false,
    moves: ['', '', '', ''],
    evs: emptyDamageEvs(),
    ivs: maxDamageIvs(),
    level,
    currentHpPercent: 100,
    status: 'healthy',
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  })

  await damageCalcStore.applyBenchmark(mode.value, 'B', slot)

  if (getRequiredItemIdForPokemon(pokemon)) {
    damageCalcStore.updateSlotSet(mode.value, 'B', slot, {
      itemId: resolveInitialItemIdForPokemon(pokemon),
    })
  }

  damageCalcStore.setSelectedPair(mode.value, 'A', activeMember.value.slot, slot)
  uiStore.setSelectedSlot(mode.value, activeMember.value.slot)
  await router.push({ name: 'damage-calc', params: { mode: mode.value } })
}

function rankingFromWeightedIds(entries: Array<{ id: string; weight: number }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of entries) {
    map.set(entry.id, entry.weight)
  }
  return map
}

function rankingFromOrderedIds(ids: string[]): Map<string, number> {
  const map = new Map<string, number>()
  const total = ids.length
  ids.forEach((id, index) => {
    map.set(id, Math.max(0, total - index))
  })
  return map
}

function effectivePokemonMeta(pokemon: PokemonEntry): PokemonMetaUsage | undefined {
  const candidates = new Set<string>([pokemon.id])
  for (const form of dexStore.getPokemonForms(localeCode(), pokemon.id)) {
    candidates.add(form.id)
  }

  let best: PokemonMetaUsage | undefined
  for (const pokemonId of candidates) {
    const meta = metaUsageStore.getPokemonMeta(mode.value, pokemonId)
    if (!meta) continue
    if (!best || meta.usage > best.usage) best = meta
  }
  return best
}

function compareRankedIds(
  aId: string,
  bId: string,
  ranked: Map<string, number>,
  fallback: Map<string, number>,
): number {
  const aRank = ranked.get(aId) ?? 0
  const bRank = ranked.get(bId) ?? 0
  if (aRank !== bRank) return bRank - aRank

  const aFallback = fallback.get(aId) ?? 0
  const bFallback = fallback.get(bId) ?? 0
  if (aFallback !== bFallback) return bFallback - aFallback

  return 0
}

const PIVOT_MOVE_IDS = new Set(['u-turn', 'volt-switch', 'flip-turn', 'parting-shot', 'teleport', 'baton-pass'])
const SUPPORT_MOVE_IDS = new Set([
  'helping-hand',
  'fake-out',
  'follow-me',
  'rage-powder',
  'tailwind',
  'light-screen',
  'reflect',
  'aurora-veil',
  'wide-guard',
  'quick-guard',
  'ally-switch',
  'encore',
  'taunt',
  'will-o-wisp',
  'thunder-wave',
  'snarl',
  'haze',
  'spore',
  'sleep-powder',
  'yawn',
  'trick-room',
  'icy-wind',
  'electroweb',
  'bulldoze',
  'string-shot',
  'quash',
])
const SPEED_CONTROL_MOVE_IDS = new Set([
  'tailwind',
  'trick-room',
  'thunder-wave',
  'icy-wind',
  'electroweb',
  'bulldoze',
  'string-shot',
  'quash',
])
const WALL_MOVE_IDS = new Set([
  'recover',
  'roost',
  'slack-off',
  'soft-boiled',
  'wish',
  'leech-seed',
  'iron-defense',
  'amnesia',
])
const SWEEPER_SETUP_MOVE_IDS = new Set([
  'swords-dance',
  'nasty-plot',
  'dragon-dance',
  'quiver-dance',
  'shell-smash',
  'belly-drum',
  'bulk-up',
  'agility',
  'calm-mind',
])

function uniqueRoles(roles: TeamRole[]): TeamRole[] {
  return [...new Set(roles)]
}

function isBulkyProfile(pokemon?: PokemonEntry): boolean {
  if (!pokemon) return false
  const { hp, def, spd } = pokemon.baseStats
  return (hp >= 95 && (def >= 95 || spd >= 95)) || def + spd >= 230
}

function inferRolesFromMoves(moveIds: string[], pokemon?: PokemonEntry): TeamRole[] {
  const nonEmptyMoves = moveIds.filter(Boolean)
  const roles = new Set<TeamRole>()

  const supportCount = nonEmptyMoves.filter((moveId) => SUPPORT_MOVE_IDS.has(moveId)).length
  const speedControlCount = nonEmptyMoves.filter((moveId) => SPEED_CONTROL_MOVE_IDS.has(moveId)).length
  const wallCount = nonEmptyMoves.filter((moveId) => WALL_MOVE_IDS.has(moveId)).length

  if (nonEmptyMoves.some((moveId) => PIVOT_MOVE_IDS.has(moveId))) roles.add('pivot')
  if (speedControlCount > 0) roles.add('speed-control')

  let damagingMoves = 0
  let setupMoves = 0
  for (const moveId of nonEmptyMoves) {
    const move = moveById.value.get(moveId)
    if (move?.category && move.category !== 'status') damagingMoves += 1
    if (SWEEPER_SETUP_MOVE_IDS.has(moveId)) setupMoves += 1
  }

  if (supportCount >= 2 || (supportCount >= 1 && damagingMoves <= 2)) {
    roles.add('support')
  }

  if (
    isBulkyProfile(pokemon) &&
    (wallCount >= 2 || (wallCount >= 1 && damagingMoves <= 2 && setupMoves === 0))
  ) {
    roles.add('wall')
  }

  if (damagingMoves >= 3 || setupMoves > 0) roles.add('sweeper')
  return [...roles]
}

function resolveRoleTagsForSet(
  moveIds: string[],
  baseRoles: TeamRole[],
  pokemon?: PokemonEntry,
): TeamRole[] {
  const nonEmptyMoves = moveIds.filter(Boolean)
  if (nonEmptyMoves.length === 0) {
    const seeded = uniqueRoles(baseRoles ?? [])
    if (seeded.length > 0) return seeded
    if (pokemon && isBulkyProfile(pokemon)) return ['wall']
    return ['support']
  }

  const inferred = uniqueRoles(inferRolesFromMoves(nonEmptyMoves, pokemon))
  if (inferred.length > 0) return inferred

  if (pokemon) {
    if (Math.max(pokemon.baseStats.atk, pokemon.baseStats.spa) >= 115) return ['sweeper']
    if (isBulkyProfile(pokemon)) return ['wall']
  }
  return ['support']
}

function preferredMovesForPokemon(pokemon: PokemonEntry): [string, string, string, string] {
  return getPreferredLegalMoves(
    pokemon,
    (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
    (effectivePokemonMeta(pokemon)?.moves ?? []).map((entry) => entry.id),
  )
}

function previewMovesForRoleRanking(pokemon: PokemonEntry): string[] {
  const metaTop = (effectivePokemonMeta(pokemon)?.moves ?? [])
    .slice(0, 4)
    .map((entry) => entry.id)
    .filter(Boolean)
  if (metaTop.length > 0) return metaTop
  return pokemon.suggestedMoves.slice(0, 4)
}

function candidateRolesForRanking(pokemon: PokemonEntry): TeamRole[] {
  const cacheKey = `${mode.value}:${metaStatus.value}:${pokemon.id}`
  const cached = previewRoleCache.get(cacheKey)
  if (cached) return cached

  const resolved = resolveRoleTagsForSet(
    previewMovesForRoleRanking(pokemon),
    pokemon.roleTags,
    pokemon,
  )
  previewRoleCache.set(cacheKey, resolved)
  return resolved
}

function allowedMoveIds(pokemon: PokemonEntry, member: TeamMember): string[] {
  const effectiveLearnset = getEffectiveLearnsetMoveIds(
    pokemon,
    (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
  )
  const basePool = effectiveLearnset.length > 0 ? effectiveLearnset : pokemon.suggestedMoves ?? []
  return [...new Set([...basePool, ...member.moves.filter(Boolean)])]
}

function memberRoles(member: TeamMember): TeamRole[] {
  const dexPokemon = member.pokemonId ? pokemonById.value.get(member.pokemonId) : undefined
  const baseRoles = member.roleTags.length > 0 ? member.roleTags : (dexPokemon?.roleTags ?? [])
  return resolveRoleTagsForSet(member.moves, baseRoles, dexPokemon)
}

function memberTypes(member: TeamMember): PokemonTypeKey[] {
  if (member.teraType) return [member.teraType]
  const dexPokemon = member.pokemonId ? pokemonById.value.get(member.pokemonId) : undefined
  return dexPokemon?.types ?? ['normal']
}

function weaknessBucketForMembers(members: TeamMember[]): Record<PokemonTypeKey, number> {
  const bucket = Object.fromEntries(TYPE_KEYS.map((type) => [type, 0])) as Record<PokemonTypeKey, number>
  for (const member of members) {
    const [typeA, typeB] = memberTypes(member)
    for (const attackType of TYPE_KEYS) {
      const factor = effectivenessAgainstDual(attackType, typeA, typeB)
      if (factor > 1) bucket[attackType] += 1
    }
  }
  return bucket
}

function buildTeamComplementContext(baseMembers: TeamMember[]): TeamComplementContext {
  const existingRoles = new Set<TeamRole>()
  for (const member of baseMembers) {
    memberRoles(member).forEach((role) => existingRoles.add(role))
  }
  return {
    missingRoles: TEAM_ROLES.filter((role) => !existingRoles.has(role)),
    weaknesses: weaknessBucketForMembers(baseMembers),
  }
}

function teamComplementScore(
  candidate: PokemonEntry,
  context: TeamComplementContext,
  candidateRoles: TeamRole[],
): number {
  const roleHits = candidateRoles.filter((role) => context.missingRoles.includes(role)).length
  const roleScore =
    context.missingRoles.length > 0
      ? roleHits / context.missingRoles.length
      : candidateRoles.length > 0
        ? Math.min(1, candidateRoles.length / TEAM_ROLES.length)
        : 0.5

  let resistanceBonus = 0
  let penalty = 0
  const [candidateTypeA, candidateTypeB] = candidate.types

  for (const attackType of TYPE_KEYS) {
    const pressure = context.weaknesses[attackType]
    if (pressure <= 0) continue

    const factor = effectivenessAgainstDual(attackType, candidateTypeA, candidateTypeB)
    if (factor < 1) {
      resistanceBonus += pressure
      if (factor === 0) resistanceBonus += 0.35 * pressure
    } else if (factor > 1) {
      penalty += pressure * Math.min(2, factor)
    }
  }

  const typeScore = resistanceBonus + penalty > 0 ? resistanceBonus / (resistanceBonus + penalty) : 0.5

  return roleScore * 0.55 + typeScore * 0.45
}

function teammateSynergyRaw(candidateId: string): number {
  return teammateSynergyByCandidate.value.get(candidateId) ?? 0
}

function usageValue(pokemonId: string): number {
  return usageByPokemonId.value.get(pokemonId) ?? 0
}

function normalizedUsageScore(usage: number): number {
  if (!Number.isFinite(usage) || usage <= 0) return 0
  return usage <= 1 ? Math.min(1, usage) : Math.min(1, usage / 25)
}

function isHighMetaUsage(usage: number): boolean {
  return usage <= 1 ? usage >= 0.08 : usage >= 8
}

function threatEffectivenessScore(effectiveness: number): number {
  if (effectiveness >= 4) return 1
  if (effectiveness > 1) return 0.72
  if (effectiveness === 1) return 0.25
  return 0
}

function offensiveChannelScore(
  attacker: PokemonEntry,
  defender: PokemonEntry,
  bias: ThreatEntry['offenseBias'],
): number {
  const attackerStat =
    bias === 'physical'
      ? attacker.baseStats.atk
      : bias === 'special'
        ? attacker.baseStats.spa
        : Math.max(attacker.baseStats.atk, attacker.baseStats.spa)
  const defenderStat =
    bias === 'physical'
      ? defender.baseStats.def
      : bias === 'special'
        ? defender.baseStats.spd
        : Math.min(defender.baseStats.def, defender.baseStats.spd)
  const ratio = attackerStat / Math.max(1, defenderStat)

  return Math.min(1, Math.max(0, (ratio - 0.55) / 0.95))
}

function toRankedPokemonEntry(
  pokemon: PokemonEntry,
  roleSimilarity = 0,
  primaryTypeMatch = 0,
  secondaryTypeOverlap = 0,
  teamComplement = 0,
  usage = 0,
  score = 0,
): RankedPokemonEntry {
  return {
    id: pokemon.id,
    name: pokemon.name,
    idNorm: normalizeText(pokemon.id),
    nameNorm: normalizeText(pokemon.name),
    pokedexNorm: String(pokemon.pokedexNumber),
    pokedexNumber: pokemon.pokedexNumber,
    types: pokemon.types,
    roleSimilarity,
    primaryTypeMatch,
    secondaryTypeOverlap,
    teamComplement,
    usage,
    score,
  }
}

function rankPokemonForEmptySlot(optimizeForPreview = false): RankedPokemonEntry[] {
  const blocked = duplicateBlockedPokemonIds.value
  let candidates = recommendationPokemonCatalog.value.filter((pokemon) => !blocked.has(pokemon.id))
  if (candidates.length === 0) return []

  if (optimizeForPreview && candidates.length > EMPTY_SLOT_SHORTLIST_LIMIT) {
    candidates = [...candidates]
      .sort((a, b) => usageValue(b.id) - usageValue(a.id) || a.name.localeCompare(b.name, localeCode()))
      .slice(0, EMPTY_SLOT_SHORTLIST_LIMIT)
  }

  const baseMembers = teamMembersWithoutCurrentSlot.value
  const context = buildTeamComplementContext(baseMembers)
  const raw = candidates.map((pokemon) => {
    const teammateSynergy = teammateSynergyRaw(pokemon.id)
    const candidateRoles = candidateRolesForRanking(pokemon)
    const teamComplement = teamComplementScore(pokemon, context, candidateRoles)
    const usage = usageValue(pokemon.id)
    return {
      pokemon,
      teammateSynergy,
      teamComplement,
      usage,
    }
  })

  const maxSynergy = Math.max(1, ...raw.map((entry) => entry.teammateSynergy))
  const maxUsage = Math.max(1, ...raw.map((entry) => entry.usage))

  return raw
    .map((entry) => {
      const teammateSynergy = entry.teammateSynergy / maxSynergy
      const usage = entry.usage / maxUsage
      const score = isChampionsMetaMode.value
        ? teammateSynergy * 0.55 + usage * 0.3 + entry.teamComplement * 0.15
        : teammateSynergy * 0.5 + entry.teamComplement * 0.3 + usage * 0.2
      return toRankedPokemonEntry(
        entry.pokemon,
        0,
        0,
        0,
        entry.teamComplement,
        entry.usage,
        score,
      )
    })
    .sort((a, b) => b.score - a.score || b.usage - a.usage || a.name.localeCompare(b.name, localeCode()))
}

function roleSimilarity(candidateRoles: TeamRole[], targetRoles: TeamRole[]): number {
  if (!targetRoles.length || !candidateRoles.length) return 0
  const targetSet = new Set(targetRoles)
  const overlap = candidateRoles.filter((role) => targetSet.has(role)).length
  return overlap / targetSet.size
}

function typeOverlap(candidate: PokemonEntry, target: PokemonEntry): { primary: number; secondary: number } {
  const primary = candidate.types[0] === target.types[0] ? 1 : 0
  const targetSecondary = target.types[1]
  if (!targetSecondary) return { primary, secondary: 0 }
  const secondary = candidate.types.includes(targetSecondary) ? 1 : 0
  return { primary, secondary }
}

function rankPokemonForFilledSlot(targetPokemon: PokemonEntry, optimizeForPreview = false): RankedPokemonEntry[] {
  const blocked = duplicateBlockedPokemonIds.value
  const allowedCurrentId = activeMember.value.pokemonId
  let candidates = recommendationPokemonCatalog.value.filter((pokemon) => {
    if (pokemon.id === allowedCurrentId) return true
    return !blocked.has(pokemon.id)
  })

  const baseMembers = teamMembersWithoutCurrentSlot.value
  const context = buildTeamComplementContext(baseMembers)
  const targetRoles = memberRoles(activeMember.value)

  if (optimizeForPreview && candidates.length > FILLED_SLOT_SHORTLIST_LIMIT) {
    const targetTypeSet = new Set(targetPokemon.types)
    const targetRoleSet = new Set(targetRoles)
    const preferredIds = new Set<string>()
    for (const pokemon of candidates) {
      if (pokemon.id === allowedCurrentId) {
        preferredIds.add(pokemon.id)
        continue
      }
      const hasTypeOverlap = pokemon.types.some((type) => targetTypeSet.has(type))
      const hasRoleOverlap = pokemon.roleTags.some((role) => targetRoleSet.has(role))
      if (hasTypeOverlap || hasRoleOverlap) {
        preferredIds.add(pokemon.id)
      }
    }

    const preferred = candidates.filter((pokemon) => preferredIds.has(pokemon.id))
    const rest = candidates
      .filter((pokemon) => !preferredIds.has(pokemon.id))
      .sort((a, b) => usageValue(b.id) - usageValue(a.id) || a.name.localeCompare(b.name, localeCode()))

    candidates = [...preferred, ...rest].slice(0, FILLED_SLOT_SHORTLIST_LIMIT)
  }

  const raw = candidates.map((pokemon) => {
    const candidateRoles = candidateRolesForRanking(pokemon)
    const roleScore = roleSimilarity(candidateRoles, targetRoles)
    const typeScores = typeOverlap(pokemon, targetPokemon)
    const complement = teamComplementScore(pokemon, context, candidateRoles)
    const usage = usageValue(pokemon.id)
    const teammateSynergy = teammateSynergyRaw(pokemon.id)
    return {
      entry: toRankedPokemonEntry(
        pokemon,
        roleScore,
        typeScores.primary,
        typeScores.secondary,
        complement,
        usage,
        0,
      ),
      teammateSynergy,
    }
  })

  const maxSynergy = Math.max(1, ...raw.map((entry) => entry.teammateSynergy))
  const maxUsage = Math.max(1, ...raw.map((entry) => entry.entry.usage))

  return raw
    .map(({ entry, teammateSynergy }) => {
      if (!isChampionsMetaMode.value) return entry
      const synergyScore = teammateSynergy / maxSynergy
      const usageScore = entry.usage / maxUsage
      return {
        ...entry,
        score:
          synergyScore * 0.4 +
          entry.teamComplement * 0.25 +
          usageScore * 0.2 +
          entry.roleSimilarity * 0.1 +
          entry.primaryTypeMatch * 0.05,
      }
    })
    .sort(
      (a, b) =>
        (isChampionsMetaMode.value ? b.score - a.score : 0) ||
        b.roleSimilarity - a.roleSimilarity ||
        b.primaryTypeMatch - a.primaryTypeMatch ||
        b.secondaryTypeOverlap - a.secondaryTypeOverlap ||
        b.teamComplement - a.teamComplement ||
        b.usage - a.usage ||
        a.name.localeCompare(b.name, localeCode()),
    )
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col rounded-2xl border border-sky-500/25 bg-off-black/70 p-3">
    <div class="shrink-0">
      <h2 class="text-sm font-semibold text-sky-300">{{ panelTitle }}</h2>
      <p class="mt-1 text-[11px] text-gray-400">{{ t('builder.catalogPanelHint') }}</p>
      <p
        v-if="metaStatusText && source !== 'seen-threats'"
        class="mt-1 text-[11px]"
        :class="isMetaFallback ? 'text-amber-300' : isMetaLoading ? 'text-sky-300' : 'text-emerald-300'"
      >
        {{ metaStatusText }}
      </p>
      <p v-if="contextualHint" class="mt-1 text-[11px] text-gray-400">
        {{ contextualHint }}
      </p>
      <div v-if="mode === 'vgc' && isBuilderRoute" class="mt-2 flex justify-end">
        <button
          type="button"
          class="rounded-md border px-2 py-1 text-[10px] font-semibold transition"
          :class="
            source === 'meta'
              ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100'
              : 'border-cyan-500/35 bg-off-black/60 text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-500/10'
          "
          @click="uiStore.setBuilderCatalogSource('meta')"
        >
          {{ t('builder.metaTopButton') }}
        </button>
      </div>
    </div>

    <template v-if="isBuilderRoute">
      <input
        v-model="searchRaw"
        type="text"
        class="mt-3 w-full shrink-0 rounded-md border border-gray-700 bg-st-black px-2 py-1.5 text-xs"
        :placeholder="searchPlaceholder"
      />

      <div v-if="source === 'threats'" class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="option in THREAT_AVAILABILITY_OPTIONS"
          :key="`threat-game-${option.key}`"
          type="button"
          class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition"
          :class="
            threatAvailabilityFilter === option.key
              ? 'border-sky-500/60 bg-sky-500/15 text-sky-100'
              : 'border-gray-700 bg-off-black/70 text-gray-300 hover:border-sky-500/35'
          "
          :title="threatAvailabilityLabel(option.key)"
          @click="threatAvailabilityFilter = option.key"
        >
          <span class="font-semibold">{{ option.short }}</span>
        </button>
      </div>

      <div v-if="source === 'threats'" class="mt-2 rounded-lg border border-gray-700 bg-black/30 px-3 py-2">
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-gray-300">{{ t('builder.threatCalcTargetLabel') }}</span>
          <select
            v-model.number="damageCalcTargetSlot"
            class="rounded-md border border-gray-700 bg-off-black/80 px-2 py-1 text-[11px] text-gray-100"
          >
            <option
              v-for="slot in damageCalcTargetSlotOptions"
              :key="`threat-calc-slot-${slot}`"
              :value="slot"
            >
              {{ t('common.slot', { slot }) }}
            </option>
          </select>
          <div class="ml-auto flex min-w-0 items-center gap-2 text-[11px]">
            <span class="text-gray-400">{{ t('builder.threatCalcSlotCurrentLabel', { slot: damageCalcTargetSlot }) }}</span>
            <img
              :src="damageCalcTargetMember?.pokemonId ? spriteUrl(damageCalcTargetMember.pokemonId) : spriteUrl('mudkip')"
              :alt="damageCalcTargetPokemonName"
              :data-sprite-id="damageCalcTargetMember?.pokemonId || 'mudkip'"
              :data-sprite-fallback-index="0"
              class="h-4 w-4 shrink-0 object-contain"
              @error="onPokemonSpriteError"
            />
            <span class="truncate text-gray-100">{{ damageCalcTargetPokemonName }}</span>
            <span class="shrink-0 text-gray-500">{{ t('builder.threatCalcSlotWillReplace') }}</span>
          </div>
        </div>
      </div>

      <div class="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <template v-if="source === 'items'">
          <div v-if="isItemSelectionLocked" class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            <p class="font-semibold">{{ t('builder.itemLockedByForm', { item: lockedItemLabel }) }}</p>
            <p class="mt-1 text-gray-300">{{ t('builder.itemLockedHint') }}</p>
          </div>
          <button
            v-for="item in filteredItems"
            :key="`item-${item.id}`"
            type="button"
            class="w-full rounded-lg border p-2 text-left transition"
            :class="
              activeMember.itemId === item.id
                ? 'border-sky-500/70 bg-sky-500/15'
                : isItemSelectionLocked
                  ? 'cursor-not-allowed border-gray-700/70 bg-st-black/35 opacity-70'
                  : 'cursor-pointer border-gray-700 bg-st-black/55 hover:border-sky-500/40'
            "
            :disabled="isItemSelectionLocked"
            @click="applyItemSelection(item.id)"
          >
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-gray-100">{{ item.name }}</p>
              <p class="mt-1 text-[11px] text-gray-400">{{ item.effect || t('builder.noItemDescription') }}</p>
            </div>
          </button>
          <p v-if="filteredItems.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogNoResults') }}</p>
        </template>

        <template v-else-if="source === 'pokemon'">
          <button
            v-for="pokemon in filteredPokemon"
            :key="`pokemon-${pokemon.id}`"
            type="button"
            class="w-full rounded-lg border p-2 text-left transition cursor-pointer"
            :class="activeMember.pokemonId === pokemon.id ? 'border-sky-500/70 bg-sky-500/15' : 'border-gray-700 bg-st-black/55 hover:border-sky-500/40'"
            @click="applyPokemonSelection(pokemon.id)"
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold text-gray-100">
                  #{{ String(pokemon.pokedexNumber).padStart(4, '0') }} {{ displayPokemonName(pokemon.id, pokemon.name) }}
                </p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="type in pokemon.types"
                    :key="`type-${pokemon.id}-${type}`"
                    class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300"
                  >
                    <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-3 w-3" />
                    {{ typeLabel(type) }}
                  </span>
                </div>
              </div>
            </div>
          </button>
          <p v-if="filteredPokemon.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogNoResults') }}</p>
        </template>

        <template v-else-if="source === 'meta'">
          <article
            v-for="pokemon in filteredChampionsMeta"
            :key="`meta-${pokemon.id}`"
            class="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-2"
          >
            <div class="flex items-start gap-2">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/30 text-[11px] font-bold text-cyan-100">
                #{{ pokemon.rank }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-xs font-semibold text-gray-100">
                      #{{ String(pokemon.pokedexNumber).padStart(4, '0') }} {{ pokemon.name }}
                    </p>
                    <p class="mt-0.5 text-[11px] text-cyan-200">
                      {{ t('builder.metaUsageLabel') }} {{ usagePercentLabel(pokemon.usage) }}
                    </p>
                  </div>
                  <span class="rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300">
                    {{ t('builder.threatBaseSpeed') }} {{ pokemon.baseSpeed }}
                  </span>
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="type in pokemon.types"
                    :key="`meta-type-${pokemon.id}-${type}`"
                    class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300"
                  >
                    <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-3 w-3" />
                    {{ typeLabel(type) }}
                  </span>
                  <span class="rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300">
                    {{ threatOffenseBiasLabel(pokemon.offenseBias) }}
                  </span>
                </div>
                <div class="mt-2 flex justify-end">
                  <button
                    type="button"
                    class="rounded-md border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-500/25"
                    @click="applyPokemonSelection(pokemon.id)"
                  >
                    {{ t('builder.metaAddToSlotButton') }}
                  </button>
                </div>
              </div>
            </div>
          </article>
          <p v-if="mode !== 'vgc'" class="text-xs text-gray-500">{{ t('builder.catalogMetaVgcOnly') }}</p>
          <p v-else-if="filteredChampionsMeta.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogNoResults') }}</p>
        </template>

        <template v-else-if="source === 'seen-threats'">
          <article
            v-for="threat in filteredSeenThreats"
            :key="`seen-threat-${threat.id}`"
            class="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2"
          >
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold text-gray-100">{{ threat.name }}</p>
                <p class="text-[11px] text-gray-400">{{ t('strategy.timesSeenShort', { count: threat.timesSeen }) }}</p>
              </div>
              <div class="shrink-0 text-right text-[11px]">
                <p class="font-semibold text-amber-100">{{ t('builder.seenThreatMaxSpeed', { speed: threat.maxSpeed }) }}</p>
                <p class="text-gray-400">{{ t('builder.threatBaseSpeed') }} {{ threat.baseSpeed }}</p>
              </div>
            </div>
          </article>
          <p v-if="seenThreatEntries.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogSeenThreatsEmpty') }}</p>
          <p v-else-if="filteredSeenThreats.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogNoResults') }}</p>
        </template>

        <template v-else-if="source === 'threats'">
          <article
            v-for="threat in filteredThreats"
            :key="`threat-${threat.id}`"
            class="rounded-lg border border-gray-700 bg-st-black/55 p-2"
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-xs font-semibold text-gray-100">
                    #{{ String(threat.pokedexNumber).padStart(4, '0') }} {{ threat.name }}
                  </p>
                  <span class="rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300">
                    {{ t('builder.threatBaseSpeed') }} {{ threat.baseSpeed }}
                  </span>
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="type in threat.types"
                    :key="`threat-type-${threat.id}-${type}`"
                    class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300"
                  >
                    <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-3 w-3" />
                    {{ typeLabel(type) }}
                  </span>
                  <span class="rounded border border-gray-700 bg-off-black/70 px-1 py-0.5 text-[10px] text-gray-300">
                    {{ threatOffenseBiasLabel(threat.offenseBias) }}
                  </span>
                </div>
                <p class="mt-1 text-[11px] text-gray-300">
                  <span class="font-semibold text-gray-200">{{ t('builder.threatAbility') }}:</span>
                  {{ threat.abilityName }}
                </p>
                <p v-if="threat.reasons.length > 0" class="mt-1 text-[11px] text-gray-400">
                  {{ threat.reasons.join(' · ') }}
                </p>
                <div class="mt-2 flex justify-end">
                  <button
                    type="button"
                    class="rounded-md border border-sky-500/50 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-100 transition hover:border-sky-400 hover:bg-sky-500/25"
                    @click="addThreatToDamageCalc(threat.id)"
                  >
                    {{ t('builder.threatAddToCalcButton', { slot: damageCalcTargetSlot }) }}
                  </button>
                </div>
              </div>
            </div>
          </article>
          <p v-if="!activePokemon" class="text-xs text-gray-500">{{ t('builder.catalogThreatsNeedPokemon') }}</p>
          <p v-else-if="filteredThreats.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogNoResults') }}</p>
        </template>

        <template v-else>
          <button
            v-for="move in filteredMoves"
            :key="`move-${move.id}`"
            type="button"
            class="w-full rounded-lg border p-2 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            :class="activeMember.moves.includes(move.id) ? 'border-sky-500/70 bg-sky-500/15' : 'border-gray-700 bg-st-black/55 hover:border-sky-500/40'"
            :style="moveSurfaceStyle(move.type)"
            :disabled="!activePokemon"
            @click="applyMoveSelection(move.id)"
          >
            <div class="flex items-start gap-2">
              <img
                v-if="move.type"
                :src="TYPE_META[move.type].icon"
                :alt="typeLabel(move.type)"
                class="mt-0.5 h-4 w-4 shrink-0 object-contain"
              />
              <div v-else class="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-gray-700 bg-off-black/70" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-xs font-semibold text-gray-100">{{ move.name }}</p>
                  <div class="flex items-center gap-1 text-[10px] text-gray-300">
                    <span v-if="move.type" class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5">
                      {{ typeLabel(move.type) }}
                    </span>
                    <span class="rounded border border-gray-700 bg-off-black/70 px-1 py-0.5">
                      {{ categoryLabel(move.category) }}
                    </span>
                  </div>
                </div>
                <p class="mt-1 font-mono text-[10px] text-gray-400">
                  {{ t('builder.movePowerShort') }} {{ statLabel(move.power) }} |
                  {{ t('builder.moveAccuracyShort') }} {{ statLabel(move.accuracy, '%') }} |
                  {{ t('builder.movePpShort') }} {{ statLabel(move.pp) }}
                  <template v-if="move.priority !== 0">
                    | {{ t('builder.movePriorityShort') }} {{ priorityLabel(move.priority) }}
                  </template>
                </p>
                <p class="mt-1 text-[11px] text-gray-400">{{ move.effect || t('builder.noMoveDescription') }}</p>
              </div>
            </div>
          </button>
          <p v-if="!activePokemon" class="text-xs text-gray-500">{{ t('builder.catalogMovesNeedPokemon') }}</p>
          <p v-else-if="filteredMoves.length === 0" class="text-xs text-gray-500">{{ t('builder.catalogNoResults') }}</p>
        </template>
      </div>
    </template>

    <p v-else class="mt-3 text-xs text-gray-500">{{ t('builder.catalogNeedsBuilder') }}</p>
  </section>
</template>
