<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'
import movePhysicalSeal from '@/assets/pokesprite/misc/seals/home/move-physical.png'
import moveSpecialSeal from '@/assets/pokesprite/misc/seals/home/move-special.png'
import moveStatusSeal from '@/assets/pokesprite/misc/seals/home/move-status.png'
import {
  MAX_EV_PER_STAT,
  MAX_IV_PER_STAT,
  MAX_EVS,
  STATS,
  TEAM_ROLES,
  TYPE_KEYS,
  type BattleMode,
  type LocaleCode,
  type MoveEntry,
  type PokemonEntry,
  type StatKey,
  type TeamRole,
} from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { dexService } from '@/services/dex-service'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDexStore } from '@/stores/dex'
import { useMetaUsageStore } from '@/stores/meta-usage'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'
import TeamSlotPicker from '@/features/shared/components/TeamSlotPicker.vue'
import SearchableSelect from '@/features/shared/components/SearchableSelect.vue'
import { memberIsComplete } from '@/utils/team'
import { calculateTeamAnalytics } from '@/utils/analytics'
import { calculateBattleStats, getNatureModifier } from '@/utils/stat-calc'
import { getEffectiveLearnsetMoveIds } from '@/utils/move-legality'

const route = useRoute()
const { t, locale } = useI18n()
const analyticsStore = useAnalyticsStore()
const teamStore = useTeamStore()
const dexStore = useDexStore()
const metaUsageStore = useMetaUsageStore()
const uiStore = useUiStore()

interface SearchOption {
  value: string
  label: string
  meta?: {
    type?: (typeof TYPE_KEYS)[number]
    category?: MoveEntry['category']
    power?: number | null
    accuracy?: number | null
    pp?: number | null
    effect?: string
    priority?: number
  }
}

interface CompareDraft {
  pokemonId: string
  abilityId: string
  itemId: string
  natureId: string
  evs: Record<StatKey, number>
  ivs: Record<StatKey, number>
  moves: [string, string, string, string]
}

const NATURE_LABELS: Record<string, { es: string; en: string }> = {
  adamant: { es: 'Firme', en: 'Adamant' },
  jolly: { es: 'Alegre', en: 'Jolly' },
  timid: { es: 'Miedosa', en: 'Timid' },
  modest: { es: 'Modesta', en: 'Modest' },
  careful: { es: 'Cauta', en: 'Careful' },
  bold: { es: 'Osada', en: 'Bold' },
  calm: { es: 'Serena', en: 'Calm' },
  impish: { es: 'Agitada', en: 'Impish' },
  sassy: { es: 'Grosera', en: 'Sassy' },
  naive: { es: 'Ingenua', en: 'Naive' },
}

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const team = computed(() => teamStore.getActiveTeam(mode.value))
const battleLevel = ref(50)
const pokemonOptions = computed(() => dexStore.getPokemonByMode(mode.value))
const favoritePokemonOptions = computed(() => {
  const favoriteIds = new Set(uiStore.getFavoritePokemonIds())
  return pokemonOptions.value.filter((pokemon) => favoriteIds.has(pokemon.id))
})
const pokemonSelectOptions = computed<SearchOption[]>(() =>
  pokemonOptions.value.map((pokemon) => ({
    value: pokemon.id,
    label: `#${String(pokemon.pokedexNumber).padStart(4, '0')} ${pokemon.name}`,
  })),
)
const formSelectOptions = ref<SearchOption[]>([])
const isLoadingFormOptions = ref(false)
let formOptionsRequest = 0
const selectedSlot = computed<1 | 2 | 3 | 4 | 5 | 6>({
  get: () => uiStore.getSelectedSlot(mode.value),
  set: (slot) => uiStore.setSelectedSlot(mode.value, slot),
})
const showCompareModal = ref(false)
const comparePokemonId = ref('')
const compareDraft = ref<CompareDraft>({
  pokemonId: '',
  abilityId: '',
  itemId: '',
  natureId: 'jolly',
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  moves: ['', '', '', ''],
})

const activeMember = computed(() => {
  return team.value.members.find((member) => member.slot === selectedSlot.value) ?? team.value.members[0]
})

const activePokemon = computed(() => {
  if (!activeMember.value?.pokemonId) return undefined
  return dexStore.getPokemon(mode.value, activeMember.value.pokemonId)
})
const comparePokemon = computed(() => {
  if (!comparePokemonId.value) return undefined
  return dexStore.getPokemon(mode.value, comparePokemonId.value)
})
const comparePokemonOptions = computed<SearchOption[]>(() =>
  pokemonSelectOptions.value
    .filter((option) => option.value !== activeMember.value.pokemonId)
    .sort((a, b) => a.label.localeCompare(b.label, localeCode())),
)
const abilityLabels = ref<Record<string, string>>({})
const abilityEffects = ref<Record<string, string>>({})
const abilityMetaCache = new Map<string, { name: string; effect: string }>()
let abilityLabelRequest = 0

