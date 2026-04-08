<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'
import { MAX_IV_PER_STAT, STATS, TYPE_KEYS, type BattleMode, type LocaleCode, type PokemonTypeKey } from '@/models/domain'
import type { DexAvailabilityFilterKey, DexPokemonProfile } from '@/models/dex'
import { TYPE_META } from '@/models/type-meta'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { useDexStore } from '@/stores/dex'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'

interface GenerationTab {
  id: number
  key: string
  regionEs: string
  regionEn: string
  starterId: string
  offset: number
  limit: number
  available: boolean
}

type ProfileStatKey = keyof DexPokemonProfile['stats']
type MoveCategory = 'physical' | 'special' | 'status'
type EvolutionVariantKind = DexPokemonProfile['evolutionChain'][number]['variants'][number]['kind']
type DexProfileVariantOption = {
  id: string
  name: string
  kind: EvolutionVariantKind | 'base'
  isCurrent: boolean
}
type VersionFilterOption = {
  id: string
  short: string
  color: string
  labelEs: string
  labelEn: string
  historical?: boolean
}
type GenerationTypeFilterOption = {
  type: PokemonTypeKey
  count: number
}
type GenerationAvailabilityFilterOption = {
  key: DexAvailabilityFilterKey
  count: number
}
type DexGenerationEntry = ReturnType<typeof useDexStore>['getGenerationEntries'] extends (
  generationId: number,
  locale?: LocaleCode,
) => infer T
  ? T extends Array<infer Entry>
    ? Entry
    : never
  : never

const TYPE_COLORS: Record<PokemonTypeKey, string> = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
}

const STAT_KEYS: ProfileStatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
const GAME_AVAILABILITY_OPTIONS: Array<{
  key: DexAvailabilityFilterKey
  labelEs: string
  labelEn: string
  short: string
}> = [
  {
    key: 'scarlet-violet',
    labelEs: 'Escarlata/Purpura',
    labelEn: 'Scarlet/Violet',
    short: 'SV',
  },
  {
    key: 'sword-shield',
    labelEs: 'Espada/Escudo',
    labelEn: 'Sword/Shield',
    short: 'SwSh',
  },
  {
    key: 'pokemon-champions',
    labelEs: 'Pokemon Champions',
    labelEn: 'Pokemon Champions',
    short: 'CH',
  },
]

const generationTabs: GenerationTab[] = [
  { id: 1, key: 'I', regionEs: 'Kanto', regionEn: 'Kanto', starterId: 'bulbasaur', offset: 0, limit: 151, available: true },
  { id: 2, key: 'II', regionEs: 'Johto', regionEn: 'Johto', starterId: 'chikorita', offset: 151, limit: 100, available: true },
  { id: 3, key: 'III', regionEs: 'Hoenn', regionEn: 'Hoenn', starterId: 'mudkip', offset: 251, limit: 135, available: true },
  { id: 4, key: 'IV', regionEs: 'Sinnoh', regionEn: 'Sinnoh', starterId: 'turtwig', offset: 386, limit: 107, available: true },
  { id: 5, key: 'V', regionEs: 'Teselia', regionEn: 'Unova', starterId: 'snivy', offset: 493, limit: 156, available: true },
  { id: 6, key: 'VI', regionEs: 'Kalos', regionEn: 'Kalos', starterId: 'chespin', offset: 649, limit: 72, available: true },
  { id: 7, key: 'VII', regionEs: 'Alola', regionEn: 'Alola', starterId: 'rowlet', offset: 721, limit: 88, available: true },
  { id: 8, key: 'VIII', regionEs: 'Galar', regionEn: 'Galar', starterId: 'grookey', offset: 809, limit: 96, available: true },
  { id: 9, key: 'IX', regionEs: 'Paldea', regionEn: 'Paldea', starterId: 'sprigatito', offset: 905, limit: 120, available: true },
]

const MOVE_CATEGORIES: MoveCategory[] = ['physical', 'special', 'status']

const VERSION_GROUP_META: Record<string, Omit<VersionFilterOption, 'id' | 'historical'>> = {
  'red-blue': { short: 'RB', color: '#ef4444', labelEs: 'Rojo/Azul', labelEn: 'Red/Blue' },
  yellow: { short: 'Y', color: '#f59e0b', labelEs: 'Amarillo', labelEn: 'Yellow' },
  'gold-silver': { short: 'GS', color: '#eab308', labelEs: 'Oro/Plata', labelEn: 'Gold/Silver' },
  crystal: { short: 'C', color: '#22d3ee', labelEs: 'Cristal', labelEn: 'Crystal' },
  'ruby-sapphire': { short: 'RS', color: '#dc2626', labelEs: 'Ruby/Sapphire', labelEn: 'Ruby/Sapphire' },
  emerald: { short: 'E', color: '#16a34a', labelEs: 'Esmeralda', labelEn: 'Emerald' },
  'firered-leafgreen': { short: 'FRLG', color: '#f97316', labelEs: 'Rojo Fuego/Verde Hoja', labelEn: 'FireRed/LeafGreen' },
  'diamond-pearl': { short: 'DP', color: '#60a5fa', labelEs: 'Diamante/Perla', labelEn: 'Diamond/Pearl' },
  platinum: { short: 'Pt', color: '#94a3b8', labelEs: 'Platino', labelEn: 'Platinum' },
  'heartgold-soulsilver': { short: 'HGSS', color: '#facc15', labelEs: 'HeartGold/SoulSilver', labelEn: 'HeartGold/SoulSilver' },
  'black-white': { short: 'BW', color: '#111827', labelEs: 'Negro/Blanco', labelEn: 'Black/White' },
  'black-2-white-2': { short: 'B2W2', color: '#334155', labelEs: 'Negro 2/Blanco 2', labelEn: 'Black 2/White 2' },
  'x-y': { short: 'XY', color: '#7c3aed', labelEs: 'X/Y', labelEn: 'X/Y' },
  'omega-ruby-alpha-sapphire': { short: 'ORAS', color: '#dc2626', labelEs: 'Omega Ruby/Alpha Sapphire', labelEn: 'Omega Ruby/Alpha Sapphire' },
  'sun-moon': { short: 'SM', color: '#f97316', labelEs: 'Sol/Luna', labelEn: 'Sun/Moon' },
  'ultra-sun-ultra-moon': { short: 'USUM', color: '#fb7185', labelEs: 'Ultra Sol/Ultra Luna', labelEn: 'Ultra Sun/Ultra Moon' },
  'lets-go-pikachu-lets-go-eevee': { short: 'LGPE', color: '#eab308', labelEs: 'Lets Go', labelEn: 'Lets Go' },
  'sword-shield': { short: 'SwSh', color: '#3b82f6', labelEs: 'Espada/Escudo', labelEn: 'Sword/Shield' },
  'brilliant-diamond-and-shining-pearl': { short: 'BDSP', color: '#60a5fa', labelEs: 'Diamante Brillante/Perla Reluciente', labelEn: 'Brilliant Diamond/Shining Pearl' },
  'legends-arceus': { short: 'LA', color: '#94a3b8', labelEs: 'Leyendas Arceus', labelEn: 'Legends Arceus' },
  'scarlet-violet': { short: 'SV', color: '#a855f7', labelEs: 'Escarlata/Purpura', labelEn: 'Scarlet/Violet' },
  colosseum: { short: 'Col', color: '#0f766e', labelEs: 'Colosseum', labelEn: 'Colosseum' },
  xd: { short: 'XD', color: '#0369a1', labelEs: 'XD', labelEn: 'XD' },
  stadium: { short: 'S', color: '#3b82f6', labelEs: 'Stadium', labelEn: 'Stadium' },
}

