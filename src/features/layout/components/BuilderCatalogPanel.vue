<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDebounce } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type {
  BattleMode,
  MoveEntry,
  PokemonEntry,
  PokemonTypeKey,
  TeamMember,
  TeamRole,
} from '@/models/domain'
import { TEAM_ROLES, TYPE_KEYS } from '@/models/domain'
import { useDexStore } from '@/stores/dex'
import { useMetaUsageStore } from '@/stores/meta-usage'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'
import { TYPE_META } from '@/models/type-meta'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { getEffectiveLearnsetMoveIds } from '@/utils/move-legality'
import itemPanelIcon from '@/assets/pokesprite/icons/battle-item/x-attack.png'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'

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
  effect: string
}

interface PanelItemEntry {
  id: string
  name: string
  idNorm: string
  nameNorm: string
  effectNorm: string
  effect: string
  icon: string | null
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

interface TeamComplementContext {
  missingRoles: TeamRole[]
  weaknesses: Record<PokemonTypeKey, number>
}

const route = useRoute()
const { t, locale } = useI18n()
const uiStore = useUiStore()
const dexStore = useDexStore()
const metaUsageStore = useMetaUsageStore()
const teamStore = useTeamStore()

const searchRaw = ref('')
const searchDebounced = useDebounce(searchRaw, 160)
const PREVIEW_LIMIT_BY_SOURCE = {
  pokemon: 48,
  items: 120,
  moves: 120,
} as const
const SEARCH_LIMIT_BY_SOURCE = {
  pokemon: 140,
  items: 260,
  moves: 260,
} as const
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

const metaStatus = computed(() => metaUsageStore.getModeStatus(mode.value))
const isMetaLoading = computed(() => metaStatus.value === 'loading' || metaStatus.value === 'idle')
const isMetaFallback = computed(() => metaStatus.value === 'error')

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
})

const previewRoleCache = new Map<string, TeamRole[]>()

const teamMembersWithoutCurrentSlot = computed(() =>
  activeTeam.value.members.filter((member) => member.slot !== activeMember.value.slot && member.pokemonId),
)
const duplicateBlockedPokemonIds = computed(() => new Set(teamMembersWithoutCurrentSlot.value.map((member) => member.pokemonId)))
const pokemonCatalog = computed(() => dexStore.getPokemonByMode(mode.value))

const pokemonById = computed(() => new Map(pokemonCatalog.value.map((pokemon) => [pokemon.id, pokemon])))
const moveById = computed(() => new Map(dexStore.moves.map((move) => [move.id, move])))
watch([mode, metaStatus, () => pokemonCatalog.value.length], () => {
  previewRoleCache.clear()
})
const usageByPokemonId = computed(() => {
  const map = new Map<string, number>()
  for (const pokemon of pokemonCatalog.value) {
    const usage = metaUsageStore.getPokemonMeta(mode.value, pokemon.id)?.usage ?? 0
    if (usage > 0) map.set(pokemon.id, usage)
  }
  return map
})
const teammateSynergyByCandidate = computed(() => {
  const map = new Map<string, number>()
  const relatedMembers = teamMembersWithoutCurrentSlot.value.filter((member) => member.pokemonId)
  for (const member of relatedMembers) {
    const teammateUsage = metaUsageStore.getPokemonMeta(mode.value, member.pokemonId)
    if (!teammateUsage) continue
    for (const entry of teammateUsage.teammates) {
      map.set(entry.id, (map.get(entry.id) ?? 0) + entry.weight)
    }
  }
  return map
})