const abilitySelectOptions = computed<SearchOption[]>(() =>
  (activePokemon.value?.abilities ?? []).map((ability) => ({
    value: ability,
    label: abilityLabel(ability),
  })),
)
const compareAbilitySelectOptions = computed<SearchOption[]>(() =>
  (comparePokemon.value?.abilities ?? []).map((ability) => ({
    value: ability,
    label: abilityLabel(ability),
  })),
)
const itemSelectOptions = computed<SearchOption[]>(() =>
  dexStore.items.map((item) => ({ value: item.id, label: item.name })),
)
const selectedItem = computed(() => dexStore.getItem(activeMember.value.itemId ?? ''))
const selectedItemDescription = computed(() => {
  const item = selectedItem.value
  if (!item) return ''
  return item.description || item.effect || ''
})
const selectedPokemonFieldLabel = computed(() => {
  if (!activePokemon.value) return t('builder.selectPokemon')
  return `#${String(activePokemon.value.pokedexNumber).padStart(4, '0')} ${activePokemon.value.name}`
})
const selectedItemFieldLabel = computed(() => {
  if (!selectedItem.value) return t('builder.selectItem')
  return selectedItem.value.name
})
const natureSelectOptions = computed<SearchOption[]>(() =>
  dexStore.natures.map((nature) => ({ value: nature, label: natureLabel(nature) })),
)
const selectedAbilityDescription = computed(() => {
  const abilityId = activeMember.value.abilityId
  if (!abilityId) return t('builder.noAbilityDescription')
  return abilityEffects.value[abilityId] || t('builder.noAbilityDescription')
})
const selectedNatureDescription = computed(() => {
  const nature = getNatureModifier(activeMember.value.natureId ?? '')
  if (!nature.up || !nature.down) return t('builder.neutralNature')
  return `${localeStatLabel(nature.up)} / -${localeStatLabel(nature.down)}`
})
const currentNatureModifier = computed(() => getNatureModifier(activeMember.value.natureId ?? ''))
const teraSelectOptions = computed<SearchOption[]>(() =>
  TYPE_KEYS.map((type) => ({ value: type, label: typeLabel(type) })),
)
const moveSelectOptions = computed<SearchOption[]>(() => {
  const pokemon = activePokemon.value
  if (!pokemon) return []

  const effectiveLearnset = getEffectiveLearnsetMoveIds(
    pokemon,
    (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
  )
  const allowed = new Set<string>([
    ...effectiveLearnset,
    ...(pokemon.suggestedMoves ?? []),
    ...activeMember.value.moves.filter(Boolean),
  ])
  const moveMap = new Map(dexStore.moves.map((entry) => [entry.id, entry]))

  const known = [...allowed]
    .filter((moveId) => moveMap.has(moveId))
    .map((moveId) => {
      const move = moveMap.get(moveId)!
      return {
        value: move.id,
        label: move.name,
        meta: {
          type: move.type,
          category: move.category,
          power: move.power > 0 ? move.power : null,
          accuracy: move.accuracy ?? null,
          pp: move.pp ?? null,
          effect: move.description || move.effect || '',
          priority: move.priority ?? 0,
        },
      }
    })

  const missing = [...allowed]
    .filter((moveId) => !moveMap.has(moveId))
    .map((moveId) => ({
      value: moveId,
      label: prettifySlug(moveId),
      meta: {
        power: null,
        accuracy: null,
        pp: null,
        effect: '',
      },
    }))

  return [...known, ...missing].sort((a, b) => a.label.localeCompare(b.label, localeCode()))
})
const compareMoveSelectOptions = computed<SearchOption[]>(() => {
  const pokemon = comparePokemon.value
  if (!pokemon) return []

  const effectiveLearnset = getEffectiveLearnsetMoveIds(
    pokemon,
    (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
  )
  const allowed = new Set<string>([
    ...effectiveLearnset,
    ...(pokemon.suggestedMoves ?? []),
    ...compareDraft.value.moves.filter(Boolean),
  ])
  const moveMap = new Map(dexStore.moves.map((entry) => [entry.id, entry]))

  const known = [...allowed]
    .filter((moveId) => moveMap.has(moveId))
    .map((moveId) => {
      const move = moveMap.get(moveId)!
      return {
        value: move.id,
        label: move.name,
        meta: {
          type: move.type,
          category: move.category,
          power: move.power > 0 ? move.power : null,
          accuracy: move.accuracy ?? null,
          pp: move.pp ?? null,
          effect: move.description || move.effect || '',
          priority: move.priority ?? 0,
        },
      }
    })

  const missing = [...allowed]
    .filter((moveId) => !moveMap.has(moveId))
    .map((moveId) => ({
      value: moveId,
      label: prettifySlug(moveId),
      meta: {
        power: null,
        accuracy: null,
        pp: null,
        effect: '',
      },
    }))

  return [...known, ...missing].sort((a, b) => a.label.localeCompare(b.label, localeCode()))
})
const hoveredMoveIndex = ref<number | null>(null)
const focusedMoveIndex = ref<number | null>(null)
const isTeraDefenseActive = ref(false)
const speedTailwindActive = ref(false)
const speedScarfActive = ref(false)

const totalEvs = computed(() => {
  return STATS.reduce((sum, stat) => sum + (activeMember.value?.evs[stat] ?? 0), 0)
})
const remainingEvs = computed(() => Math.max(0, MAX_EVS - totalEvs.value))
const compareTotalEvs = computed(() => STATS.reduce((sum, stat) => sum + (compareDraft.value.evs[stat] ?? 0), 0))
const compareRemainingEvs = computed(() => Math.max(0, MAX_EVS - compareTotalEvs.value))
const finalStats = computed(() => {
  if (!activePokemon.value) {
    return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  }
  return calculateBattleStats(
    activePokemon.value.baseStats,
    activeMember.value.ivs,
    activeMember.value.evs,
    battleLevel.value,
    activeMember.value.natureId,
  )
})
const neutralFinalStats = computed(() => {
  if (!activePokemon.value) {
    return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  }
  return calculateBattleStats(
    activePokemon.value.baseStats,
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    battleLevel.value,
    'hardy',
  )
})
const speedFinal = computed(() => finalStats.value.spe ?? 0)
const compareFinalStats = computed(() => {
  if (!comparePokemon.value || !compareDraft.value.pokemonId) {
    return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  }
  return calculateBattleStats(
    comparePokemon.value.baseStats,
    compareDraft.value.ivs,
    compareDraft.value.evs,
    battleLevel.value,
    compareDraft.value.natureId,
  )
})
const compareSpeedFinal = computed(() => compareFinalStats.value.spe ?? 0)
const isChoiceScarfEquipped = computed(() => activeMember.value.itemId === 'choice-scarf')
const speedMultiplier = computed(() => {
  const tailwindMultiplier = speedTailwindActive.value ? 2 : 1
  const scarfMultiplier = speedScarfActive.value && isChoiceScarfEquipped.value ? 1.5 : 1
  return tailwindMultiplier * scarfMultiplier
})
const speedEffective = computed(() => Math.floor(speedFinal.value * speedMultiplier.value))

function speedBenchmark(baseSpeed: number, natureId: string): number {
  return calculateBattleStats(
    { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: baseSpeed },
    { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 252 },
    battleLevel.value,
    natureId,
  ).spe
}

const speedBench60Neutral = computed(() => speedBenchmark(60, 'hardy'))
const speedBench90Neutral = computed(() => speedBenchmark(90, 'hardy'))
const speedBench100Jolly = computed(() => speedBenchmark(100, 'jolly'))

const speedTrRank = computed<'high' | 'mid' | 'low'>(() => {
  if (speedFinal.value <= speedBench60Neutral.value) return 'high'
  if (speedFinal.value <= speedBench90Neutral.value) return 'mid'
  return 'low'
})

const speedTrRankLabel = computed(() => {
  if (speedTrRank.value === 'high') return t('builder.speedTrRankHigh')
  if (speedTrRank.value === 'mid') return t('builder.speedTrRankMid')
  return t('builder.speedTrRankLow')
})

const speedTrRankClass = computed(() => {
  if (speedTrRank.value === 'high') return 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200'
  if (speedTrRank.value === 'mid') return 'border-amber-500/45 bg-amber-500/15 text-amber-200'
  return 'border-rose-500/45 bg-rose-500/15 text-rose-200'
})

const speedComparison = computed(() => {
  if (!activePokemon.value) return { isFaster: false, text: '' }

  if (speedEffective.value >= speedBench100Jolly.value) {
    return {
      isFaster: true,
      text: t('builder.speedCompareFaster', { target: t('builder.speedTargetJolly', { base: 100 }) }),
    }
  }

  if (speedEffective.value >= speedBench90Neutral.value) {
    return {
      isFaster: true,
      text: t('builder.speedCompareFaster', { target: t('builder.speedTargetNeutral', { base: 90 }) }),
    }
  }

  return {
    isFaster: false,
    text: t('builder.speedCompareSlower', { target: t('builder.speedTargetNeutral', { base: 90 }) }),
  }
})
const compareStatDiffs = computed<Record<StatKey, number>>(() => {
  const diffs = {} as Record<StatKey, number>
  for (const stat of STATS) {
    diffs[stat] = (compareFinalStats.value[stat] ?? 0) - (finalStats.value[stat] ?? 0)
  }
  return diffs
})
const compareBaseTotal = computed(() =>
  activePokemon.value ? STATS.reduce((sum, stat) => sum + (activePokemon.value?.baseStats[stat] ?? 0), 0) : 0,
)
const compareCandidateBaseTotal = computed(() =>
  comparePokemon.value ? STATS.reduce((sum, stat) => sum + (comparePokemon.value?.baseStats[stat] ?? 0), 0) : 0,
)
const compareFinalTotal = computed(() => STATS.reduce((sum, stat) => sum + (finalStats.value[stat] ?? 0), 0))
const compareCandidateFinalTotal = computed(() =>
  STATS.reduce((sum, stat) => sum + (compareFinalStats.value[stat] ?? 0), 0),
)
const compareBaseDelta = computed(() => compareCandidateBaseTotal.value - compareBaseTotal.value)
const compareFinalDelta = computed(() => compareCandidateFinalTotal.value - compareFinalTotal.value)
const compareSpeedDelta = computed(() => compareSpeedFinal.value - speedFinal.value)

const currentTeamAnalytics = computed(() => analyticsStore.getTeamAnalytics(mode.value))
const compareTeamAnalytics = computed(() => {
  if (!comparePokemon.value || !compareDraft.value.pokemonId) return null

  const simulated = {
    ...team.value,
    members: team.value.members.map((member) => ({
      ...member,
      evs: { ...member.evs },
      ivs: { ...member.ivs },
      moves: [...member.moves] as [string, string, string, string],
      roleTags: [...member.roleTags],
    })),
  }
  const simulatedMember = simulated.members.find((entry) => entry.slot === activeMember.value.slot)
  if (!simulatedMember) return null

  simulatedMember.pokemonId = comparePokemon.value.id
  simulatedMember.abilityId = compareDraft.value.abilityId || comparePokemon.value.abilities[0] || ''
  simulatedMember.itemId = compareDraft.value.itemId || ''
  simulatedMember.natureId = compareDraft.value.natureId || comparePokemon.value.defaultNature || simulatedMember.natureId
  simulatedMember.evs = { ...compareDraft.value.evs }
  simulatedMember.ivs = { ...compareDraft.value.ivs }
  simulatedMember.moves = [
    compareDraft.value.moves[0] ?? '',
    compareDraft.value.moves[1] ?? '',
    compareDraft.value.moves[2] ?? '',
    compareDraft.value.moves[3] ?? '',
  ]
  simulatedMember.roleTags = resolveRoleTagsForSet(
    simulatedMember.moves,
    comparePokemon.value.roleTags,
    comparePokemon.value,
  )

  return calculateTeamAnalytics(
    simulated,
    (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
    (moveId) => dexStore.getMoveType(moveId),
    analyticsStore.normalizedWeights,
  )
})
const compareTeamScoreDelta = computed(() => {
  if (!compareTeamAnalytics.value) return null
  return compareTeamAnalytics.value.totalScore - currentTeamAnalytics.value.totalScore
})

function moveNameById(moveId: string): string {
  return dexStore.getMove(moveId)?.name ?? prettifySlug(moveId)
}

function dominantAttackStyle(moveIds: string[]): 'physical' | 'special' | 'mixed' {
  let physicalCount = 0
  let specialCount = 0

  for (const moveId of moveIds) {
    const category = dexStore.getMove(moveId)?.category
    if (category === 'physical') physicalCount += 1
    if (category === 'special') specialCount += 1
  }

  if (physicalCount > specialCount) return 'physical'
  if (specialCount > physicalCount) return 'special'

  if (activePokemon.value) {
    if (activePokemon.value.baseStats.atk > activePokemon.value.baseStats.spa) return 'physical'
    if (activePokemon.value.baseStats.spa > activePokemon.value.baseStats.atk) return 'special'
  }

  return 'mixed'
}

function natureSynergizesWithRoles(roleSet: Set<TeamRole>, moveIds: string[]): boolean {
  const nature = currentNatureModifier.value
  if (!nature.up && !nature.down) return true

  if (roleSet.has('speed-control') && nature.down === 'spe') return false
  if (roleSet.has('wall') && (nature.down === 'def' || nature.down === 'spd')) return false

  if (roleSet.has('sweeper')) {
    const style = dominantAttackStyle(moveIds)
    if (nature.down === 'spe') return false
    if (style === 'physical' && nature.down === 'atk') return false
    if (style === 'special' && nature.down === 'spa') return false
  }

  return true
}

const slotWarnings = computed(() => {
  if (!activePokemon.value) return [] as string[]

  const warnings: string[] = []
  const selectedMoves = activeMember.value.moves.filter(Boolean)
  const roles = new Set(
    (activeMember.value.roleTags.length ? activeMember.value.roleTags : activePokemon.value.roleTags) ?? [],
  )

  if (mode.value === 'vgc' && selectedMoves.length > 0 && !selectedMoves.includes('protect')) {
    warnings.push(t('builder.warnNoProtectVgc'))
  }

  if (activeMember.value.itemId === 'assault-vest') {
    const hasStatusMove = selectedMoves.some((moveId) => dexStore.getMove(moveId)?.category === 'status')
    if (hasStatusMove) {
      warnings.push(t('builder.warnAssaultVestStatus'))
    }
  }

  const learnset = new Set(
    getEffectiveLearnsetMoveIds(
      activePokemon.value,
      (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
    ),
  )
  if (learnset.size > 0) {
    for (const moveId of selectedMoves) {
      if (!learnset.has(moveId)) {
        warnings.push(t('builder.warnMoveIllegal', { move: moveNameById(moveId) }))
      }
    }
  }

  const duplicateCounter = new Map<string, number>()
  for (const moveId of selectedMoves) {
    duplicateCounter.set(moveId, (duplicateCounter.get(moveId) ?? 0) + 1)
  }
  for (const [moveId, count] of duplicateCounter) {
    if (count > 1) {
      warnings.push(t('builder.warnMoveDuplicate', { move: moveNameById(moveId) }))
    }
  }

  if (totalEvs.value > 0 && totalEvs.value < 508) {
    warnings.push(t('builder.warnEvsIncomplete'))
  }

  if (
    activeMember.value.abilityId &&
    !activePokemon.value.abilities.includes(activeMember.value.abilityId)
  ) {
    warnings.push(t('builder.warnAbilityUnavailable'))
  }

  if (roles.size > 0 && !natureSynergizesWithRoles(roles, selectedMoves)) {
    warnings.push(t('builder.warnNatureRoleMismatch'))
  }

  return [...new Set(warnings)]
})

const isComplete = computed(() => memberIsComplete(activeMember.value))

const defensiveWeaknesses = computed(() => {
  if (!activePokemon.value) return [] as Array<{ type: (typeof TYPE_KEYS)[number]; factor: number }>
  const [typeA, typeB] = effectiveDefensiveTypes.value
  return TYPE_KEYS.map((attackType) => ({
    type: attackType,
    factor: effectivenessAgainstDual(attackType, typeA, typeB),
  }))
    .filter((entry) => entry.factor > 1)
    .sort((a, b) => b.factor - a.factor)
})

const defensiveStrengths = computed(() => {
  if (!activePokemon.value) return [] as Array<{ type: (typeof TYPE_KEYS)[number]; factor: number }>
  const [typeA, typeB] = effectiveDefensiveTypes.value
  return TYPE_KEYS.map((attackType) => ({
    type: attackType,
    factor: effectivenessAgainstDual(attackType, typeA, typeB),
  }))
    .filter((entry) => entry.factor < 1)
    .sort((a, b) => a.factor - b.factor)
})

const evolutionChainDetails = computed(() => {
  if (!activePokemon.value) return [] as Array<{ id: string; name: string }>
  return activePokemon.value.evolutionChain.map((evoId) => {
    const inMode = dexStore.getPokemon(mode.value, evoId)
    return {
      id: evoId,
      name: inMode?.name ?? evoId,
    }
  })
})
const canActivateTeraDefense = computed(() => Boolean(activePokemon.value && activeMember.value.teraType))
const effectiveDefensiveTypes = computed<[(typeof TYPE_KEYS)[number], ((typeof TYPE_KEYS)[number] | undefined)]>(() => {
  if (isTeraDefenseActive.value && activeMember.value.teraType) {
    return [activeMember.value.teraType, undefined]
  }
  const primary = activePokemon.value?.types[0] ?? 'normal'
  const secondary = activePokemon.value?.types[1]
  return [primary, secondary]
})

const PIVOT_MOVE_IDS = new Set(['u-turn', 'volt-switch', 'flip-turn', 'parting-shot', 'teleport', 'chilly-reception'])
const SUPPORT_MOVE_IDS = new Set([
  'taunt',
  'encore',
  'helping-hand',
  'follow-me',
  'rage-powder',
  'spore',
  'pollen-puff',
  'will-o-wisp',
  'thunder-wave',
  'snarl',
  'reflect',
  'light-screen',
  'haze',
  'clear-smog',
  'trick',
  'switcheroo',
])
const SPEED_CONTROL_MOVE_IDS = new Set([
  'tailwind',
  'trick-room',
  'icy-wind',
  'electroweb',
  'thunder-wave',
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
    const move = dexStore.getMove(moveId)
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

function sameRoleTags(a: TeamRole[], b: TeamRole[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((value, index) => value === right[index])
}

const activeRoleReference = computed<TeamRole[]>(() => {
  const pokemonBaseRoles = activePokemon.value?.roleTags ?? []
  const memberBaseRoles = activeMember.value.roleTags.length > 0 ? activeMember.value.roleTags : pokemonBaseRoles
  return resolveRoleTagsForSet(activeMember.value.moves, memberBaseRoles, activePokemon.value)
})

const compareCandidatePool = computed<PokemonEntry[]>(() => {
  const activeId = activeMember.value.pokemonId
  const roleSet = new Set(activeRoleReference.value)
  const typeSet = new Set(activePokemon.value?.types ?? [])
  const byUsageAndName = (a: PokemonEntry, b: PokemonEntry) => {
    const usageA = metaUsageStore.getPokemonMeta(mode.value, a.id)?.usage ?? 0
    const usageB = metaUsageStore.getPokemonMeta(mode.value, b.id)?.usage ?? 0
    if (usageA !== usageB) return usageB - usageA
    return a.name.localeCompare(b.name, localeCode())
  }

  const similar: PokemonEntry[] = []
  const others: PokemonEntry[] = []
  for (const pokemon of pokemonOptions.value) {
    if (pokemon.id === activeId) continue
    const sharesType = pokemon.types.some((type) => typeSet.has(type))
    const sharesRole = pokemon.roleTags.some((role) => roleSet.has(role))
    if (sharesType || sharesRole) similar.push(pokemon)
    else others.push(pokemon)
  }

  similar.sort(byUsageAndName)
  others.sort(byUsageAndName)
  return [...similar.slice(0, 220), ...others.slice(0, 90)]
})

function compareCandidateScore(candidate: PokemonEntry): number {
  const activeRoles = activeRoleReference.value
  const candidateRoles = resolveRoleTagsForSet(
    previewMovesForRoleRanking(candidate),
    candidate.roleTags,
    candidate,
  )
  const overlapCount = candidateRoles.filter((role) => activeRoles.includes(role)).length
  const roleSimilarity = activeRoles.length > 0 ? overlapCount / activeRoles.length : 0

  const activeTypes = activePokemon.value?.types ?? []
  const primaryMatch = activeTypes[0] && candidate.types[0] === activeTypes[0] ? 1 : 0
  const secondaryOverlap = candidate.types.some((type) => activeTypes.includes(type)) ? 1 : 0
  const usage = metaUsageStore.getPokemonMeta(mode.value, candidate.id)?.usage ?? 0
  const usageScore = usage > 0 ? Math.log10(usage + 1) : 0

  return roleSimilarity * 100 + primaryMatch * 18 + secondaryOverlap * 8 + usageScore
}

function previewMovesForRoleRanking(pokemon: PokemonEntry): string[] {
  const metaTop = (metaUsageStore.getPokemonMeta(mode.value, pokemon.id)?.moves ?? [])
    .slice(0, 4)
    .map((entry) => entry.id)
    .filter(Boolean)
  if (metaTop.length > 0) return metaTop
  return pokemon.suggestedMoves.slice(0, 4)
}

function preferredMovesForPokemon(pokemon: PokemonEntry): [string, string, string, string] {
  const effectiveLearnset = getEffectiveLearnsetMoveIds(
    pokemon,
    (pokemonId) => dexStore.getPokemon(mode.value, pokemonId),
  )
  const allowed = new Set<string>([
    ...effectiveLearnset,
    ...(pokemon.suggestedMoves ?? []),
  ])

  const metaMoves = (metaUsageStore.getPokemonMeta(mode.value, pokemon.id)?.moves ?? [])
    .map((entry) => entry.id)
    .filter((moveId) => (allowed.size > 0 ? allowed.has(moveId) : true))

  const fallbackPool = [
    ...pokemon.suggestedMoves,
    ...effectiveLearnset,
  ]

  const unique = [...new Set([...metaMoves, ...fallbackPool])].filter(Boolean)
  return [
    unique[0] ?? '',
    unique[1] ?? '',
    unique[2] ?? '',
    unique[3] ?? '',
  ]
}

function onPokemonChange(value: string) {
  uiStore.setBuilderCatalogSource('pokemon')
  if (!value) {
    teamStore.updateMember(mode.value, activeMember.value.slot, {
      pokemonId: '',
      abilityId: '',
      itemId: '',
      moves: ['', '', '', ''],
      roleTags: [],
    })
    return
  }

  const pokemon = dexStore.getPokemon(mode.value, value)
  const suggestedMoves: [string, string, string, string] = pokemon
    ? preferredMovesForPokemon(pokemon)
    : ['', '', '', '']

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    pokemonId: value,
    abilityId: pokemon?.abilities[0] ?? '',
    itemId: pokemon?.suggestedItems[0] ?? '',
    natureId: pokemon?.defaultNature ?? activeMember.value.natureId,
    moves: suggestedMoves,
    roleTags: pokemon ? resolveRoleTagsForSet(suggestedMoves, pokemon.roleTags, pokemon) : [],
  })
}

function formSuffixFromPokemonId(pokemonId: string): string {
  if (!pokemonId.includes('-')) return ''
  const suffixParts = pokemonId.split('-').slice(1)
  if (!suffixParts.length) return ''

  const [head, ...tail] = suffixParts
  if (head === 'mega') {
    return tail.length ? `Mega ${tail.map((part) => prettifySlug(part)).join(' ')}` : 'Mega'
  }
  if (head === 'gmax') return 'Gmax'
  if (head === 'alola' || head === 'galar' || head === 'hisui' || head === 'paldea') {
    const region = prettifySlug(head)
    const rest = tail.map((part) => prettifySlug(part)).join(' ')
    return rest ? `${region} ${rest}` : region
  }
  return suffixParts.map((part) => prettifySlug(part)).join(' ')
}

function formatFormOptionLabel(
  pokemon: { id: string; name: string; pokedexNumber: number },
  index: number,
): string {
  const numberLabel = `#${String(pokemon.pokedexNumber).padStart(4, '0')}`
  const suffix = formSuffixFromPokemonId(pokemon.id)

  if (!suffix && index === 0) {
    return `${numberLabel} ${pokemon.name} (${t('builder.formBase')})`
  }
  if (!suffix) {
    return `${numberLabel} ${pokemon.name}`
  }
  return `${numberLabel} ${pokemon.name} (${suffix})`
}

function applyFormOptions(forms: PokemonEntry[]) {
  formSelectOptions.value = forms.map((pokemon, index) => ({
    value: pokemon.id,
    label: formatFormOptionLabel(pokemon, index),
  }))
}

async function ensureActiveFormsLoaded(fetchRemote: boolean) {
  const pokemonId = activeMember.value.pokemonId
  if (!pokemonId) {
    formSelectOptions.value = []
    return
  }

  const localeValue: LocaleCode = localeCode()
  const cachedForms = dexStore.getPokemonForms(localeValue, pokemonId)

  if (cachedForms.length > 0) {
    applyFormOptions(cachedForms)
    return
  }

  if (!fetchRemote) {
    applyFormOptions(activePokemon.value ? [activePokemon.value] : [])
    return
  }

  const requestId = ++formOptionsRequest
  isLoadingFormOptions.value = true
  try {
    const loadedForms = await dexStore.ensurePokemonForms(mode.value, pokemonId, localeValue)
    if (requestId !== formOptionsRequest) return
    const resolvedForms = loadedForms.length > 0 ? loadedForms : activePokemon.value ? [activePokemon.value] : []
    applyFormOptions(resolvedForms)
  } finally {
    if (requestId === formOptionsRequest) {
      isLoadingFormOptions.value = false
    }
  }
}

function onFormChange(value: string) {
  if (!value || value === activeMember.value.pokemonId) return
  const pokemon = dexStore.getPokemon(mode.value, value)
  if (!pokemon) return

  const currentAbility = activeMember.value.abilityId
  const nextAbility = pokemon.abilities.includes(currentAbility)
    ? currentAbility
    : (pokemon.abilities[0] ?? '')

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    pokemonId: value,
    abilityId: nextAbility,
    roleTags: resolveRoleTagsForSet(activeMember.value.moves, pokemon.roleTags, pokemon),
  })
}

function openCatalogSource(source: 'pokemon' | 'items') {
  uiStore.setBuilderCatalogSource(source)
}

function updateField(field: 'abilityId' | 'itemId' | 'natureId', value: string) {
  if (field === 'itemId') {
    uiStore.setBuilderCatalogSource('items')
  }
  teamStore.updateMember(mode.value, activeMember.value.slot, { [field]: value })
}

function updateTera(value: string) {
  teamStore.updateMember(mode.value, activeMember.value.slot, {
    teraType: value ? (value as (typeof TYPE_KEYS)[number]) : undefined,
  })
}

function updateMove(index: number, value: string) {
  uiStore.setBuilderCatalogSource('moves')
  uiStore.setSelectedMoveIndex(mode.value, index as 0 | 1 | 2 | 3)
  const moves = [...activeMember.value.moves]
  moves[index] = value
  const nextMoves: [string, string, string, string] = [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? '']
  teamStore.updateMember(mode.value, activeMember.value.slot, {
    moves: nextMoves,
    roleTags: resolveRoleTagsForSet(
      nextMoves,
      activePokemon.value?.roleTags ?? activeMember.value.roleTags,
      activePokemon.value,
    ),
  })
}

function updateStat(kind: 'evs' | 'ivs', stat: StatKey, value: number) {
  if (kind === 'evs') {
    const otherTotal = STATS.reduce(
      (sum, currentStat) =>
        currentStat === stat ? sum : sum + (activeMember.value.evs[currentStat] ?? 0),
      0,
    )
    const maxForStat = Math.max(0, Math.min(MAX_EV_PER_STAT, MAX_EVS - otherTotal))
    const normalized = Math.max(0, Math.min(maxForStat, Math.floor((Number(value) || 0) / 4) * 4))
    teamStore.updateMember(mode.value, activeMember.value.slot, {
      evs: { ...activeMember.value.evs, [stat]: normalized },
    })
    return
  }

  const clampedIv = Math.max(0, Math.min(MAX_IV_PER_STAT, Math.floor(Number(value) || 0)))
  teamStore.updateMember(mode.value, activeMember.value.slot, {
    ivs: { ...activeMember.value.ivs, [stat]: clampedIv },
  })
}

function setBattleLevel(value: number) {
  const normalized = Math.max(1, Math.min(100, Math.floor(Number(value) || 1)))
  battleLevel.value = normalized
}

function toggleSpeedTailwind() {
  speedTailwindActive.value = !speedTailwindActive.value
}

function toggleSpeedScarf() {
  if (!isChoiceScarfEquipped.value) return
  speedScarfActive.value = !speedScarfActive.value
}

function toggleRole(role: TeamRole) {
  const roles = new Set(activeMember.value.roleTags)
  if (roles.has(role)) roles.delete(role)
  else roles.add(role)

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    roleTags: [...roles],
  })
}

function typeLabel(type: (typeof TYPE_KEYS)[number]) {
  return locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en
}

function roleLabel(role: TeamRole) {
  return role.replace('-', ' ')
}

function prettifySlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function localeCode(): LocaleCode {
  return locale.value === 'es' ? 'es' : 'en'
}

function localeStatLabel(stat: StatKey): string {
  const labels: Record<StatKey, { es: string; en: string }> = {
    hp: { es: 'PS', en: 'HP' },
    atk: { es: 'Ataque', en: 'Attack' },
    def: { es: 'Defensa', en: 'Defense' },
    spa: { es: 'At. Esp.', en: 'Sp. Atk' },
    spd: { es: 'Def. Esp.', en: 'Sp. Def' },
    spe: { es: 'Velocidad', en: 'Speed' },
  }
  return localeCode() === 'es' ? labels[stat].es : labels[stat].en
}

function natureIndicator(stat: StatKey): '+' | '-' | '' {
  if (stat === 'hp') return ''
  if (currentNatureModifier.value.up === stat) return '+'
  if (currentNatureModifier.value.down === stat) return '-'
  return ''
}

function natureIndicatorClass(stat: StatKey): string {
  const indicator = natureIndicator(stat)
  if (indicator === '+') return 'text-emerald-300'
  if (indicator === '-') return 'text-rose-300'
  return 'text-gray-500'
}

function natureLabel(natureId: string): string {
  const key = natureId.toLowerCase()
  const mapped = NATURE_LABELS[key]
  if (mapped) return localeCode() === 'es' ? mapped.es : mapped.en
  return prettifySlug(natureId)
}

function abilityLabel(abilityId: string): string {
  return abilityLabels.value[abilityId] ?? prettifySlug(abilityId)
}

function selectedMoveEntry(index: number) {
  const moveId = activeMember.value.moves[index]
  if (!moveId) return null
  return dexStore.getMove(moveId) ?? null
}

function selectedMoveEffect(index: number): string {
  const move = selectedMoveEntry(index)
  if (!move) return t('builder.noMoveDescription')
  return move.description || move.effect || t('builder.noMoveDescription')
}

function selectedMovePower(index: number): string {
  const move = selectedMoveEntry(index)
  if (!move) return '-'
  return move.power > 0 ? String(move.power) : '-'
}

function selectedMoveAccuracy(index: number): string {
  const move = selectedMoveEntry(index)
  if (!move || move.accuracy == null) return '-'
  return `${move.accuracy}%`
}

function selectedMovePp(index: number): string {
  const move = selectedMoveEntry(index)
  if (!move || move.pp == null) return '-'
  return String(move.pp)
}

function normalizeMoveType(value: unknown): (typeof TYPE_KEYS)[number] | null {
  if (typeof value !== 'string') return null
  return TYPE_KEYS.includes(value as (typeof TYPE_KEYS)[number]) ? (value as (typeof TYPE_KEYS)[number]) : null
}

function normalizeMoveCategory(value: unknown): MoveEntry['category'] | undefined {
  if (value === 'physical' || value === 'special' || value === 'status') return value
  return undefined
}

function moveTypeIcon(typeValue: unknown): string | null {
  const type = normalizeMoveType(typeValue)
  if (!type) return null
  return TYPE_META[type].icon
}

function moveTypeLabel(typeValue: unknown): string {
  const type = normalizeMoveType(typeValue)
  return type ? typeLabel(type) : '-'
}

function moveCategoryLabel(category: unknown): string {
  const normalized = normalizeMoveCategory(category)
  if (normalized === 'physical') return t('builder.moveCategoryPhysical')
  if (normalized === 'special') return t('builder.moveCategorySpecial')
  if (normalized === 'status') return t('builder.moveCategoryStatus')
  return '-'
}

function moveCategoryIcon(category: unknown): string | null {
  const normalized = normalizeMoveCategory(category)
  if (normalized === 'physical') return movePhysicalSeal
  if (normalized === 'special') return moveSpecialSeal
  if (normalized === 'status') return moveStatusSeal
  return null
}

function normalizeMoveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return value
}