const VERSION_GROUP_ORDER = [
  'red-blue',
  'yellow',
  'gold-silver',
  'crystal',
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
  'black-white',
  'black-2-white-2',
  'x-y',
  'omega-ruby-alpha-sapphire',
  'sun-moon',
  'ultra-sun-ultra-moon',
  'lets-go-pikachu-lets-go-eevee',
  'sword-shield',
  'brilliant-diamond-and-shining-pearl',
  'legends-arceus',
  'scarlet-violet',
]

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const dexStore = useDexStore()
const teamStore = useTeamStore()
const uiStore = useUiStore()

const activeGeneration = ref(1)
const entries = ref<DexGenerationEntry[]>([])
const pokemonSearch = ref('')
const showShinySprites = ref(false)
const isLoading = ref(false)
const loadError = ref('')
const typeFilter = ref<PokemonTypeKey | null>(null)
const availabilityFilter = ref<'all' | DexAvailabilityFilterKey>('all')

const selectedProfile = ref<DexPokemonProfile | null>(null)
const isProfileLoading = ref(false)
const isProfileDetailsLoading = ref(false)
const profileError = ref('')
const moveSearch = ref<Record<MoveCategory, string>>({
  physical: '',
  special: '',
  status: '',
})
const selectedMoveByCategory = ref<Record<MoveCategory, string>>({
  physical: '',
  special: '',
  status: '',
})
const selectedVersionFilter = ref('history')
const addToTeamSlot = ref<1 | 2 | 3 | 4 | 5 | 6>(1)
const addToTeamMessage = ref('')
const addToTeamError = ref(false)

const slotOptions: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6]
const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))

const currentTab = computed(() => generationTabs.find((tab) => tab.id === activeGeneration.value) ?? generationTabs[0])

const selectedPokemonId = computed<string | null>(() => {
  const value = route.query.pokemon
  if (typeof value === 'string' && value.length > 0) return value
  return null
})

const mudkipTitleSprite = computed(() =>
  showShinySprites.value
    ? 'https://play.pokemonshowdown.com/sprites/ani-shiny/mudkip.gif'
    : 'https://play.pokemonshowdown.com/sprites/ani/mudkip.gif',
)

const primaryType = computed<PokemonTypeKey | null>(() => selectedProfile.value?.types[0] ?? null)
const primaryColor = computed(() => (primaryType.value ? TYPE_COLORS[primaryType.value] : '#38bdf8'))

const statRows = computed(() => {
  if (!selectedProfile.value) return []
  return STAT_KEYS.map((key) => ({ key, value: selectedProfile.value?.stats[key] ?? 0 }))
})

const weaknessRows = computed(() => {
  if (!selectedProfile.value) return [] as Array<{ type: PokemonTypeKey; factor: number }>
  const [typeA, typeB] = selectedProfile.value.types
  return TYPE_KEYS.map((attackType) => ({
    type: attackType,
    factor: effectivenessAgainstDual(attackType, typeA, typeB),
  }))
    .filter((entry) => entry.factor > 1)
    .sort((a, b) => b.factor - a.factor)
})

const resistanceRows = computed(() => {
  if (!selectedProfile.value) return [] as Array<{ type: PokemonTypeKey; factor: number }>
  const [typeA, typeB] = selectedProfile.value.types
  return TYPE_KEYS.map((attackType) => ({
    type: attackType,
    factor: effectivenessAgainstDual(attackType, typeA, typeB),
  }))
    .filter((entry) => entry.factor < 1)
    .sort((a, b) => a.factor - b.factor)
})

const movesByCategory = computed(() => {
  const moves = selectedProfile.value?.moves ?? []
  return {
    physical: moves.filter((move) => move.category === 'physical'),
    special: moves.filter((move) => move.category === 'special'),
    status: moves.filter((move) => move.category === 'status'),
  } as Record<MoveCategory, DexPokemonProfile['moves']>
})

const filteredMovesByCategory = computed(() => {
  const byVersion = (moves: DexPokemonProfile['moves']) => {
    if (selectedVersionFilter.value === 'history') return moves
    return moves.filter((move) => move.versionGroups.includes(selectedVersionFilter.value))
  }

  return MOVE_CATEGORIES.reduce(
    (acc, category) => {
      const query = moveSearch.value[category].trim().toLowerCase()
      const versionScoped = byVersion(movesByCategory.value[category])
      acc[category] = query
        ? versionScoped.filter((move) => move.name.toLowerCase().includes(query))
        : versionScoped
      return acc
    },
    { physical: [], special: [], status: [] } as Record<MoveCategory, DexPokemonProfile['moves']>,
  )
})

const versionFilterOptions = computed(() => {
  const groups = new Set<string>()
  for (const move of selectedProfile.value?.moves ?? []) {
    for (const group of move.versionGroups) groups.add(group)
  }

  const sortedGroups = [...groups].sort((a, b) => versionOrder(a) - versionOrder(b))
  const options = sortedGroups.map((group) => toVersionOption(group))
  return [{ id: 'history', short: 'H', color: '#38bdf8', labelEs: 'Historico', labelEn: 'Historical', historical: true }, ...options]
})

const selectedVersionOption = computed(() => {
  return versionFilterOptions.value.find((option) => option.id === selectedVersionFilter.value) ?? versionFilterOptions.value[0] ?? null
})

const generationTypeFilters = computed<GenerationTypeFilterOption[]>(() => {
  return TYPE_KEYS.map((type) => ({
    type,
    count: entries.value.filter((entry) => entry.types.includes(type)).length,
  })).filter((entry) => entry.count > 0)
})

const generationAvailabilityFilters = computed<GenerationAvailabilityFilterOption[]>(() => {
  return GAME_AVAILABILITY_OPTIONS.map((option) => ({
    key: option.key,
    count: entries.value.filter((entry) => (entry.gameAvailability ?? []).includes(option.key)).length,
  })).filter((entry) => entry.count > 0)
})

const selectedAvailabilityOption = computed(() => {
  if (availabilityFilter.value === 'all') return null
  return GAME_AVAILABILITY_OPTIONS.find((option) => option.key === availabilityFilter.value) ?? null
})

const hasSearchQuery = computed(() => pokemonSearch.value.trim().length > 0)
const hasActiveDexFilters = computed(
  () => hasSearchQuery.value || typeFilter.value !== null || availabilityFilter.value !== 'all',
)

const filteredEntries = computed(() => {
  const query = normalizeSearchText(pokemonSearch.value)

  return entries.value.filter((entry) => {
    const matchesType = !typeFilter.value || entry.types.includes(typeFilter.value)
    if (!matchesType) return false

    const matchesAvailability =
      availabilityFilter.value === 'all' ||
      (entry.gameAvailability ?? []).includes(availabilityFilter.value)
    if (!matchesAvailability) return false

    if (!query) return true

    const byName = normalizeSearchText(entry.name).includes(query)
    const byId = normalizeSearchText(entry.id).includes(query)
    const byDexNumber = String(entry.pokedexNumber).includes(query)
    const byTypes = entry.types.some((type) => normalizeSearchText(type).includes(query))
    return byName || byId || byDexNumber || byTypes
  })
})

const noResultsMessage = computed(() => {
  if (typeFilter.value && availabilityFilter.value !== 'all' && hasSearchQuery.value) {
    return t('dex.noResultsWithTypeAvailabilityAndSearch', {
      type: typeLabel(typeFilter.value),
      game: availabilityFilterLabel(availabilityFilter.value),
    })
  }
  if (typeFilter.value && availabilityFilter.value !== 'all') {
    return t('dex.noResultsWithTypeAndAvailability', {
      type: typeLabel(typeFilter.value),
      game: availabilityFilterLabel(availabilityFilter.value),
    })
  }
  if (typeFilter.value && hasSearchQuery.value) {
    return t('dex.noResultsWithTypeAndSearch', { type: typeLabel(typeFilter.value) })
  }
  if (availabilityFilter.value !== 'all' && hasSearchQuery.value) {
    return t('dex.noResultsWithAvailabilityAndSearch', {
      game: availabilityFilterLabel(availabilityFilter.value),
    })
  }
  if (typeFilter.value) {
    return t('dex.noResultsForType', { type: typeLabel(typeFilter.value) })
  }
  if (availabilityFilter.value !== 'all') {
    return t('dex.noResultsForAvailability', {
      game: availabilityFilterLabel(availabilityFilter.value),
    })
  }
  return t('dex.noSearchResults')
})