const contextualHint = computed(() => {
  if (source.value === 'items' && !activePokemon.value) return t('builder.catalogItemsNeedPokemon')
  if (source.value === 'moves' && !activePokemon.value) return t('builder.catalogMovesNeedPokemon')
  if (source.value === 'pokemon' && !activePokemon.value) return t('builder.catalogPokemonHintEmpty')
  if (source.value === 'pokemon' && activePokemon.value) return t('builder.catalogPokemonHintFilled')
  return ''
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
    .map((item) => ({
      id: item.id,
      name: item.name,
      idNorm: normalizeText(item.id),
      nameNorm: normalizeText(item.name),
      effectNorm: normalizeText(item.description || item.effect || ''),
      effect: item.description || item.effect || '',
      icon: item.icon ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, localeCode()))
})

const rankedItemEntries = computed<PanelItemEntry[]>(() => {
  const activePokemonEntry = activePokemon.value
  if (!activePokemonEntry) return itemEntries.value

  const fallbackRanking = rankingFromOrderedIds(activePokemonEntry.suggestedItems ?? [])
  const rankedByMeta = rankingFromWeightedIds(metaUsageStore.getPokemonMeta(mode.value, activePokemonEntry.id)?.items ?? [])

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
  const rankedByMeta = rankingFromWeightedIds(metaUsageStore.getPokemonMeta(mode.value, activePokemon.value.id)?.moves ?? [])

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
      : t('builder.catalogPanelMoves'),
)

const searchPlaceholder = computed(() =>
  source.value === 'items'
    ? t('builder.catalogSearchItems')
    : source.value === 'pokemon'
      ? t('builder.catalogSearchPokemon')
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
  sourceKind: 'pokemon' | 'items' | 'moves',
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

function spriteUrl(pokemonId: string): string {
  if (!pokemonId) return mudkipSprite
  return `https://img.pokemondb.net/sprites/home/normal/${pokemonId}.png`
}

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
}

function spriteIdFromUrl(url: string): string {
  const marker = '/sprites/home/normal/'
  const markerIndex = url.lastIndexOf(marker)
  if (markerIndex === -1) return ''
  return url.slice(markerIndex + marker.length).replace('.png', '').toLowerCase()
}

function onSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  const failedId = spriteIdFromUrl(target.src)
  const aliasId = spriteAliasFallback[failedId]
  if (aliasId && target.dataset.spriteAliasTried !== aliasId) {
    target.dataset.spriteAliasTried = aliasId
    target.src = `https://img.pokemondb.net/sprites/home/normal/${aliasId}.png`
    return
  }

  if (target.src !== mudkipSprite) {
    target.src = mudkipSprite
  }
}

function itemIconUrl(item: PanelItemEntry): string {
  if (item.icon) return item.icon
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.id}.png`
}

function onItemIconError(event: Event) {
  const target = event.target as HTMLImageElement
  if (target.src !== itemPanelIcon) {
    target.src = itemPanelIcon
  }
}

function applyPokemonSelection(pokemonId: string) {
  if (!pokemonId) return
  uiStore.setBuilderCatalogSource('pokemon')
  const pokemon = dexStore.getPokemon(mode.value, pokemonId)
  const suggestedMoves = pokemon ? preferredMovesForPokemon(pokemon) : ['', '', '', '']

  teamStore.updateMember(mode.value, activeMember.value.slot, {
    pokemonId,
    abilityId: pokemon?.abilities[0] ?? '',
    itemId: pokemon?.suggestedItems[0] ?? '',
    natureId: pokemon?.defaultNature ?? activeMember.value.natureId,
    moves: [
      suggestedMoves[0],
      suggestedMoves[1],
      suggestedMoves[2],
      suggestedMoves[3],
    ],
    roleTags: pokemon ? resolveRoleTagsForSet(suggestedMoves, pokemon.roleTags, pokemon) : [],
  })
}

function applyItemSelection(itemId: string) {
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

  const fallbackPool = [...pokemon.suggestedMoves, ...effectiveLearnset]
  const unique = [...new Set([...metaMoves, ...fallbackPool])].filter(Boolean)
  return [unique[0] ?? '', unique[1] ?? '', unique[2] ?? '', unique[3] ?? '']
}

function previewMovesForRoleRanking(pokemon: PokemonEntry): string[] {
  const metaTop = (metaUsageStore.getPokemonMeta(mode.value, pokemon.id)?.moves ?? [])
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
  let candidates = pokemonCatalog.value.filter((pokemon) => !blocked.has(pokemon.id))
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
      const score = teammateSynergy * 0.5 + entry.teamComplement * 0.3 + usage * 0.2
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
  let candidates = pokemonCatalog.value.filter((pokemon) => {
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

  return candidates
    .map((pokemon) => {
      const candidateRoles = candidateRolesForRanking(pokemon)
      const roleScore = roleSimilarity(candidateRoles, targetRoles)
      const typeScores = typeOverlap(pokemon, targetPokemon)
      const complement = teamComplementScore(pokemon, context, candidateRoles)
      const usage = usageValue(pokemon.id)
      return toRankedPokemonEntry(
        pokemon,
        roleScore,
        typeScores.primary,
        typeScores.secondary,
        complement,
        usage,
        0,
      )
    })
    .sort(
      (a, b) =>
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
  <section class="hidden h-full min-h-0 rounded-2xl border border-sky-500/25 bg-off-black/70 p-3 lg:flex lg:flex-col">
    <div class="shrink-0">
      <h2 class="text-sm font-semibold text-sky-300">{{ panelTitle }}</h2>
      <p class="mt-1 text-[11px] text-gray-400">{{ t('builder.catalogPanelHint') }}</p>
      <p
        v-if="metaStatusText"
        class="mt-1 text-[11px]"
        :class="isMetaFallback ? 'text-amber-300' : isMetaLoading ? 'text-sky-300' : 'text-emerald-300'"
      >
        {{ metaStatusText }}
      </p>
      <p v-if="contextualHint" class="mt-1 text-[11px] text-gray-400">
        {{ contextualHint }}
      </p>
    </div>

    <template v-if="isBuilderRoute">
      <input
        v-model="searchRaw"
        type="text"
        class="mt-3 w-full shrink-0 rounded-md border border-gray-700 bg-st-black px-2 py-1.5 text-xs"
        :placeholder="searchPlaceholder"
      />

      <div class="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <template v-if="source === 'items'">
          <button
            v-for="item in filteredItems"
            :key="`item-${item.id}`"
            type="button"
            class="w-full rounded-lg border p-2 text-left transition cursor-pointer"
            :class="activeMember.itemId === item.id ? 'border-sky-500/70 bg-sky-500/15' : 'border-gray-700 bg-st-black/55 hover:border-sky-500/40'"
            @click="applyItemSelection(item.id)"
          >
            <div class="flex items-start gap-2">
              <img :src="itemIconUrl(item)" :alt="item.name" class="mt-0.5 h-4 w-4 shrink-0 object-contain opacity-90" @error="onItemIconError" />
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold text-gray-100">{{ item.name }}</p>
                <p class="mt-1 text-[11px] text-gray-400">{{ item.effect || t('builder.noItemDescription') }}</p>
              </div>
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
              <img
                :src="spriteUrl(pokemon.id)"
                :alt="pokemon.name"
                class="h-8 w-8 shrink-0 rounded bg-black/25 object-contain"
                loading="lazy"
                @error="onSpriteError"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-semibold text-gray-100">
                  #{{ String(pokemon.pokedexNumber).padStart(4, '0') }} {{ pokemon.name }}
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

        <template v-else>
          <button
            v-for="move in filteredMoves"
            :key="`move-${move.id}`"
            type="button"
            class="w-full rounded-lg border p-2 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            :class="activeMember.moves.includes(move.id) ? 'border-sky-500/70 bg-sky-500/15' : 'border-gray-700 bg-st-black/55 hover:border-sky-500/40'"
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