function moveValueLabel(value: unknown): string {
  const normalized = normalizeMoveNumber(value)
  if (normalized == null) return '-'
  return String(normalized)
}

function moveAccuracyValueLabel(value: unknown): string {
  const normalized = normalizeMoveNumber(value)
  if (normalized == null) return '-'
  return `${normalized}%`
}

function onMoveFocusIn(index: number) {
  uiStore.setBuilderCatalogSource('moves')
  uiStore.setSelectedMoveIndex(mode.value, index as 0 | 1 | 2 | 3)
  focusedMoveIndex.value = index
}

function onMoveFocusOut(index: number, event: FocusEvent) {
  const current = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (!current || !next || !current.contains(next)) {
    if (focusedMoveIndex.value === index) focusedMoveIndex.value = null
  }
}

function isMovePopoverOpen(index: number): boolean {
  return hoveredMoveIndex.value === index || focusedMoveIndex.value === index
}

function spriteUrl(pokemonId: string): string {
  if (!pokemonId) return mudkipSprite
  return `https://img.pokemondb.net/sprites/home/normal/${pokemonId}.png`
}

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
}

function spriteIdFromUrl(url: string): string {
  const match = url.match(/\/([^/?#]+)\.png(?:[?#].*)?$/)
  return match?.[1] ?? ''
}

function onSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  const failedId = spriteIdFromUrl(target.src)
  const aliasId = spriteAliasFallback[failedId]
  const alreadyTriedAlias = target.dataset.aliasFallbackTried === '1'

  if (aliasId && !alreadyTriedAlias) {
    target.dataset.aliasFallbackTried = '1'
    target.src = `https://img.pokemondb.net/sprites/home/normal/${aliasId}.png`
    return
  }

  target.src = mudkipSprite
}

function statBarWidth(stat: StatKey): string {
  return `${baseStatPercent(stat)}%`
}

function finalStatBarWidth(stat: StatKey): string {
  return `${finalStatPercent(stat)}%`
}

function finalStatPercent(stat: StatKey): number {
  const value = finalStats.value[stat] ?? 0
  return finalPercentFromValue(stat, value)
}

function baseStatPercent(stat: StatKey): number {
  const value = activePokemon.value?.baseStats[stat] ?? 0
  return Math.max(4, Math.round((value / 255) * 100))
}

function finalPercentFromValue(stat: StatKey, value: number): number {
  const level = Math.max(1, Math.min(100, battleLevel.value))
  const scaled = Math.floor((604 * level) / 100)
  const max = stat === 'hp' ? scaled + level + 10 : Math.floor((scaled + 5) * 1.1)
  return Math.max(4, Math.round((value / max) * 100))
}

function finalBaselinePercent(stat: StatKey): number {
  return finalPercentFromValue(stat, neutralFinalStats.value[stat] ?? 0)
}

function finalGrowthPercent(stat: StatKey): number {
  return Math.max(0, finalStatPercent(stat) - finalBaselinePercent(stat))
}

function evMaxForStat(stat: StatKey): number {
  const otherTotal = STATS.reduce(
    (sum, currentStat) => (currentStat === stat ? sum : sum + activeMember.value.evs[currentStat]),
    0,
  )
  return Math.max(0, Math.min(MAX_EV_PER_STAT, MAX_EVS - otherTotal))
}

function factorLabel(factor: number): string {
  if (factor === 0) return 'x0'
  if (factor === 0.25) return 'x0.25'
  if (factor === 0.5) return 'x0.5'
  if (factor === 2) return 'x2'
  if (factor === 4) return 'x4'
  return `x${factor}`
}

function defensiveProfile(types: [(typeof TYPE_KEYS)[number], ((typeof TYPE_KEYS)[number] | undefined)]) {
  const weaknesses = TYPE_KEYS.map((attackType) => ({
    type: attackType,
    factor: effectivenessAgainstDual(attackType, types[0], types[1]),
  }))
    .filter((entry) => entry.factor > 1)
    .sort((a, b) => b.factor - a.factor)

  const resistances = TYPE_KEYS.map((attackType) => ({
    type: attackType,
    factor: effectivenessAgainstDual(attackType, types[0], types[1]),
  }))
    .filter((entry) => entry.factor < 1)
    .sort((a, b) => a.factor - b.factor)

  return { weaknesses, resistances }
}

const comparePokemonProfile = computed(() => {
  if (!comparePokemon.value) return null
  const types: [(typeof TYPE_KEYS)[number], ((typeof TYPE_KEYS)[number] | undefined)] = [
    comparePokemon.value.types[0] ?? 'normal',
    comparePokemon.value.types[1],
  ]
  return defensiveProfile(types)
})

function statDeltaClass(value: number): string {
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-rose-300'
  return 'text-gray-400'
}

function signed(value: number): string {
  if (value > 0) return `+${value}`
  return `${value}`
}

function recommendComparePokemonId(): string {
  let bestId = ''
  let bestScore = Number.NEGATIVE_INFINITY

  const pool = compareCandidatePool.value.length > 0 ? compareCandidatePool.value : pokemonOptions.value
  for (const pokemon of pool) {
    if (pokemon.id === activeMember.value.pokemonId) continue
    const score = compareCandidateScore(pokemon)
    if (score > bestScore) {
      bestScore = score
      bestId = pokemon.id
    }
  }

  if (bestId) return bestId
  const fallback = comparePokemonOptions.value.find((option) => option.value !== activeMember.value.pokemonId)
  return fallback?.value ?? ''
}

function buildCompareDraft(pokemonId: string, preserveTraining = true) {
  const pokemon = dexStore.getPokemon(mode.value, pokemonId)
  if (!pokemon) return

  const preservedNature =
    preserveTraining && compareDraft.value.natureId
      ? compareDraft.value.natureId
      : activeMember.value.natureId
  const preservedEvs = preserveTraining ? compareDraft.value.evs : activeMember.value.evs
  const preservedIvs = preserveTraining ? compareDraft.value.ivs : activeMember.value.ivs

  compareDraft.value = {
    pokemonId,
    abilityId: pokemon.abilities[0] ?? '',
    itemId: pokemon.suggestedItems[0] ?? '',
    natureId: preservedNature || pokemon.defaultNature || 'jolly',
    evs: { ...preservedEvs },
    ivs: { ...preservedIvs },
    moves: preferredMovesForPokemon(pokemon),
  }
}

function onComparePokemonChange(value: string) {
  comparePokemonId.value = value
  if (!value) return
  buildCompareDraft(value, true)
}

function updateCompareField(field: 'abilityId' | 'itemId' | 'natureId', value: string) {
  compareDraft.value = {
    ...compareDraft.value,
    [field]: value,
  }
}

function updateCompareMove(index: number, value: string) {
  const moves = [...compareDraft.value.moves]
  moves[index] = value
  compareDraft.value = {
    ...compareDraft.value,
    moves: [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''],
  }
}

function compareEvMaxForStat(stat: StatKey): number {
  const otherTotal = STATS.reduce(
    (sum, currentStat) => (currentStat === stat ? sum : sum + compareDraft.value.evs[currentStat]),
    0,
  )
  return Math.max(0, Math.min(MAX_EV_PER_STAT, MAX_EVS - otherTotal))
}

function updateCompareStat(kind: 'evs' | 'ivs', stat: StatKey, value: number) {
  if (kind === 'evs') {
    const otherTotal = STATS.reduce(
      (sum, currentStat) =>
        currentStat === stat ? sum : sum + (compareDraft.value.evs[currentStat] ?? 0),
      0,
    )
    const maxForStat = Math.max(0, Math.min(MAX_EV_PER_STAT, MAX_EVS - otherTotal))
    const normalized = Math.max(0, Math.min(maxForStat, Math.floor((Number(value) || 0) / 4) * 4))
    compareDraft.value = {
      ...compareDraft.value,
      evs: { ...compareDraft.value.evs, [stat]: normalized },
    }
    return
  }

  const clampedIv = Math.max(0, Math.min(MAX_IV_PER_STAT, Math.floor(Number(value) || 0)))
  compareDraft.value = {
    ...compareDraft.value,
    ivs: { ...compareDraft.value.ivs, [stat]: clampedIv },
  }
}

function openCompareModal() {
  if (!activePokemon.value) return
  comparePokemonId.value = recommendComparePokemonId()
  if (comparePokemonId.value) {
    buildCompareDraft(comparePokemonId.value, false)
  }
  showCompareModal.value = true
}

function closeCompareModal() {
  showCompareModal.value = false
}

function applyComparePokemonOnly() {
  const candidate = comparePokemon.value
  if (!candidate) return
  closeCompareModal()

  const currentAbility = activeMember.value.abilityId
  const nextAbility = candidate.abilities.includes(currentAbility)
    ? currentAbility
    : (candidate.abilities[0] ?? '')

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    pokemonId: candidate.id,
    abilityId: nextAbility,
    roleTags: resolveRoleTagsForSet(activeMember.value.moves, candidate.roleTags, candidate),
  })
}