const activeTeam = computed(() => teamStore.getActiveTeam(mode.value))
const targetSlotMember = computed(() => {
  return activeTeam.value.members.find((member) => member.slot === addToTeamSlot.value) ?? null
})
const targetSlotPokemonName = computed(() => {
  const pokemonId = targetSlotMember.value?.pokemonId
  if (!pokemonId) return t('common.none')
  return dexStore.getPokemon(mode.value, pokemonId)?.name ?? titleFromSlug(pokemonId)
})
const selectedPokemonIsFavorite = computed(() => {
  const pokemonId = selectedProfile.value?.id
  return pokemonId ? uiStore.isFavoritePokemon(pokemonId) : false
})
const selectedProfileDisplayName = computed(() =>
  selectedProfile.value ? displayPokemonName(selectedProfile.value.id, selectedProfile.value.name) : '',
)
const selectedProfileFormLabel = computed(() => {
  if (!selectedProfile.value) return ''
  return formSuffixFromPokemonId(selectedProfile.value.id)
})
const selectedProfileVariantOptions = computed<DexProfileVariantOption[]>(() => {
  if (!selectedProfile.value) return []

  const familyEntry =
    selectedProfile.value.evolutionChain.find(
      (entry) => entry.pokedexNumber === selectedProfile.value?.pokedexNumber,
    ) ?? null
  if (!familyEntry) return []

  const options: DexProfileVariantOption[] = [
    {
      id: familyEntry.id,
      name: displayPokemonName(familyEntry.id, familyEntry.name),
      kind: 'base',
      isCurrent: familyEntry.id === selectedProfile.value.id,
    },
    ...familyEntry.variants.map((variant) => ({
      id: variant.id,
      name: displayPokemonName(variant.id, variant.name),
      kind: variant.kind,
      isCurrent: variant.id === selectedProfile.value?.id,
    })),
  ]

  return options.filter(
    (option, index, list) => list.findIndex((candidate) => candidate.id === option.id) === index,
  )
})

function regionLabel(tab: GenerationTab): string {
  return locale.value === 'es' ? tab.regionEs : tab.regionEn
}

function typeLabel(type: PokemonTypeKey): string {
  return locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en
}

function availabilityFilterLabel(filter: 'all' | DexAvailabilityFilterKey): string {
  if (filter === 'all') return t('dex.filterAnyGame')
  const option = GAME_AVAILABILITY_OPTIONS.find((entry) => entry.key === filter)
  if (!option) return filter
  return locale.value === 'es' ? option.labelEs : option.labelEn
}

function availabilityFilterShortLabel(filter: DexAvailabilityFilterKey): string {
  return GAME_AVAILABILITY_OPTIONS.find((option) => option.key === filter)?.short ?? filter
}

function learnMethodLabel(method: string): string {
  const labels: Record<string, { es: string; en: string }> = {
    'level-up': { es: 'Nivel', en: 'Level-up' },
    machine: { es: 'MT/MO', en: 'TM/HM' },
    tutor: { es: 'Tutor', en: 'Tutor' },
    egg: { es: 'Huevo', en: 'Egg' },
    'stadium-surfing-pikachu': { es: 'Evento', en: 'Event' },
    light_ball_egg: { es: 'Evento', en: 'Event' },
    colosseum_purification: { es: 'Purificacion', en: 'Purification' },
    xd_shadow: { es: 'Sombra XD', en: 'XD Shadow' },
  }
  const found = labels[method]
  if (found) return locale.value === 'es' ? found.es : found.en
  return method.replace(/-/g, ' ')
}

function statLabel(key: ProfileStatKey): string {
  const labels: Record<ProfileStatKey, { es: string; en: string }> = {
    hp: { es: 'PS', en: 'HP' },
    atk: { es: 'Ataque', en: 'Attack' },
    def: { es: 'Defensa', en: 'Defense' },
    spa: { es: 'At. Esp', en: 'Sp. Atk' },
    spd: { es: 'Def. Esp', en: 'Sp. Def' },
    spe: { es: 'Velocidad', en: 'Speed' },
  }
  return locale.value === 'es' ? labels[key].es : labels[key].en
}

function moveCategoryLabel(category: MoveCategory): string {
  if (category === 'physical') return t('dex.movePhysical')
  if (category === 'special') return t('dex.moveSpecial')
  return t('dex.moveStatus')
}

function moveCategoryIcon(category: MoveCategory): string {
  if (category === 'physical') return 'P'
  if (category === 'special') return 'S'
  return 'T'
}

function moveCategoryHeaderClass(category: MoveCategory): string {
  if (category === 'physical') return 'text-red-300'
  if (category === 'special') return 'text-blue-300'
  return 'text-green-300'
}