function applyCompareFullSet() {
  const candidate = comparePokemon.value
  if (!candidate) return
  closeCompareModal()

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    pokemonId: candidate.id,
    abilityId: compareDraft.value.abilityId || candidate.abilities[0] || '',
    itemId: compareDraft.value.itemId || '',
    natureId: compareDraft.value.natureId || candidate.defaultNature || activeMember.value.natureId,
    evs: { ...compareDraft.value.evs },
    ivs: { ...compareDraft.value.ivs },
    moves: [
      compareDraft.value.moves[0] ?? '',
      compareDraft.value.moves[1] ?? '',
      compareDraft.value.moves[2] ?? '',
      compareDraft.value.moves[3] ?? '',
    ],
    roleTags: resolveRoleTagsForSet(compareDraft.value.moves, candidate.roleTags, candidate),
  })
}

onMounted(() => {
  void metaUsageStore.ensureModeLoaded(mode.value)
})

watch(
  () => [activeMember.value.pokemonId, activeMember.value.teraType],
  () => {
    if (!canActivateTeraDefense.value) {
      isTeraDefenseActive.value = false
    }
  },
  { immediate: true },
)

watch(
  () => mode.value,
  (nextMode) => {
    battleLevel.value = nextMode === 'singles' ? 100 : 50
    void metaUsageStore.ensureModeLoaded(nextMode)
  },
  { immediate: true },
)

watch(
  () => [activeMember.value.pokemonId, ...activeMember.value.moves],
  () => {
    const pokemon = activePokemon.value
    if (!pokemon || !activeMember.value.pokemonId) return
    const resolved = resolveRoleTagsForSet(activeMember.value.moves, pokemon.roleTags, pokemon)
    if (!sameRoleTags(resolved, activeMember.value.roleTags)) {
      teamStore.updateMember(mode.value, activeMember.value.slot, { roleTags: resolved })
    }
  },
  { immediate: true },
)

watch(
  () => isChoiceScarfEquipped.value,
  (isEquipped, wasEquipped) => {
    if (!isEquipped) {
      speedScarfActive.value = false
      return
    }
    if (!wasEquipped) {
      speedScarfActive.value = true
    }
  },
  { immediate: true },
)

watch(
  () => [locale.value, ...(activePokemon.value?.abilities ?? [])],
  async () => {
    const abilities = activePokemon.value?.abilities ?? []
    if (abilities.length === 0) return

    const requestId = ++abilityLabelRequest
    const currentLocale = localeCode()
    const cached: Array<[string, { name: string; shortEffect: string; effect: string }]> = []
    const missing: string[] = []

    for (const abilityId of abilities) {
      const cacheKey = `${currentLocale}:${abilityId}`
      const meta = abilityMetaCache.get(cacheKey)
      if (meta) {
        cached.push([
          abilityId,
          {
            name: meta.name,
            shortEffect: meta.effect,
            effect: meta.effect,
          },
        ])
      } else {
        missing.push(abilityId)
      }
    }

    const fetched = await Promise.all(
      missing.map(async (abilityId) => {
        try {
          const meta = await dexService.loadAbilityLocalizedMeta(abilityId, currentLocale)
          const effect = meta.shortEffect || meta.effect || ''
          abilityMetaCache.set(`${currentLocale}:${abilityId}`, { name: meta.name, effect })
          return [abilityId, meta] as const
        } catch {
          const fallback = { name: prettifySlug(abilityId), shortEffect: '', effect: '' }
          abilityMetaCache.set(`${currentLocale}:${abilityId}`, {
            name: fallback.name,
            effect: '',
          })
          return [abilityId, fallback] as const
        }
      }),
    )
    const labels = [...cached, ...fetched]

    if (requestId !== abilityLabelRequest) return
    const nextEffects = { ...abilityEffects.value }
    abilityLabels.value = {
      ...abilityLabels.value,
      ...Object.fromEntries(labels.map(([abilityId, meta]) => [abilityId, meta.name])),
    }
    for (const [abilityId, meta] of labels) {
      nextEffects[abilityId] = meta.shortEffect || meta.effect || ''
    }
    abilityEffects.value = nextEffects
  },
  { immediate: true },
)

watch(
  () => [mode.value, locale.value, activeMember.value.pokemonId] as const,
  async () => {
    await ensureActiveFormsLoaded(true)
  },
  { immediate: true },
)

watch(
  () => [activeMember.value.pokemonId, mode.value, showCompareModal.value] as const,
  ([, , isCompareOpen]) => {
    if (!isCompareOpen) return
    comparePokemonId.value = recommendComparePokemonId()
    if (comparePokemonId.value) {
      buildCompareDraft(comparePokemonId.value, false)
    }
  },
)
</script>