function moveCategoryBorderClass(category: MoveCategory): string {
  if (category === 'physical') return 'border-red-500/30'
  if (category === 'special') return 'border-blue-500/30'
  return 'border-green-500/30'
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
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

function displayPokemonName(pokemonId: string, baseName: string): string {
  const suffix = formSuffixFromPokemonId(pokemonId)
  return suffix ? `${baseName} (${suffix})` : baseName
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function generationIdForPokedexNumber(pokedexNumber: number): number | null {
  for (const tab of generationTabs) {
    const start = tab.offset + 1
    const end = tab.offset + tab.limit
    if (pokedexNumber >= start && pokedexNumber <= end) return tab.id
  }
  return null
}

function shortFromVersionGroup(group: string): string {
  const tokens = group.split('-').filter(Boolean)
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase()
  return tokens
    .map((token) => token.charAt(0))
    .join('')
    .slice(0, 4)
    .toUpperCase()
}

function versionOrder(group: string): number {
  const index = VERSION_GROUP_ORDER.indexOf(group)
  return index === -1 ? 10000 : index
}

function toVersionOption(group: string): VersionFilterOption {
  const meta = VERSION_GROUP_META[group]
  if (meta) return { id: group, ...meta }
  const label = titleFromSlug(group)
  return {
    id: group,
    short: shortFromVersionGroup(group),
    color: '#64748b',
    labelEs: label,
    labelEn: label,
  }
}
function versionLabel(option: VersionFilterOption): string {
  return locale.value === 'es' ? option.labelEs : option.labelEn
}

function versionStyle(option: VersionFilterOption) {
  const active = selectedVersionFilter.value === option.id
  return {
    borderColor: active ? `${option.color}` : `${option.color}66`,
    backgroundColor: active ? `${option.color}22` : 'rgba(0,0,0,0.35)',
    boxShadow: active ? `0 0 0 1px ${option.color}55` : 'none',
  }
}

function setVersionFilter(versionId: string) {
  selectedVersionFilter.value = versionId
}

function toggleTypeFilter(type: PokemonTypeKey) {
  typeFilter.value = typeFilter.value === type ? null : type
}

function clearDexFilters() {
  pokemonSearch.value = ''
  typeFilter.value = null
  availabilityFilter.value = 'all'
}

function setAvailabilityFilter(nextFilter: 'all' | DexAvailabilityFilterKey) {
  availabilityFilter.value = nextFilter
}

function starterSpriteUrl(starterId: string): string {
  const variant = showShinySprites.value ? 'shiny' : 'normal'
  return `https://img.pokemondb.net/sprites/home/${variant}/${starterId}.png`
}

function spriteUrl(pokemonId: string): string {
  const variant = showShinySprites.value ? 'shiny' : 'normal'
  return `https://img.pokemondb.net/sprites/home/${variant}/${pokemonId}.png`
}

function profileSpriteUrl(profile: DexPokemonProfile): string {
  if (showShinySprites.value) return spriteUrl(profile.id)
  return profile.sprites.officialArtwork ?? profile.sprites.home ?? profile.sprites.showdown ?? profile.sprites.default ?? spriteUrl(profile.id)
}

function borderStyle(primary: PokemonTypeKey) {
  const color = TYPE_COLORS[primary]
  return {
    borderColor: `${color}bb`,
    boxShadow: `inset 0 0 0 1px ${color}66`,
  }
}

function spriteFrameStyle(primary: PokemonTypeKey) {
  const color = TYPE_COLORS[primary]
  return {
    borderColor: `${color}d9`,
    boxShadow: `0 0 0 2px ${color}55`,
  }
}

function statBarStyle(value: number) {
  return { width: `${Math.max(6, Math.round((value / 255) * 100))}%` }
}

function factorLabel(factor: number): string {
  if (factor === 0) return 'x0'
  if (factor === 0.25) return 'x0.25'
  if (factor === 0.5) return 'x0.5'
  if (factor === 2) return 'x2'
  if (factor === 4) return 'x4'
  return `x${factor}`
}

function variantKindLabel(kind: EvolutionVariantKind): string {
  const labels: Record<EvolutionVariantKind, { es: string; en: string }> = {
    mega: { es: 'Mega', en: 'Mega' },
    regional: { es: 'Regional', en: 'Regional' },
    gmax: { es: 'Gmax', en: 'Gmax' },
    totem: { es: 'Totem', en: 'Totem' },
    primal: { es: 'Primigenio', en: 'Primal' },
    style: { es: 'Forma', en: 'Form' },
    form: { es: 'Forma', en: 'Form' },
  }
  return locale.value === 'es' ? labels[kind].es : labels[kind].en
}

function variantKindClass(kind: EvolutionVariantKind): string {
  if (kind === 'mega') return 'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-400/60'
  if (kind === 'regional') return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100 hover:border-cyan-400/60'
  if (kind === 'gmax') return 'border-indigo-500/35 bg-indigo-500/10 text-indigo-100 hover:border-indigo-400/60'
  if (kind === 'primal') return 'border-orange-500/35 bg-orange-500/10 text-orange-100 hover:border-orange-400/60'
  if (kind === 'totem') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/60'
  return 'border-gray-500/35 bg-gray-500/10 text-gray-100 hover:border-gray-400/60'
}

function variantKindButtonClass(kind: EvolutionVariantKind | 'base', active: boolean): string {
  if (kind === 'base') {
    return active
      ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
      : 'border-gray-600/70 bg-black/35 text-gray-200 hover:border-sky-500/50'
  }

  const accent = variantKindClass(kind)
  return active ? `${accent} shadow-[0_0_0_1px_rgba(255,255,255,0.08)]` : accent
}

function filteredMoves(category: MoveCategory) {
  return filteredMovesByCategory.value[category]
}

function selectedMoveMeta(category: MoveCategory) {
  const id = selectedMoveByCategory.value[category]
  if (!id) return null
  return movesByCategory.value[category].find((move) => move.id === id) ?? null
}

function onSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  if (
    showShinySprites.value &&
    target.src.includes('/shiny/') &&
    target.dataset.shinyFallback !== '1'
  ) {
    target.dataset.shinyFallback = '1'
    target.src = target.src.replace('/shiny/', '/normal/')
    return
  }
  if (target.src !== mudkipSprite) {
    target.src = mudkipSprite
  }
}

function fallbackStatBlock(value: number) {
  return {
    hp: value,
    atk: value,
    def: value,
    spa: value,
    spd: value,
    spe: value,
  }
}

function hasCompleteStatBlock(stats: unknown): stats is Record<(typeof STATS)[number], number> {
  if (!stats || typeof stats !== 'object') return false
  return STATS.every((stat) => typeof (stats as Record<string, unknown>)[stat] === 'number')
}

function favoriteToggleLabel(): string {
  return selectedPokemonIsFavorite.value ? t('dex.favoriteRemove') : t('dex.favoriteAdd')
}

function toggleSelectedFavorite() {
  if (!selectedProfile.value) return
  uiStore.toggleFavoritePokemon(selectedProfile.value.id)
}

async function loadGeneration() {
  const tab = currentTab.value
  loadError.value = ''

  if (!tab.available) {
    entries.value = []
    return
  }

  isLoading.value = true
  try {
    const currentLocale = (locale.value === 'en' ? 'en' : 'es') as LocaleCode
    await dexStore.ensureCatalogLoaded({ locale: currentLocale })
    await dexStore.ensureGenerationLoaded(tab.id, currentLocale)
    entries.value = dexStore.getGenerationEntries(tab.id, currentLocale)
  } catch (error) {
    entries.value = []
    loadError.value = (error as Error).message
  } finally {
    isLoading.value = false
  }
}

function openPokemonModal(pokemonId: string) {
  const nextQuery = { ...route.query, pokemon: pokemonId }
  void router.replace({ query: nextQuery })
}

function closePokemonModal() {
  const nextQuery = { ...route.query }
  delete nextQuery.pokemon
  void router.replace({ query: nextQuery })
  selectedProfile.value = null
  isProfileDetailsLoading.value = false
  profileError.value = ''
  addToTeamMessage.value = ''
  addToTeamError.value = false
}

function addSelectedPokemonToTeam() {
  if (!selectedProfile.value) return

  const pokemonId = selectedProfile.value.id
  const modeValue = mode.value
  const slot = addToTeamSlot.value
  const existingMember = teamStore.getActiveTeam(modeValue).members.find((member) => member.slot === slot) ?? null

  const catalogPokemon = dexStore.getPokemon(modeValue, pokemonId)
  const suggestedMoves = catalogPokemon?.suggestedMoves ?? []
  const safeEvs = hasCompleteStatBlock(existingMember?.evs) ? existingMember.evs : fallbackStatBlock(0)
  const safeIvs = hasCompleteStatBlock(existingMember?.ivs) ? existingMember.ivs : fallbackStatBlock(MAX_IV_PER_STAT)
  const safeNature = existingMember?.natureId || catalogPokemon?.defaultNature || 'jolly'
  const previousName = targetSlotPokemonName.value

  let thrownError: unknown = null
  try {
    teamStore.updateMember(modeValue, slot, {
      pokemonId,
      abilityId: catalogPokemon?.abilities[0] ?? '',
      itemId: catalogPokemon?.suggestedItems[0] ?? '',
      natureId: safeNature,
      evs: safeEvs,
      ivs: safeIvs,
      moves: [
        suggestedMoves[0] ?? '',
        suggestedMoves[1] ?? '',
        suggestedMoves[2] ?? '',
        suggestedMoves[3] ?? '',
      ],
      roleTags: catalogPokemon?.roleTags ?? [],
    })
  } catch (error) {
    thrownError = error
  }

  const updatedMember = teamStore.getActiveTeam(modeValue).members.find((member) => member.slot === slot) ?? null
  const didApply = updatedMember?.pokemonId === pokemonId
  if (didApply) {
    uiStore.setSelectedSlot(modeValue, slot)
    addToTeamError.value = false
    addToTeamMessage.value = t('dex.addToTeamSuccess', {
      name: selectedProfile.value.name,
      slot,
      previous: previousName,
    })
    return
  }

  if (thrownError) {
    console.error('[Dex] addSelectedPokemonToTeam failed', thrownError)
  }
  {
    addToTeamError.value = true
    addToTeamMessage.value = t('dex.addToTeamError')
  }
}

async function loadSelectedPokemon() {
  const pokemonId = selectedPokemonId.value
  const currentLocale = (locale.value === 'en' ? 'en' : 'es') as LocaleCode
  profileError.value = ''

  if (!pokemonId) {
    selectedProfile.value = null
    isProfileDetailsLoading.value = false
    return
  }

  isProfileLoading.value = true
  try {
    await dexStore.ensureCatalogLoaded({ locale: currentLocale })
    await dexStore.ensureGenerationLoaded(currentTab.value.id, currentLocale)

    let summary = dexStore.getPokemonProfileSummary(pokemonId, currentLocale)
    if (!summary) {
      const generationId = generationIdForPokedexNumber(
        dexStore.getPokemon(mode.value, pokemonId)?.pokedexNumber ?? 0,
      )
      if (generationId && generationId !== currentTab.value.id) {
        await dexStore.ensureGenerationLoaded(generationId, currentLocale)
        summary = dexStore.getPokemonProfileSummary(pokemonId, currentLocale)
      }
    }
    if (!summary) {
      throw new Error(t('dex.errorLoad'))
    }

    selectedProfile.value = {
      ...summary,
      moves: [],
    }
    isProfileLoading.value = false
    isProfileDetailsLoading.value = true

    const details = await dexStore.ensurePokemonProfileDetails(pokemonId, currentLocale)
    if (selectedPokemonId.value !== pokemonId) return

    selectedProfile.value = {
      ...summary,
      moves: details?.moves ?? [],
    }
  } catch (error) {
    selectedProfile.value = null
    isProfileDetailsLoading.value = false
    profileError.value = (error as Error).message
  } finally {
    isProfileLoading.value = false
    if (selectedPokemonId.value === pokemonId) {
      isProfileDetailsLoading.value = false
    }
  }
}

watch(
  [activeGeneration, () => locale.value],
  () => {
    selectedVersionFilter.value = 'history'
    void loadGeneration()
  },
  { immediate: true },
)

watch(
  generationTypeFilters,
  (options) => {
    if (typeFilter.value && !options.some((option) => option.type === typeFilter.value)) {
      typeFilter.value = null
    }
  },
  { immediate: true },
)

watch(
  generationAvailabilityFilters,
  (options) => {
    if (availabilityFilter.value === 'all') return
    if (!options.some((option) => option.key === availabilityFilter.value)) {
      availabilityFilter.value = 'all'
    }
  },
  { immediate: true },
)

watch(
  [selectedPokemonId, () => locale.value],
  () => {
    addToTeamSlot.value = uiStore.getSelectedSlot(mode.value)
    addToTeamMessage.value = ''
    addToTeamError.value = false
    void loadSelectedPokemon()
  },
  { immediate: true },
)

watch(
  selectedProfile,
  (profile) => {
    moveSearch.value = { physical: '', special: '', status: '' }
    selectedMoveByCategory.value = {
      physical: profile?.moves.find((move) => move.category === 'physical')?.id ?? '',
      special: profile?.moves.find((move) => move.category === 'special')?.id ?? '',
      status: profile?.moves.find((move) => move.category === 'status')?.id ?? '',
    }
  },
  { immediate: true },
)

watch(
  versionFilterOptions,
  (options) => {
    if (!options.some((option) => option.id === selectedVersionFilter.value)) {
      selectedVersionFilter.value = 'history'
    }
  },
  { immediate: true },
)

watch(
  filteredMovesByCategory,
  () => {
    for (const category of MOVE_CATEGORIES) {
      const selectedId = selectedMoveByCategory.value[category]
      const exists = filteredMovesByCategory.value[category].some((move) => move.id === selectedId)
      if (!exists) {
        selectedMoveByCategory.value[category] = filteredMovesByCategory.value[category][0]?.id ?? ''
      }
    }
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <section class="rounded-2xl border border-sky-500/30 bg-off-black/70 p-4">
    <header class="mb-4 flex items-center gap-3">
      <img :src="mudkipTitleSprite" alt="Mudkip"
        class="h-11 w-11 rounded-full border border-sky-400/50 bg-black/35 object-contain p-1" @error="onSpriteError" />
      <div>
        <h2 class="text-lg font-semibold text-sky-300">{{ t('dex.title') }}</h2>
        <p class="text-sm text-gray-300">{{ t('dex.subtitle') }}</p>
      </div>
    </header>

    <article class="rounded-xl border border-gray-700 bg-st-black/50 p-3">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-200">{{ t('dex.generationMenu') }}</h3>
        <div class="flex items-center gap-2">
          <p class="text-xs text-gray-400">
            {{ t('dex.pokemonCount', { count: filteredEntries.length }) }}
            <span v-if="hasActiveDexFilters"> / {{ entries.length }}</span>
          </p>
          <button
            class="cursor-pointer select-none rounded-md border px-2 py-1 text-[11px] font-semibold transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98]"
            :class="showShinySprites
              ? 'border-gray-600 bg-black/35 text-gray-200 hover:border-gray-400'
              : 'border-sky-400/70 bg-sky-400/15 text-sky-200 hover:border-sky-300'"
            @click="showShinySprites = !showShinySprites">
            {{ showShinySprites ? t('dex.spriteNormal') : t('dex.spriteShiny') }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <button v-for="tab in generationTabs" :key="tab.id" class="rounded-lg border p-2 text-left transition" :class="[
          activeGeneration === tab.id
            ? 'border-sky-500 bg-sky-500/10'
            : 'border-gray-700 bg-off-black/60 hover:border-sky-500/40',
          tab.available ? '' : 'opacity-60',
        ]" @click="activeGeneration = tab.id">
          <div class="mb-2 flex items-center gap-2">
            <img :src="starterSpriteUrl(tab.starterId)" :alt="`Gen ${tab.key}`"
              class="h-8 w-8 rounded bg-black/30 object-contain" loading="lazy" @error="onSpriteError" />
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-gray-100">Gen {{ tab.key }}</p>
              <p class="truncate text-[11px] text-gray-400">{{ regionLabel(tab) }}</p>
            </div>
          </div>
          <p class="text-[11px]" :class="tab.available ? 'text-green-300' : 'text-gray-500'">
            {{ tab.available ? t('dex.ready') : t('dex.soon') }}
          </p>
        </button>
      </div>
    </article>

    <article class="mt-4 rounded-xl border border-gray-700 bg-st-black/45 p-4">
      <div class="mb-8 flex items-center justify-between">
        <p class="text-sm text-gray-200">Gen {{ currentTab.key }} - {{ regionLabel(currentTab) }}</p>
        <button v-if="loadError" class="rounded-md border border-sky-500/40 px-2 py-1 text-xs" @click="loadGeneration">
          {{ t('dex.retry') }}
        </button>
      </div>
      <div class="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div v-if="isLoading" class="mb-4 text-sm text-gray-300">{{ t('dex.loading') }}</div>
        <div v-else class="mb-4 flex flex-wrap items-center gap-2">
          <Menu as="div" class="relative">
            <MenuButton
              class="inline-flex min-w-[11.5rem] items-center justify-between gap-2 rounded-md border border-gray-700 bg-black/35 px-2.5 py-2 text-xs font-semibold text-gray-100 transition hover:border-sky-500/40">
              <span class="inline-flex min-w-0 items-center gap-2">
                <img v-if="typeFilter" :src="TYPE_META[typeFilter].icon" :alt="typeLabel(typeFilter)" class="h-4 w-4 shrink-0" />
                <span v-else class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 text-[9px] text-gray-400">T</span>
                <span class="truncate">{{ typeFilter ? typeLabel(typeFilter) : t('dex.filterAllTypes') }}</span>
              </span>
              <span class="text-[10px] text-gray-400">
                {{ t('dex.filterByType') }}
              </span>
            </MenuButton>
            <MenuItems
              class="absolute left-0 z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-gray-700 bg-off-black/95 p-1 shadow-lg focus:outline-none">
              <MenuItem v-slot="{ active }">
                <button
                  class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition"
                  :class="active ? 'bg-sky-500/15' : ''" @click="typeFilter = null">
                  <span class="inline-flex items-center gap-2 text-gray-100">
                    <span class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 text-[9px] text-gray-400">T</span>
                    {{ t('dex.filterAllTypes') }}
                  </span>
                  <span class="text-[10px] text-gray-400">{{ entries.length }}</span>
                </button>
              </MenuItem>
              <MenuItem v-for="option in generationTypeFilters" :key="`type-filter-${option.type}`" v-slot="{ active }">
                <button
                  class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition"
                  :class="active ? 'bg-white/8' : ''" @click="toggleTypeFilter(option.type)">
                  <span class="inline-flex items-center gap-2" :style="{ color: TYPE_COLORS[option.type] }">
                    <img :src="TYPE_META[option.type].icon" :alt="typeLabel(option.type)" class="h-4 w-4" />
                    {{ typeLabel(option.type) }}
                  </span>
                  <span class="text-[10px] text-gray-400">{{ option.count }}</span>
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>

          <Menu as="div" class="relative">
            <MenuButton
              class="inline-flex min-w-[13rem] items-center justify-between gap-2 rounded-md border border-gray-700 bg-black/35 px-2.5 py-2 text-xs font-semibold text-gray-100 transition hover:border-sky-500/40">
              <span class="inline-flex min-w-0 items-center gap-2">
                <span class="inline-flex h-5 min-w-[2.2rem] items-center justify-center rounded border border-sky-500/30 bg-sky-500/10 px-1 text-[10px] font-bold text-sky-200">
                  {{ selectedAvailabilityOption?.short ?? 'Any' }}
                </span>
                <span class="truncate">{{ availabilityFilterLabel(availabilityFilter) }}</span>
              </span>
              <span class="text-[10px] text-gray-400">{{ t('dex.filterByAvailability') }}</span>
            </MenuButton>
            <MenuItems
              class="absolute left-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-gray-700 bg-off-black/95 p-1 shadow-lg focus:outline-none">
              <MenuItem v-slot="{ active }">
                <button
                  class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition"
                  :class="active ? 'bg-sky-500/15' : ''" @click="setAvailabilityFilter('all')">
                  <span class="inline-flex items-center gap-2 text-gray-100">
                    <span class="inline-flex h-5 min-w-[2.2rem] items-center justify-center rounded border border-sky-500/30 bg-sky-500/10 px-1 text-[10px] font-bold text-sky-200">Any</span>
                    {{ t('dex.filterAnyGame') }}
                  </span>
                  <span class="text-[10px] text-gray-400">{{ entries.length }}</span>
                </button>
              </MenuItem>
              <MenuItem
                v-for="option in generationAvailabilityFilters"
                :key="`availability-filter-${option.key}`"
                v-slot="{ active }">
                <button
                  class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition"
                  :class="active ? 'bg-white/8' : ''" @click="setAvailabilityFilter(option.key)">
                  <span class="inline-flex items-center gap-2 text-gray-100">
                    <span class="inline-flex h-5 min-w-[2.6rem] items-center justify-center rounded border border-sky-500/30 bg-sky-500/10 px-1 text-[10px] font-bold text-sky-200">
                      {{ availabilityFilterShortLabel(option.key) }}
                    </span>
                    {{ availabilityFilterLabel(option.key) }}
                  </span>
                  <span class="text-[10px] text-gray-400">{{ option.count }}</span>
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>

          <button v-if="hasActiveDexFilters"
            class="ml-auto rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-sky-500/50"
            @click="clearDexFilters">
            {{ t('dex.clearFilter') }}
          </button>
        </div>
      </div>
      <div class="mb-4 flex items-center gap-2">
        <input v-model="pokemonSearch" type="text"
          class="w-full rounded-md border border-gray-700 bg-off-black/70 px-2.5 py-2 text-sm text-gray-100 placeholder:text-gray-500"
          :placeholder="t('dex.searchPokemon')" />
        <button v-if="pokemonSearch.trim()"
          class="rounded-md border border-gray-700 px-2 py-2 text-xs text-gray-200 hover:border-sky-500/50"
          @click="pokemonSearch = ''">
          X
        </button>
      </div>

      <p v-if="isLoading" class="text-sm text-gray-300">{{ t('dex.loading') }}</p>
      <p v-else-if="loadError" class="text-sm text-red-300">{{ loadError }}</p>
      <p v-else-if="entries.length === 0" class="text-sm text-gray-300">{{ t('dex.unavailable') }}</p>
      <p v-else-if="filteredEntries.length === 0" class="text-sm text-gray-300">{{ noResultsMessage }}</p>

      <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        <li v-for="entry in filteredEntries" :key="entry.id" class="pt-8">
          <button class="w-full text-left cursor-pointer" @click="openPokemonModal(entry.id)">
            <article
              class="relative rounded-xl border bg-off-black/75 px-3 pb-3 pt-10 transition hover:-translate-y-0.5 hover:border-sky-400/40"
              :style="borderStyle(entry.types[0])">
              <img :src="spriteUrl(entry.id)" :alt="entry.name"
                class="absolute -top-8 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-2 bg-black/55 object-contain p-1"
                :style="spriteFrameStyle(entry.types[0])" loading="lazy" @error="onSpriteError" />

              <div class="mb-1 flex items-center justify-between">
                <p class="text-[11px] text-gray-400">#{{ String(entry.pokedexNumber).padStart(3, '0') }}</p>
                <p class="text-[11px] text-gray-500">Gen {{ currentTab.key }}</p>
              </div>

              <h4 class="line-clamp-1 text-sm font-semibold text-gray-100">{{ entry.name }}</h4>

              <div class="mt-2 flex min-h-[4.5rem] flex-col gap-1.5">
                <span v-for="type in entry.types" :key="`${entry.id}-${type}`"
                  class="inline-flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-gray-700 bg-black/45 px-2.5 py-1 text-xs">
                  <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-4 w-4 shrink-0" />
                  <span class="truncate">{{ typeLabel(type) }}</span>
                </span>
                <span v-if="entry.types.length === 1"
                  class="h-8 rounded-md border border-transparent px-2.5 py-1 opacity-0" aria-hidden="true">
                  filler
                </span>
              </div>
            </article>
          </button>
        </li>
      </ul>
    </article>

    <Teleport to="body">
      <div v-if="selectedPokemonId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 md:p-6"
        @click="closePokemonModal">
        <article
          class="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-sky-500/35 bg-off-black shadow-2xl"
          @click.stop>
          <div
            class="sticky top-0 z-10 flex items-center justify-between border-b border-sky-500/20 bg-off-black/95 px-4 py-3 backdrop-blur">
            <h3 class="text-sm font-semibold text-sky-300">
              {{ selectedProfile ? `${selectedProfileDisplayName} #${String(selectedProfile.pokedexNumber).padStart(3, '0')}`
                : t('dex.loading') }}
            </h3>
            <div class="flex items-center gap-2">
              <button
                class="cursor-pointer select-none rounded-md border px-2 py-1 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98]"
                :class="showShinySprites
                  ? 'border-gray-600 bg-black/35 text-gray-200 hover:border-gray-400'
                  : 'border-sky-400/70 bg-sky-400/15 text-sky-200 hover:border-sky-300'"
                @click="showShinySprites = !showShinySprites">
                {{ showShinySprites ? t('dex.spriteNormal') : t('dex.spriteShiny') }}
              </button>
              <button class="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-sky-500/50"
                @click="closePokemonModal">X</button>
            </div>
          </div>

          <p v-if="isProfileLoading" class="p-6 text-sm text-gray-300">{{ t('dex.loading') }}</p>
          <p v-else-if="profileError" class="p-6 text-sm text-red-300">{{ profileError }}</p>

          <template v-else-if="selectedProfile">
            <div class="space-y-3 p-4">
              <div class="rounded-xl border border-sky-500/25 bg-st-black/55 p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-xs font-semibold text-sky-200">{{ t('dex.addToTeamLabel') }}</p>
                  <select v-model.number="addToTeamSlot"
                    class="rounded-md border border-gray-700 bg-off-black/80 px-2 py-1 text-xs">
                    <option v-for="slot in slotOptions" :key="`add-slot-${slot}`" :value="slot">
                      {{ t('common.slot', { slot }) }}
                    </option>
                  </select>
                  <button
                    class="rounded-md border border-sky-500/50 bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-100 transition hover:border-sky-400 hover:bg-sky-500/25"
                    @click="addSelectedPokemonToTeam">
                    {{ t('dex.addToTeamButton', { slot: addToTeamSlot }) }}
                  </button>
                  <div
                    class="ml-auto flex items-center gap-2 rounded-md border border-gray-700 bg-black/35 px-2 py-1 text-xs">
                    <span class="text-gray-300">{{ t('dex.slotCurrentLabel', { slot: addToTeamSlot }) }}</span>
                    <img :src="targetSlotMember?.pokemonId ? spriteUrl(targetSlotMember.pokemonId) : mudkipSprite"
                      :alt="targetSlotPokemonName" class="h-4 w-4 object-contain" @error="onSpriteError" />
                    <span class="max-w-[9rem] truncate text-gray-100">{{ targetSlotPokemonName }}</span>
                    <span class="text-[11px] text-gray-400">{{ t('dex.slotWillReplace') }}</span>
                  </div>
                  <p v-if="addToTeamMessage" class="text-xs"
                    :class="addToTeamError ? 'text-red-300' : 'text-emerald-300'">
                    {{ addToTeamMessage }}
                  </p>
                </div>
              </div>

              <div class="grid gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
                <aside class="rounded-xl border p-3"
                  :style="{ borderColor: `${primaryColor}66`, background: `linear-gradient(180deg, ${primaryColor}22 0%, rgba(3,3,3,0.8) 75%)` }">
                  <div class="relative mx-auto mb-2 w-fit">
                    <img :src="profileSpriteUrl(selectedProfile)" :alt="selectedProfile.name"
                      class="h-52 w-52 object-contain" loading="lazy" @error="onSpriteError" />
                    <button
                      class="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border text-base font-bold transition"
                      :class="selectedPokemonIsFavorite
                        ? 'border-sky-400/80 bg-sky-500/25 text-sky-100'
                        : 'border-gray-600/80 bg-black/50 text-gray-300 hover:border-sky-400/70 hover:text-sky-100'"
                      :title="favoriteToggleLabel()" :aria-label="favoriteToggleLabel()"
                      @click="toggleSelectedFavorite">
                      {{ selectedPokemonIsFavorite ? '★' : '☆' }}
                    </button>
                  </div>

                  <div class="mb-2 flex flex-wrap gap-1.5">
                    <span v-for="type in selectedProfile.types" :key="`profile-type-${type}`"
                      class="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-black/50 px-2 py-1 text-xs">
                      <img :src="TYPE_META[type].icon" :alt="typeLabel(type)" class="h-4 w-4" />
                      {{ typeLabel(type) }}
                    </span>
                    <span v-if="selectedProfileFormLabel"
                      class="inline-flex items-center gap-1 rounded-md border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-1 text-xs text-fuchsia-100">
                      {{ selectedProfileFormLabel }}
                    </span>
                  </div>

                  <div v-if="selectedProfileVariantOptions.length > 1"
                    class="mb-3 rounded-xl border border-gray-700 bg-black/35 p-2">
                    <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {{ t('dex.formsAvailable') }}
                    </p>
                    <div class="flex flex-wrap gap-1.5">
                      <button v-for="option in selectedProfileVariantOptions" :key="`profile-variant-${option.id}`"
                        class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition"
                        :class="variantKindButtonClass(option.kind, option.isCurrent)"
                        @click="openPokemonModal(option.id)">
                        <img :src="spriteUrl(option.id)" :alt="option.name" class="h-4 w-4 object-contain"
                          @error="onSpriteError" />
                        <span class="max-w-[10rem] truncate">{{ option.name }}</span>
                      </button>
                    </div>
                  </div>

                  <p class="text-xs text-gray-300">{{ selectedProfile.genus }}</p>
                  <p class="mt-2 text-xs leading-5 text-gray-200">{{ selectedProfile.flavorText }}</p>

                  <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div class="rounded-md border border-gray-700 bg-black/45 p-2">
                      <p class="text-gray-400">{{ t('dex.height') }}</p>
                      <p class="font-semibold text-gray-100">{{ selectedProfile.heightMeters.toFixed(1) }} m</p>
                    </div>
                    <div class="rounded-md border border-gray-700 bg-black/45 p-2">
                      <p class="text-gray-400">{{ t('dex.weight') }}</p>
                      <p class="font-semibold text-gray-100">{{ selectedProfile.weightKg.toFixed(1) }} kg</p>
                    </div>
                    <div class="rounded-md border border-gray-700 bg-black/45 p-2">
                      <p class="text-gray-400">{{ t('dex.baseExp') }}</p>
                      <p class="font-semibold text-gray-100">{{ selectedProfile.baseExperience }}</p>
                    </div>
                    <div class="rounded-md border border-gray-700 bg-black/45 p-2">
                      <p class="text-gray-400">{{ t('dex.captureRate') }}</p>
                      <p class="font-semibold text-gray-100">{{ selectedProfile.captureRate }}</p>
                    </div>
                  </div>

                  <div class="mt-3 rounded-xl border border-gray-700 bg-black/40 p-3">
                    <h4 class="mb-2 text-sm font-semibold text-sky-300">{{ t('dex.abilities') }}</h4>
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="ability in selectedProfile.abilities" :key="ability.id"
                        class="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-xs">
                        {{ ability.name }}
                        <span v-if="ability.isHidden" class="text-[10px] text-sky-300">{{ t('dex.hidden') }}</span>
                      </span>
                    </div>
                  </div>

                  <div class="mt-3 grid gap-3">
                    <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                      <h4 class="mb-2 text-sm font-semibold text-red-300">{{ t('dex.weaknesses') }}</h4>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="entry in weaknessRows" :key="`w-left-${entry.type}`"
                          class="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-black/35 px-2 py-1 text-xs">
                          <img :src="TYPE_META[entry.type].icon" :alt="typeLabel(entry.type)" class="h-3.5 w-3.5" />
                          {{ typeLabel(entry.type) }} {{ factorLabel(entry.factor) }}
                        </span>
                        <span v-if="weaknessRows.length === 0" class="text-xs text-gray-400">{{ t('common.none')
                        }}</span>
                      </div>
                    </div>

                    <div class="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                      <h4 class="mb-2 text-sm font-semibold text-blue-300">{{ t('dex.resistances') }}</h4>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="entry in resistanceRows" :key="`r-left-${entry.type}`"
                          class="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-black/35 px-2 py-1 text-xs">
                          <img :src="TYPE_META[entry.type].icon" :alt="typeLabel(entry.type)" class="h-3.5 w-3.5" />
                          {{ typeLabel(entry.type) }} {{ factorLabel(entry.factor) }}
                        </span>
                        <span v-if="resistanceRows.length === 0" class="text-xs text-gray-400">{{ t('common.none')
                        }}</span>
                      </div>
                    </div>
                  </div>
                </aside>

                <section class="space-y-4">
                  <div class="rounded-xl border border-gray-700 bg-st-black/60 p-3">
                    <h4 class="mb-2 text-sm font-semibold text-sky-300">{{ t('dex.baseStats') }}</h4>
                    <div class="space-y-2">
                      <div v-for="stat in statRows" :key="`stat-${stat.key}`" class="flex items-center gap-2 text-xs">
                        <span class="w-16 text-gray-300">{{ statLabel(stat.key) }}</span>
                        <div class="h-2 flex-1 rounded-full bg-gray-800">
                          <div class="h-full rounded-full"
                            :style="{ ...statBarStyle(stat.value), backgroundColor: `${primaryColor}` }" />
                        </div>
                        <span class="w-8 text-right text-gray-100">{{ stat.value }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="rounded-xl border border-gray-700 bg-st-black/60 p-3">
                    <h4 class="mb-2 text-sm font-semibold text-sky-300">{{ t('dex.evolution') }}</h4>
                    <div class="overflow-x-auto pb-1">
                      <div class="flex min-w-max items-start gap-2">
                        <template v-for="evo in selectedProfile.evolutionChain" :key="`evo-${evo.id}`">
                          <div class="w-52 rounded-lg border border-gray-700 bg-black/35 p-2">
                            <button
                              class="inline-flex w-full items-center justify-between gap-2 rounded-md border border-gray-700 bg-black/45 px-2 py-1 text-xs hover:border-sky-500/40"
                              @click="openPokemonModal(evo.id)">
                              <span class="inline-flex min-w-0 items-center gap-1">
                                <img :src="spriteUrl(evo.id)" :alt="evo.name" class="h-5 w-5 object-contain"
                                  @error="onSpriteError" />
                                <span class="truncate">{{ evo.name }}</span>
                              </span>
                              <span class="shrink-0 text-gray-500">#{{ String(evo.pokedexNumber).padStart(3, '0')
                              }}</span>
                            </button>

                            <div v-if="evo.variants.length" class="mt-2 grid gap-1.5">
                              <button v-for="variant in evo.variants" :key="`variant-${variant.id}`"
                                class="inline-flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px] transition"
                                :class="variantKindClass(variant.kind)" @click="openPokemonModal(variant.id)">
                                <span class="inline-flex min-w-0 items-center gap-1">
                                  <img :src="spriteUrl(variant.id)" :alt="variant.name" class="h-4 w-4 object-contain"
                                    @error="onSpriteError" />
                                  <span class="truncate">{{ variant.name }}</span>
                                </span>
                                <span
                                  class="rounded border border-current/40 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                                  {{ variantKindLabel(variant.kind) }}
                                </span>
                              </button>
                            </div>
                          </div>

                        </template>
                      </div>
                    </div>
                  </div>

                  <div class="rounded-xl border border-gray-700 bg-st-black/60 p-3">
                    <h4 class="mb-3 text-sm font-semibold text-sky-300">{{ t('dex.movesLearnset') }}</h4>
                    <p v-if="isProfileDetailsLoading" class="mb-3 text-xs text-cyan-200">
                      {{ t('dex.loading') }}
                    </p>

                    <div class="mb-3 rounded-lg border border-gray-700 bg-black/30 p-2">
                      <div class="mb-2 flex items-center justify-between gap-2">
                        <p class="text-xs text-gray-300">{{ t('dex.movesVersionFilter') }}</p>
                        <p class="text-[11px] text-gray-400">{{ selectedVersionOption ?
                          versionLabel(selectedVersionOption) : '-' }}</p>
                      </div>
                      <div class="flex gap-1 overflow-x-auto pb-1">
                        <button v-for="option in versionFilterOptions" :key="`vf-${option.id}`"
                          class="inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold transition"
                          :style="versionStyle(option)" :title="versionLabel(option)"
                          @click="setVersionFilter(option.id)">
                          {{ option.short }}
                        </button>
                      </div>
                    </div>

                    <div class="grid gap-3 lg:grid-cols-3">
                      <article v-for="category in MOVE_CATEGORIES" :key="`category-${category}`"
                        class="rounded-lg border bg-black/30 p-2" :class="moveCategoryBorderClass(category)">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <p class="text-xs font-semibold" :class="moveCategoryHeaderClass(category)">
                            <span class="mr-1.5">{{ moveCategoryIcon(category) }}</span>
                            {{ moveCategoryLabel(category) }}
                          </p>
                          <span class="text-[11px] text-gray-400">{{ filteredMoves(category).length }}</span>
                        </div>

                        <input v-model="moveSearch[category]"
                          class="mb-2 w-full rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-xs"
                          :placeholder="t('dex.searchMove')" type="text" />

                        <select v-model="selectedMoveByCategory[category]"
                          class="h-44 w-full rounded-md border border-gray-700 bg-off-black/80 p-1 text-xs" size="8">
                          <option v-for="move in filteredMoves(category)" :key="`${category}-${move.id}`"
                            :value="move.id">
                            {{ move.name }}
                          </option>
                        </select>

                        <div v-if="selectedMoveMeta(category)"
                          class="mt-2 rounded-md border border-gray-700 bg-off-black/60 px-2 py-1.5 text-xs text-gray-200">
                          <div class="mb-1 flex items-center gap-1.5">
                            <img :src="TYPE_META[selectedMoveMeta(category)!.type].icon"
                              :alt="typeLabel(selectedMoveMeta(category)!.type)" class="h-3.5 w-3.5" />
                            <span>{{ selectedMoveMeta(category)!.name }}</span>
                          </div>
                          <p class="text-[11px] text-gray-400">{{ typeLabel(selectedMoveMeta(category)!.type) }}</p>
                          <p class="mt-1 text-[11px] text-gray-400">
                            {{ t('dex.learnMethods') }}:
                            {{ selectedMoveMeta(category)!.learnMethods.map(learnMethodLabel).join(', ') ||
                              t('common.none') }}
                          </p>
                          <p class="text-[11px] text-gray-400">
                            {{ t('dex.minLevel') }}:
                            {{ selectedMoveMeta(category)!.minLevel ?? '-' }}
                          </p>
                        </div>
                        <p v-else class="mt-2 text-[11px] text-gray-500">{{ t('common.none') }}</p>
                      </article>
                    </div>
                  </div>

                  <div class="grid gap-2 rounded-xl border border-gray-700 bg-st-black/60 p-3 text-xs md:grid-cols-2">
                    <p><span class="text-gray-400">{{ t('dex.habitat') }}:</span> <span class="text-gray-200">{{
                      selectedProfile.habitat }}</span></p>
                    <p><span class="text-gray-400">{{ t('dex.growthRate') }}:</span> <span class="text-gray-200">{{
                      selectedProfile.growthRate }}</span></p>
                    <p><span class="text-gray-400">{{ t('dex.generationLabel') }}:</span> <span class="text-gray-200">{{
                      selectedProfile.generation }}</span></p>
                    <p><span class="text-gray-400">{{ t('dex.baseHappiness') }}:</span> <span class="text-gray-200">{{
                      selectedProfile.baseHappiness }}</span></p>
                    <p class="md:col-span-2">
                      <span class="text-gray-400">{{ t('dex.eggGroups') }}:</span>
                      <span class="text-gray-200"> {{ selectedProfile.eggGroups.join(', ') || t('common.none') }}</span>
                    </p>
                    <p class="md:col-span-2">
                      <span v-if="selectedProfile.isLegendary"
                        class="mr-2 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-sky-300">{{
                          t('dex.legendary') }}</span>
                      <span v-if="selectedProfile.isMythical"
                        class="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-fuchsia-300">{{
                          t('dex.mythical') }}</span>
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </template>
        </article>
      </div>
    </Teleport>
  </section>
</template>