<template>
  <section class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-sky-300">{{ t('builder.title') }}</h2>
      <div class="rounded-md border px-2 py-1 text-xs" :class="isComplete ? 'border-green-500/50 text-green-300' : 'border-red-500/50 text-red-300'">
        {{ isComplete ? t('builder.completeSet') : t('builder.invalidSet') }}
      </div>
    </div>

    <TeamSlotPicker
      class="mb-4"
      :mode="mode"
      :members="team.members"
      :selected-slot="selectedSlot"
      :title="t('builder.teamPreview')"
      :show-count="true"
      @update:selected-slot="selectedSlot = $event"
    />

    <div class="grid gap-4 xl:grid-cols-[minmax(0,60%)_minmax(0,40%)]">
      <div class="contents">
        <div class="rounded-xl border border-gray-700 bg-st-black/45 p-3 xl:col-start-1 xl:row-start-1">
            <div class="grid gap-3 md:grid-cols-2">
              <label class="block text-sm md:col-span-2">
                <span class="mb-1 block text-gray-300">{{ t('builder.pokemon') }}</span>
                <input
                  type="text"
                  :value="selectedPokemonFieldLabel"
                  readonly
                  class="w-full cursor-pointer rounded-md border border-gray-700 bg-st-black p-2 text-sm text-gray-100 outline-none transition hover:border-sky-500/50 focus:border-sky-500/70"
                  @click="openCatalogSource('pokemon')"
                  @focus="openCatalogSource('pokemon')"
                />
              </label>

              <label
                v-if="activeMember.pokemonId"
                class="block text-sm md:col-span-2"
                @focusin="void ensureActiveFormsLoaded(true)"
              >
                <span class="mb-1 block text-gray-300">{{ t('builder.form') }}</span>
                <div class="rounded-lg border border-gray-700 bg-off-black/50 p-2">
                  <div v-if="formSelectOptions.length > 0" class="flex flex-wrap gap-1.5">
                    <button
                      v-for="option in formSelectOptions"
                      :key="`form-${option.value}`"
                      type="button"
                      class="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs transition"
                      :class="
                        activeMember.pokemonId === option.value
                          ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
                          : 'border-gray-700 bg-black/35 text-gray-200 hover:border-sky-500/40'
                      "
                      @click="onFormChange(option.value)"
                    >
                      <img
                        :src="spriteUrl(option.value)"
                        :alt="option.label"
                        class="h-4 w-4 shrink-0 object-contain"
                        @error="onSpriteError"
                      />
                      <span class="truncate">{{ option.label }}</span>
                    </button>
                  </div>
                  <p v-else class="text-xs text-gray-500">{{ t('common.none') }}</p>
                </div>
                <p v-if="isLoadingFormOptions" class="mt-1 text-[11px] text-gray-500">
                  {{ t('builder.loadingForms') }}
                </p>
              </label>

              <div class="rounded-lg border border-gray-700 bg-off-black/50 p-2 md:col-span-2">
                <p class="mb-2 text-xs text-gray-300">{{ t('builder.favorites') }}</p>
                <div v-if="favoritePokemonOptions.length > 0" class="flex flex-wrap gap-1.5">
                  <button
                    v-for="pokemon in favoritePokemonOptions"
                    :key="`fav-${pokemon.id}`"
                    class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition"
                    :class="activeMember.pokemonId === pokemon.id
                      ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
                      : 'border-gray-700 bg-black/35 text-gray-200 hover:border-sky-500/40'"
                    @click="onPokemonChange(pokemon.id)"
                  >
                    <img :src="spriteUrl(pokemon.id)" :alt="pokemon.name" class="h-4 w-4 object-contain" @error="onSpriteError" />
                    <span class="max-w-[10rem] truncate">#{{ String(pokemon.pokedexNumber).padStart(4, '0') }} {{ pokemon.name }}</span>
                  </button>
                </div>
                <p v-else class="text-xs text-gray-500">{{ t('builder.noFavorites') }}</p>
              </div>

              <label class="block text-sm">
                <span class="mb-1 block text-gray-300">{{ t('builder.ability') }}</span>
                <SearchableSelect
                  :model-value="activeMember.abilityId"
                  :options="abilitySelectOptions"
                  :placeholder="t('builder.selectAbility')"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateField('abilityId', $event)"
                />
                <p class="mt-2 text-[11px] text-gray-400">
                  <span class="font-semibold text-gray-300">{{ t('builder.abilityDescription') }}:</span>
                  {{ selectedAbilityDescription }}
                </p>
              </label>

              <label class="block text-sm">
                <span class="mb-1 block text-gray-300">{{ t('builder.item') }}</span>
                <input
                  type="text"
                  :value="selectedItemFieldLabel"
                  readonly
                  class="w-full cursor-pointer rounded-md border border-gray-700 bg-st-black p-2 text-sm text-gray-100 outline-none transition hover:border-sky-500/50 focus:border-sky-500/70"
                  @click="openCatalogSource('items')"
                  @focus="openCatalogSource('items')"
                />
                <p class="mt-2 text-[11px] text-gray-400">
                  <span class="font-semibold text-gray-300">{{ t('builder.itemDescription') }}:</span>
                  {{ selectedItemDescription || t('builder.noItemDescription') }}
                </p>
              </label>

              <label class="block text-sm">
                <span class="mb-1 block text-gray-300">{{ t('builder.nature') }}</span>
                <SearchableSelect
                  :model-value="activeMember.natureId"
                  :options="natureSelectOptions"
                  :clearable="false"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateField('natureId', $event)"
                />
                <p class="mt-2 text-[11px] text-gray-400">
                  <span class="font-semibold text-gray-300">{{ t('builder.natureDescription') }}:</span>
                  {{ selectedNatureDescription }}
                </p>
              </label>

              <label class="block text-sm">
                <div class="mb-1 flex items-center justify-between gap-2">
                  <span class="block text-gray-300">{{ t('builder.teraType') }}</span>
                  <label class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                    <input
                      v-model="isTeraDefenseActive"
                      type="checkbox"
                      class="h-3.5 w-3.5 rounded border border-gray-600 bg-off-black/70 accent-sky-400"
                      :disabled="!canActivateTeraDefense"
                    />
                    <span>{{ t('builder.activateTeraDefense') }}</span>
                  </label>
                </div>
                <SearchableSelect
                  :model-value="activeMember.teraType ?? ''"
                  :options="teraSelectOptions"
                  :placeholder="t('common.selectNone')"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateTera"
                />
                <p class="mt-1 text-[11px] text-gray-500">
                  {{
                    isTeraDefenseActive && activeMember.teraType
                      ? t('builder.teraDefenseOn', { type: typeLabel(activeMember.teraType) })
                      : t('builder.teraDefenseOff')
                  }}
                </p>
              </label>

              <div class="md:col-span-2">
                <p class="mb-2 text-gray-300">{{ t('builder.roles') }}</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="role in TEAM_ROLES"
                    :key="role"
                    class="rounded-md border px-2 py-1 text-xs"
                    :class="activeMember.roleTags.includes(role) ? 'border-sky-500 bg-sky-500/20' : 'border-gray-700'"
                    @click="toggleRole(role)"
                  >
                    {{ roleLabel(role) }}
                  </button>
                </div>
              </div>
            </div>
        </div>

        <div class="rounded-xl border border-gray-700 bg-st-black/45 p-3 xl:col-start-1 xl:row-start-2">
            <div class="mb-2 flex items-center justify-between gap-2">
              <p class="text-gray-300">{{ t('builder.moves') }}</p>
              <p class="text-[11px] text-gray-500">{{ t('builder.movesDropdownHint') }}</p>
            </div>
            <div class="space-y-2">
              <div
                v-for="(move, index) in activeMember.moves"
                :key="`move-${index}`"
                class="relative"
                @mouseenter="hoveredMoveIndex = index"
                @mouseleave="hoveredMoveIndex = null"
                @focusin="onMoveFocusIn(index)"
                @focusout="onMoveFocusOut(index, $event)"
              >
                <SearchableSelect
                  :model-value="move"
                  :options="moveSelectOptions"
                  :disabled="!activePokemon"
                  :placeholder="`${t('builder.movePlaceholder')} ${index + 1}`"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateMove(index, $event)"
                >
                  <template #option="{ option }">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-semibold text-gray-100">{{ option.label }}</p>
                        <p class="move-option-effect mt-0.5 text-[10px] text-gray-400">
                          {{ option.meta?.effect || t('builder.noMoveDescription') }}
                        </p>
                      </div>
                      <div class="shrink-0 text-right text-[10px] text-gray-300">
                        <div class="mb-1 flex items-center justify-end gap-1">
                          <span
                            v-if="moveTypeIcon(option.meta?.type)"
                            class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5"
                          >
                            <img :src="moveTypeIcon(option.meta?.type) || ''" :alt="moveTypeLabel(option.meta?.type)" class="h-3 w-3" />
                            {{ moveTypeLabel(option.meta?.type) }}
                          </span>
                          <span class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5">
                            <img
                              v-if="moveCategoryIcon(option.meta?.category)"
                              :src="moveCategoryIcon(option.meta?.category) || ''"
                              :alt="moveCategoryLabel(option.meta?.category)"
                              class="h-3 w-3"
                            />
                            {{ moveCategoryLabel(option.meta?.category) }}
                          </span>
                        </div>
                        <div class="font-mono text-[10px] text-gray-400">
                          <span>{{ t('builder.movePowerShort') }} {{ moveValueLabel(option.meta?.power) }}</span>
                          <span class="px-1">|</span>
                          <span>{{ t('builder.moveAccuracyShort') }} {{ moveAccuracyValueLabel(option.meta?.accuracy) }}</span>
                          <span class="px-1">|</span>
                          <span>{{ t('builder.movePpShort') }} {{ moveValueLabel(option.meta?.pp) }}</span>
                        </div>
                      </div>
                    </div>
                  </template>
                </SearchableSelect>

                <button
                  v-if="selectedMoveEntry(index)"
                  type="button"
                  class="absolute right-8 top-1/2 z-10 -translate-y-1/2 rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200"
                  :title="t('builder.moveHoverHint')"
                >
                  ?
                </button>

                <div
                  v-if="selectedMoveEntry(index) && isMovePopoverOpen(index)"
                  class="absolute right-0 top-[calc(100%+0.3rem)] z-20 w-80 rounded-md border border-sky-500/40 bg-off-black/95 p-2 text-[11px] shadow-lg"
                >
                  <p class="font-semibold text-sky-200">
                    {{ selectedMoveEntry(index)?.name }}
                  </p>
                  <p class="mt-1 text-gray-300">
                    <span class="font-semibold text-gray-200">{{ t('builder.movePower') }}:</span>
                    {{ selectedMovePower(index) }}
                  </p>
                  <p class="mt-1 text-gray-300">
                    <span class="font-semibold text-gray-200">{{ t('builder.moveAccuracy') }}:</span>
                    {{ selectedMoveAccuracy(index) }}
                  </p>
                  <p class="mt-1 text-gray-300">
                    <span class="font-semibold text-gray-200">{{ t('builder.movePp') }}:</span>
                    {{ selectedMovePp(index) }}
                  </p>
                  <p class="mt-1 text-gray-300">
                    <span class="font-semibold text-gray-200">{{ t('builder.moveEffect') }}:</span>
                    {{ selectedMoveEffect(index) }}
                  </p>
                </div>
              </div>
            </div>
        </div>

        <div class="order-4 rounded-xl border border-gray-700 bg-st-black/45 p-3 xl:order-none xl:col-span-2 xl:row-start-3">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-sky-200">{{ t('builder.statTraining') }}</p>
            <label class="inline-flex items-center gap-2 text-xs text-gray-300">
              <span>{{ t('builder.calcLevel') }}</span>
              <input
                class="w-16 rounded border border-gray-700 bg-off-black/80 px-2 py-1 text-right text-xs text-gray-100"
                type="number"
                min="1"
                max="100"
                :value="battleLevel"
                @input="setBattleLevel(Number(($event.target as HTMLInputElement).value))"
              />
            </label>
          </div>

          <div class="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div class="space-y-4">
              <div class="grid gap-4 lg:grid-cols-2">
                <div>
                  <div class="mb-2 min-h-[2.5rem]">
                    <p class="text-gray-300">{{ t('builder.evs') }}</p>
                    <p class="text-xs text-gray-400">
                      {{ t('builder.totalEvs') }}: {{ totalEvs }}/{{ MAX_EVS }} | {{ t('builder.remainingEvs') }}: {{ remainingEvs }}
                    </p>
                  </div>
                  <div class="space-y-2">
                    <label
                      v-for="stat in STATS"
                      :key="`ev-${stat}`"
                      class="grid grid-cols-[2.75rem_minmax(0,1fr)_4.25rem] items-center gap-2 text-xs"
                    >
                      <span class="uppercase text-gray-300">{{ stat }}</span>
                      <input
                        class="ev-range-thumb-blue w-full accent-sky-400"
                        type="range"
                        min="0"
                        :max="evMaxForStat(stat)"
                        step="4"
                        :value="activeMember.evs[stat]"
                        @input="updateStat('evs', stat, Number(($event.target as HTMLInputElement).value))"
                      />
                      <input
                        class="w-full rounded-md border border-sky-500/35 bg-off-black/70 p-1 text-right"
                        type="number"
                        min="0"
                        :max="evMaxForStat(stat)"
                        step="4"
                        :value="activeMember.evs[stat]"
                        @input="updateStat('evs', stat, Number(($event.target as HTMLInputElement).value))"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <div class="mb-2 min-h-[2.5rem]">
                    <p class="text-gray-300">{{ t('builder.ivs') }}</p>
                    <p class="text-xs text-gray-400">0-{{ MAX_IV_PER_STAT }}</p>
                  </div>
                  <div class="space-y-2">
                    <label
                      v-for="stat in STATS"
                      :key="`iv-${stat}`"
                      class="grid grid-cols-[2.75rem_4.25rem] items-center justify-between gap-2 text-xs"
                    >
                      <span class="uppercase text-gray-300">{{ stat }}</span>
                      <input
                        class="w-full rounded-md border border-sky-500/35 bg-off-black/70 p-1 text-right"
                        type="number"
                        min="0"
                        :max="MAX_IV_PER_STAT"
                        step="1"
                        :value="activeMember.ivs[stat]"
                        @input="updateStat('ivs', stat, Number(($event.target as HTMLInputElement).value))"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <template v-if="activePokemon">
                <div>
                  <p class="mb-1 text-xs text-gray-400">{{ t('builder.baseStats') }}</p>
                  <p class="mb-1 text-[11px] text-gray-500">{{ t('builder.baseStatsHint') }}</p>
                  <div class="space-y-1.5">
                    <div v-for="stat in STATS" :key="`base-${stat}`" class="flex items-center gap-2 text-xs">
                      <span class="inline-flex w-12 items-center justify-between uppercase text-gray-300">
                        <span>{{ stat }}</span>
                        <span class="text-[10px] font-semibold" :class="natureIndicatorClass(stat)">{{ natureIndicator(stat) }}</span>
                      </span>
                      <div class="h-1.5 flex-1 rounded-full bg-gray-800">
                        <div class="h-full rounded-full bg-sky-500" :style="{ width: statBarWidth(stat) }" />
                      </div>
                      <span class="w-8 text-right text-gray-300">{{ activePokemon.baseStats[stat] }}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div class="mb-1 flex items-center justify-between gap-2 text-xs text-gray-400">
                    <span>{{ t('builder.finalStats') }}</span>
                    <span>{{ t('builder.calcLevel') }} {{ battleLevel }}</span>
                  </div>
                  <div class="space-y-1.5">
                    <div v-for="stat in STATS" :key="`final-${stat}`" class="flex items-center gap-2 text-xs">
                      <span class="inline-flex w-12 items-center justify-between uppercase text-gray-300">
                        <span>{{ stat }}</span>
                        <span class="text-[10px] font-semibold" :class="natureIndicatorClass(stat)">{{ natureIndicator(stat) }}</span>
                      </span>
                      <div class="relative h-1.5 flex-1 rounded-full bg-gray-800">
                        <div class="h-full rounded-full bg-sky-500" :style="{ width: finalStatBarWidth(stat) }" />
                        <div
                          v-if="finalGrowthPercent(stat) > 0"
                          class="absolute top-0 h-full rounded-r-full bg-emerald-400"
                          :style="{ left: `${finalBaselinePercent(stat)}%`, width: `${finalGrowthPercent(stat)}%` }"
                        />
                      </div>
                      <span class="w-8 text-right text-gray-100">{{ finalStats[stat] }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <div v-else class="rounded-lg border border-gray-700 bg-off-black/50 p-3 text-xs text-gray-500">
                {{ t('builder.slotEmptyHint') }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="order-3 rounded-xl border border-gray-700 bg-st-black/50 p-3 xl:order-none xl:col-start-2 xl:row-start-1 xl:row-span-2">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-sky-200">{{ t('builder.selectedPokemon') }}</h3>
          <button
            type="button"
            class="rounded-md border border-sky-500/45 bg-sky-500/15 px-2 py-1 text-[11px] text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!activePokemon"
            @click="openCompareModal"
          >
            {{ t('builder.compareButton') }}
          </button>
        </div>

        <template v-if="activePokemon">
          <div class="mb-3 flex items-center gap-3">
            <img
              :src="spriteUrl(activeMember.pokemonId)"
              :alt="activePokemon.name"
              class="h-20 w-20 rounded bg-black/20 object-contain"
              loading="lazy"
              @error="onSpriteError"
            />
            <div>
              <p class="text-sm font-semibold text-gray-100">{{ activePokemon.name }}</p>
              <p class="text-xs text-gray-400">{{ t('common.slot', { slot: activeMember.slot }) }}</p>
              <p class="text-xs text-gray-400">{{ t('builder.pokedexNumber') }} {{ activePokemon.pokedexNumber }}</p>
            </div>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.types') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="type in activePokemon.types"
                :key="type"
                class="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs"
              >
                <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-3.5 w-3.5" />
                {{ typeLabel(type) }}
              </span>
            </div>
            <p class="mt-1 text-[11px] text-gray-500">
              {{
                isTeraDefenseActive && activeMember.teraType
                  ? t('builder.currentDefenseType', { type: typeLabel(activeMember.teraType) })
                  : t('builder.currentDefenseOriginal')
              }}
            </p>
          </div>

          <div class="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-semibold text-sky-200">{{ t('builder.speedTier') }}</p>
              <p class="text-base font-semibold text-sky-100">{{ speedEffective }}</p>
            </div>
            <p class="text-[11px] text-gray-400">
              {{ t('builder.speedFinalValue', { value: speedFinal }) }}
            </p>

            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                class="rounded-md border px-2 py-0.5 text-[11px] transition"
                :class="speedTailwindActive ? 'border-sky-500/60 bg-sky-500/20 text-sky-100' : 'border-gray-700 bg-off-black/70 text-gray-300'"
                @click="toggleSpeedTailwind"
              >
                {{ t('builder.speedTailwind') }} x2
              </button>

              <button
                type="button"
                class="rounded-md border px-2 py-0.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-45"
                :class="speedScarfActive ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-100' : 'border-gray-700 bg-off-black/70 text-gray-300'"
                :disabled="!isChoiceScarfEquipped"
                :title="isChoiceScarfEquipped ? t('builder.speedScarf') : t('builder.speedScarfNeedsItem')"
                @click="toggleSpeedScarf"
              >
                {{ t('builder.speedScarf') }} x1.5
              </button>

              <span class="rounded-md border px-2 py-0.5 text-[11px]" :class="speedTrRankClass">
                {{ t('builder.speedTrRank') }}: {{ speedTrRankLabel }}
              </span>
            </div>

            <p
              v-if="speedComparison.text"
              class="mt-2 text-[11px] font-medium"
              :class="speedComparison.isFaster ? 'text-emerald-300' : 'text-rose-300'"
            >
              {{ speedComparison.isFaster ? '+' : '-' }} {{ speedComparison.text }}
            </p>
          </div>

          <div class="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
            <p class="text-xs font-semibold text-amber-200">{{ t('builder.slotWarnings') }}</p>
            <template v-if="slotWarnings.length > 0">
              <p
                v-for="(warning, index) in slotWarnings"
                :key="`slot-warning-${index}`"
                class="mt-1 text-[11px] text-amber-100"
              >
                - {{ warning }}
              </p>
            </template>
            <p v-else class="mt-1 text-[11px] text-amber-100/80">
              {{ t('builder.slotWarningsNone') }}
            </p>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.weaknesses') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="entry in defensiveWeaknesses"
                :key="`weak-${entry.type}`"
                class="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs"
              >
                <img :src="TYPE_META[entry.type].icon" :alt="typeLabel(entry.type)" class="h-3.5 w-3.5" />
                {{ typeLabel(entry.type) }} {{ factorLabel(entry.factor) }}
              </span>
              <span v-if="defensiveWeaknesses.length === 0" class="text-xs text-gray-500">{{ t('common.none') }}</span>
            </div>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.strengths') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="entry in defensiveStrengths"
                :key="`str-${entry.type}`"
                class="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs"
              >
                <img :src="TYPE_META[entry.type].icon" :alt="typeLabel(entry.type)" class="h-3.5 w-3.5" />
                {{ typeLabel(entry.type) }} {{ factorLabel(entry.factor) }}
              </span>
              <span v-if="defensiveStrengths.length === 0" class="text-xs text-gray-500">{{ t('common.none') }}</span>
            </div>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.evolution') }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <template v-for="(evo, index) in evolutionChainDetails" :key="`evo-${evo.id}`">
                <div class="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs">
                  <img
                    :src="spriteUrl(evo.id)"
                    :alt="evo.name"
                    class="h-4 w-4 rounded object-contain"
                    loading="lazy"
                    @error="onSpriteError"
                  />
                  {{ evo.name }}
                </div>
                <span v-if="index < evolutionChainDetails.length - 1" class="text-xs text-gray-500">></span>
              </template>
            </div>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.ability') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="ability in activePokemon.abilities" :key="ability" class="rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs">
                {{ abilityLabel(ability) }}
              </span>
            </div>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.suggestedItems') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="item in activePokemon.suggestedItems.slice(0, 3)" :key="item" class="rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs">
                {{ item }}
              </span>
            </div>
          </div>

          <div>
            <p class="mb-1 text-xs text-gray-400">{{ t('builder.suggestedMoves') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="move in activePokemon.suggestedMoves.slice(0, 4)" :key="move" class="rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs">
                {{ move }}
              </span>
            </div>
          </div>
        </template>

        <div v-else class="flex flex-col items-center gap-3 py-4 text-center">
          <img
            :src="mudkipSprite"
            alt="Mudkip"
            class="h-20 w-20 rounded bg-black/20 object-contain opacity-80 grayscale"
            loading="lazy"
          />
          <p class="text-xs text-gray-400">{{ t('builder.slotEmptyHint') }}</p>
        </div>
      </aside>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="showCompareModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeCompareModal"
    >
      <article class="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-sky-500/35 bg-off-black shadow-2xl">
        <header class="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-sky-200">{{ t('builder.compareTitle') }}</h3>
            <p class="text-[11px] text-gray-400">{{ t('builder.compareSubtitle') }}</p>
          </div>
          <button
            type="button"
            class="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-sky-500/50"
            @click="closeCompareModal"
          >
            {{ t('common.cancel') }}
          </button>
        </header>

        <div class="max-h-[calc(88vh-7.5rem)] overflow-y-auto p-4">
          <label class="block text-sm">
            <span class="mb-1 block text-gray-300">{{ t('builder.compareCandidate') }}</span>
            <SearchableSelect
              :model-value="comparePokemonId"
              :options="comparePokemonOptions"
              :placeholder="t('builder.compareSelect')"
              :no-results-label="t('dex.noSearchResults')"
              @update:model-value="onComparePokemonChange"
            />
          </label>

          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <section class="rounded-xl border border-gray-700 bg-st-black/50 p-3">
              <p class="text-xs font-semibold text-gray-300">{{ t('builder.compareCurrent') }}</p>
              <template v-if="activePokemon">
                <div class="mt-2 flex items-center gap-3">
                  <img :src="spriteUrl(activePokemon.id)" :alt="activePokemon.name" class="h-16 w-16 rounded bg-black/20 object-contain" @error="onSpriteError" />
                  <div>
                    <p class="text-sm font-semibold text-gray-100">{{ activePokemon.name }}</p>
                    <p class="text-xs text-gray-400">#{{ String(activePokemon.pokedexNumber).padStart(4, '0') }}</p>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="type in activePokemon.types"
                    :key="`cmp-current-${type}`"
                    class="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs"
                  >
                    <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-3.5 w-3.5" />
                    {{ typeLabel(type) }}
                  </span>
                </div>
              </template>
            </section>

            <section class="rounded-xl border border-sky-500/40 bg-sky-500/5 p-3">
              <p class="text-xs font-semibold text-sky-200">{{ t('builder.compareCandidateCard') }}</p>
              <template v-if="comparePokemon">
                <div class="mt-2 flex items-center gap-3">
                  <img :src="spriteUrl(comparePokemon.id)" :alt="comparePokemon.name" class="h-16 w-16 rounded bg-black/20 object-contain" @error="onSpriteError" />
                  <div>
                    <p class="text-sm font-semibold text-gray-100">{{ comparePokemon.name }}</p>
                    <p class="text-xs text-gray-400">#{{ String(comparePokemon.pokedexNumber).padStart(4, '0') }}</p>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="type in comparePokemon.types"
                    :key="`cmp-candidate-${type}`"
                    class="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs"
                  >
                    <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-3.5 w-3.5" />
                    {{ typeLabel(type) }}
                  </span>
                </div>
              </template>
              <p v-else class="mt-2 text-xs text-gray-500">{{ t('builder.comparePickFirst') }}</p>
            </section>
          </div>

          <div class="mt-4 rounded-xl border border-sky-500/35 bg-sky-500/5 p-3">
            <p class="text-xs font-semibold text-sky-200">{{ t('builder.compareCandidateSet') }}</p>

            <div class="mt-3 grid gap-3 md:grid-cols-3">
              <label class="block text-xs">
                <span class="mb-1 block text-gray-300">{{ t('builder.ability') }}</span>
                <SearchableSelect
                  :model-value="compareDraft.abilityId"
                  :options="compareAbilitySelectOptions"
                  :placeholder="t('builder.selectAbility')"
                  :disabled="!comparePokemon"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateCompareField('abilityId', $event)"
                />
              </label>

              <label class="block text-xs">
                <span class="mb-1 block text-gray-300">{{ t('builder.item') }}</span>
                <SearchableSelect
                  :model-value="compareDraft.itemId"
                  :options="itemSelectOptions"
                  :placeholder="t('builder.selectItem')"
                  :disabled="!comparePokemon"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateCompareField('itemId', $event)"
                />
              </label>

              <label class="block text-xs">
                <span class="mb-1 block text-gray-300">{{ t('builder.nature') }}</span>
                <SearchableSelect
                  :model-value="compareDraft.natureId"
                  :options="natureSelectOptions"
                  :disabled="!comparePokemon"
                  :clearable="false"
                  :no-results-label="t('dex.noSearchResults')"
                  @update:model-value="updateCompareField('natureId', $event)"
                />
              </label>
            </div>

            <div class="mt-3 space-y-2">
              <p class="text-xs font-semibold text-gray-300">{{ t('builder.moves') }}</p>
              <div class="grid gap-2 md:grid-cols-2">
                <label v-for="(move, index) in compareDraft.moves" :key="`cmp-move-${index}`" class="block text-xs">
                  <span class="mb-1 block text-gray-400">{{ t('builder.movePlaceholder') }} {{ index + 1 }}</span>
                  <SearchableSelect
                    :model-value="move"
                    :options="compareMoveSelectOptions"
                    :disabled="!comparePokemon"
                    :placeholder="`${t('builder.movePlaceholder')} ${index + 1}`"
                    :no-results-label="t('dex.noSearchResults')"
                    @update:model-value="updateCompareMove(index, $event)"
                  />
                </label>
              </div>
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p class="text-xs font-semibold text-gray-300">{{ t('builder.evs') }}</p>
                <p class="mb-2 text-[11px] text-gray-500">
                  {{ t('builder.totalEvs') }}: {{ compareTotalEvs }}/{{ MAX_EVS }} | {{ t('builder.remainingEvs') }}: {{ compareRemainingEvs }}
                </p>
                <div class="space-y-1.5">
                  <label
                    v-for="stat in STATS"
                    :key="`cmp-ev-${stat}`"
                    class="grid grid-cols-[2.2rem_minmax(0,1fr)_4.1rem] items-center gap-2 text-xs"
                  >
                    <span class="uppercase text-gray-300">{{ stat }}</span>
                    <input
                      class="ev-range-thumb-blue w-full accent-sky-400"
                      type="range"
                      min="0"
                      :max="compareEvMaxForStat(stat)"
                      step="4"
                      :value="compareDraft.evs[stat]"
                      :disabled="!comparePokemon"
                      @input="updateCompareStat('evs', stat, Number(($event.target as HTMLInputElement).value))"
                    />
                    <input
                      class="w-full rounded-md border border-sky-500/35 bg-off-black/70 p-1 text-right"
                      type="number"
                      min="0"
                      :max="compareEvMaxForStat(stat)"
                      step="4"
                      :value="compareDraft.evs[stat]"
                      :disabled="!comparePokemon"
                      @change="updateCompareStat('evs', stat, Number(($event.target as HTMLInputElement).value))"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p class="text-xs font-semibold text-gray-300">{{ t('builder.ivs') }}</p>
                <p class="mb-2 text-[11px] text-gray-500">0-{{ MAX_IV_PER_STAT }}</p>
                <div class="space-y-1.5">
                  <label
                    v-for="stat in STATS"
                    :key="`cmp-iv-${stat}`"
                    class="grid grid-cols-[2.2rem_minmax(0,1fr)] items-center gap-2 text-xs"
                  >
                    <span class="uppercase text-gray-300">{{ stat }}</span>
                    <input
                      class="w-full rounded-md border border-sky-500/35 bg-off-black/70 p-1 text-right"
                      type="number"
                      min="0"
                      :max="MAX_IV_PER_STAT"
                      step="1"
                      :value="compareDraft.ivs[stat]"
                      :disabled="!comparePokemon"
                      @input="updateCompareStat('ivs', stat, Number(($event.target as HTMLInputElement).value))"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-xl border border-gray-700 bg-st-black/50 p-3">
            <p class="text-xs font-semibold text-gray-200">{{ t('builder.compareStatsTitle') }}</p>
            <p class="mt-1 text-[11px] text-gray-400">{{ t('builder.compareStatsHint', { level: battleLevel }) }}</p>

            <div class="mt-3 space-y-1.5">
              <div
                v-for="stat in STATS"
                :key="`compare-stat-${stat}`"
                class="grid grid-cols-[2.4rem_1fr_1fr_1fr] items-center gap-2 text-xs"
              >
                <span class="uppercase text-gray-400">{{ stat }}</span>
                <span class="rounded border border-gray-700 bg-off-black/60 px-2 py-1 text-right text-gray-200">
                  {{ finalStats[stat] }}
                </span>
                <span class="rounded border border-gray-700 bg-off-black/60 px-2 py-1 text-right text-gray-200">
                  {{ compareFinalStats[stat] }}
                </span>
                <span class="text-right font-semibold" :class="statDeltaClass(compareStatDiffs[stat])">
                  {{ signed(compareStatDiffs[stat]) }}
                </span>
              </div>
            </div>

            <div class="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div class="rounded border border-gray-700 bg-off-black/60 px-2 py-1.5">
                <p class="text-gray-400">{{ t('builder.compareBaseTotal') }}</p>
                <p class="font-semibold text-gray-100">{{ compareBaseTotal }} -> {{ compareCandidateBaseTotal }}</p>
                <p class="font-semibold" :class="statDeltaClass(compareBaseDelta)">{{ signed(compareBaseDelta) }}</p>
              </div>
              <div class="rounded border border-gray-700 bg-off-black/60 px-2 py-1.5">
                <p class="text-gray-400">{{ t('builder.compareFinalTotal') }}</p>
                <p class="font-semibold text-gray-100">{{ compareFinalTotal }} -> {{ compareCandidateFinalTotal }}</p>
                <p class="font-semibold" :class="statDeltaClass(compareFinalDelta)">{{ signed(compareFinalDelta) }}</p>
              </div>
              <div class="rounded border border-gray-700 bg-off-black/60 px-2 py-1.5">
                <p class="text-gray-400">{{ t('builder.speedTier') }}</p>
                <p class="font-semibold text-gray-100">{{ speedFinal }} -> {{ compareSpeedFinal }}</p>
                <p class="font-semibold" :class="statDeltaClass(compareSpeedDelta)">{{ signed(compareSpeedDelta) }}</p>
              </div>
            </div>
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <section class="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
              <p class="text-xs font-semibold text-red-200">{{ t('builder.weaknesses') }}</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="entry in defensiveWeaknesses.slice(0, 8)"
                  :key="`cmp-current-weak-${entry.type}`"
                  class="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-xs"
                >
                  <img :src="TYPE_META[entry.type].icon" :alt="typeLabel(entry.type)" class="h-3.5 w-3.5" />
                  {{ typeLabel(entry.type) }} {{ factorLabel(entry.factor) }}
                </span>
                <span v-if="defensiveWeaknesses.length === 0" class="text-xs text-gray-500">{{ t('common.none') }}</span>
              </div>
            </section>

            <section class="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
              <p class="text-xs font-semibold text-red-200">{{ t('builder.compareCandidateWeaknesses') }}</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="entry in (comparePokemonProfile?.weaknesses ?? []).slice(0, 8)"
                  :key="`cmp-candidate-weak-${entry.type}`"
                  class="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-xs"
                >
                  <img :src="TYPE_META[entry.type].icon" :alt="typeLabel(entry.type)" class="h-3.5 w-3.5" />
                  {{ typeLabel(entry.type) }} {{ factorLabel(entry.factor) }}
                </span>
                <span v-if="!comparePokemonProfile || comparePokemonProfile.weaknesses.length === 0" class="text-xs text-gray-500">{{ t('common.none') }}</span>
              </div>
            </section>
          </div>

          <div class="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs">
            <p class="font-semibold text-cyan-200">{{ t('builder.compareTeamImpact') }}</p>
            <template v-if="compareTeamAnalytics">
              <p class="mt-1 text-gray-300">
                {{ t('builder.compareTeamScore', { current: currentTeamAnalytics.totalScore, candidate: compareTeamAnalytics.totalScore }) }}
              </p>
              <p class="mt-1 font-semibold" :class="statDeltaClass(compareTeamScoreDelta ?? 0)">
                {{ t('builder.compareTeamDelta', { value: signed(compareTeamScoreDelta ?? 0) }) }}
              </p>
            </template>
            <p v-else class="mt-1 text-gray-400">{{ t('builder.comparePickFirst') }}</p>
            <p class="mt-2 text-[11px] text-gray-400">{{ t('builder.compareTeamImpactHint') }}</p>
          </div>
        </div>

        <footer class="flex items-center justify-end gap-2 border-t border-gray-700 px-4 py-3">
          <button
            type="button"
            class="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300"
            @click="closeCompareModal"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-sky-500/45 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!comparePokemon"
            @click="applyComparePokemonOnly"
          >
            {{ t('builder.compareApplyPokemonOnly') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-xs text-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!comparePokemon"
            @click="applyCompareFullSet"
          >
            {{ t('builder.compareApplyFullSet') }}
          </button>
        </footer>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
.move-option-effect {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ev-range-thumb-blue::-webkit-slider-thumb {
  background: #38bdf8;
  border: 1px solid #0369a1;
}

.ev-range-thumb-blue::-moz-range-thumb {
  background: #38bdf8;
  border: 1px solid #0369a1;
}
</style>
