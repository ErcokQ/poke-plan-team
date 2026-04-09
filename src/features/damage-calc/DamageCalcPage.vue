<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/features/shared/components/SearchableSelect.vue'
import movePhysicalSeal from '@/assets/pokesprite/misc/seals/home/move-physical.png'
import moveSpecialSeal from '@/assets/pokesprite/misc/seals/home/move-special.png'
import moveStatusSeal from '@/assets/pokesprite/misc/seals/home/move-status.png'
import type {
  BattleMode,
  LocaleCode,
  PokemonTypeKey,
  StatKey,
} from '@/models/domain'
import type {
  DamageMatrixCell,
  DamagePairComputation,
  DamageGeneration,
  DamageHazardsState,
  DamageCombatContext,
  DamageMoveOrderHint,
  DamageSideId,
  DamageSlotNumber,
  DamageStatus,
} from '@/models/damage-calc'
import { TYPE_KEYS } from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
import { useDamageCalcStore } from '@/stores/damage-calc'
import { useDexStore } from '@/stores/dex'
import { useTeamStore } from '@/stores/team'
import { getEffectiveLearnsetMoveIds } from '@/utils/move-legality'
import { moveTypeGradientStyle } from '@/utils/move-type-style'
import { onPokemonSpriteError, primaryPokemonSpriteUrl } from '@/utils/pokemon-sprite'
import { calculateBattleStats, getNatureModifier } from '@/utils/stat-calc'
import DamageFieldControls from './components/DamageFieldControls.vue'
import DamageMatrix from './components/DamageMatrix.vue'
import DamagePairDetail from './components/DamagePairDetail.vue'

interface SearchOption {
  value: string
  label: string
  meta?: {
    type?: string
    category?: string
    power?: number | null
    accuracy?: number | null
    pp?: number | null
    effect?: string
    priority?: number
  }
}

const NATURE_LABELS: Record<string, { es: string; en: string }> = {
  adamant: { es: 'Firme', en: 'Adamant' },
  bashful: { es: 'Rara', en: 'Bashful' },
  bold: { es: 'Osada', en: 'Bold' },
  brave: { es: 'Audaz', en: 'Brave' },
  calm: { es: 'Serena', en: 'Calm' },
  careful: { es: 'Cauta', en: 'Careful' },
  docile: { es: 'Docil', en: 'Docile' },
  gentle: { es: 'Amable', en: 'Gentle' },
  hardy: { es: 'Fuerte', en: 'Hardy' },
  hasty: { es: 'Activa', en: 'Hasty' },
  impish: { es: 'Agitada', en: 'Impish' },
  jolly: { es: 'Alegre', en: 'Jolly' },
  lax: { es: 'Floja', en: 'Lax' },
  lonely: { es: 'Huraña', en: 'Lonely' },
  mild: { es: 'Afable', en: 'Mild' },
  modest: { es: 'Modesta', en: 'Modest' },
  naive: { es: 'Ingenua', en: 'Naive' },
  naughty: { es: 'Picara', en: 'Naughty' },
  quiet: { es: 'Mansa', en: 'Quiet' },
  quirky: { es: 'Seria', en: 'Quirky' },
  rash: { es: 'Alocada', en: 'Rash' },
  relaxed: { es: 'Plácida', en: 'Relaxed' },
  sassy: { es: 'Grosera', en: 'Sassy' },
  serious: { es: 'Seria', en: 'Serious' },
  timid: { es: 'Miedosa', en: 'Timid' },
}

const route = useRoute()
const { t, locale } = useI18n()
const damageCalcStore = useDamageCalcStore()
const dexStore = useDexStore()
const teamStore = useTeamStore()

type DamageCalcStep = 'teams' | 'results'
type EditorMode = 'simple' | 'advanced'

interface SwapModalState {
  open: boolean
  side: DamageSideId
  reserveSlot: DamageSlotNumber | null
  selectedActiveSlot: DamageSlotNumber | null
}

interface StatEditorModalState {
  open: boolean
  side: DamageSideId
  slot: DamageSlotNumber | null
}

interface StatEditorDraftState {
  evs: Record<TeamStatKey, number>
  ivs: Record<TeamStatKey, number>
  stages: Record<StageKey, number>
}

interface FloatingPosition {
  x: number
  y: number
}

const matrixAttackerSide = ref<DamageSideId>('A')
const activeStep = ref<DamageCalcStep>('teams')
const editorMode = ref<EditorMode>('simple')
const matrixMinPercent = ref<0 | 75 | 100>(0)
const selectedTemplateB = ref('')
const customTeamBName = ref('')
const moveOptionsCache = ref(new Map<string, SearchOption[]>())
const touchedSlotFlags = ref<Record<string, boolean>>({})
const touchTimers = new Map<string, ReturnType<typeof setTimeout>>()
const swapModal = ref<SwapModalState>({
  open: false,
  side: 'A',
  reserveSlot: null,
  selectedActiveSlot: null,
})
const statEditorModal = ref<StatEditorModalState>({
  open: false,
  side: 'A',
  slot: null,
})
const statEditorOriginal = ref<StatEditorDraftState | null>(null)
const statEditorDraft = ref<StatEditorDraftState | null>(null)
const statEditorPosition = ref<FloatingPosition>({ x: 24, y: 96 })
const statEditorDrag = ref<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
const applyToBuilderMessage = ref('')

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const isVgc = computed(() => mode.value === 'vgc')
const scenario = computed(() => damageCalcStore.getScenario(mode.value))
const scenarioVersion = computed(() => damageCalcStore.getScenarioVersion(mode.value))
const maxActiveSlots = computed(() => (mode.value === 'vgc' ? 4 : 6))
const teamTemplates = computed(() => damageCalcStore.getTeamTemplates(mode.value))
const templateLoadStatus = computed(() => damageCalcStore.getMetaTemplateLoadStatus(mode.value))
const templateLoadError = computed(() => damageCalcStore.getMetaTemplateLoadError(mode.value))

const generationOptions = computed<SearchOption[]>(() => [
  { value: 'gen1', label: t('damageCalc.genLabel', { gen: 1 }) },
  { value: 'gen2', label: t('damageCalc.genLabel', { gen: 2 }) },
  { value: 'gen3', label: t('damageCalc.genLabel', { gen: 3 }) },
  { value: 'gen4', label: t('damageCalc.genLabel', { gen: 4 }) },
  { value: 'gen5', label: t('damageCalc.genLabel', { gen: 5 }) },
  { value: 'gen6', label: t('damageCalc.genLabel', { gen: 6 }) },
  { value: 'gen7', label: t('damageCalc.genLabel', { gen: 7 }) },
  { value: 'gen8', label: t('damageCalc.genLabel', { gen: 8 }) },
  { value: 'gen9', label: t('damageCalc.genLabel', { gen: 9 }) },
])

const statusOptions = computed<SearchOption[]>(() => [
  { value: 'healthy', label: t('damageCalc.status.healthy') },
  { value: 'burn', label: t('damageCalc.status.burn') },
  { value: 'poison', label: t('damageCalc.status.poison') },
  { value: 'toxic', label: t('damageCalc.status.toxic') },
  { value: 'paralyze', label: t('damageCalc.status.paralyze') },
  { value: 'sleep', label: t('damageCalc.status.sleep') },
  { value: 'freeze', label: t('damageCalc.status.freeze') },
])

const moveOrderOptions = computed<SearchOption[]>(() => [
  { value: 'auto', label: t('damageCalc.combat.orderAuto') },
  { value: 'before-target', label: t('damageCalc.combat.orderBeforeTarget') },
  { value: 'after-target', label: t('damageCalc.combat.orderAfterTarget') },
])

const pokemonOptions = computed<SearchOption[]>(() =>
  dexStore.getPokemonByMode(mode.value).map((pokemon) => ({
    value: pokemon.id,
    label: `#${String(pokemon.pokedexNumber).padStart(4, '0')} ${pokemon.name}`,
  })),
)

const itemOptions = computed<SearchOption[]>(() =>
  dexStore.items.map((item) => ({
    value: item.id,
    label: item.name,
  })),
)

function swapReservePokemonName(): string {
  const reserveSlot = swapModal.value.reserveSlot
  if (reserveSlot == null) return ''
  const reserveEntry = sideState(swapModal.value.side).slots.find((entry) => entry.slot === reserveSlot)
  return pokemonNameById(reserveEntry?.pokemonId ?? '')
}

const natureOptions = computed<SearchOption[]>(() =>
  dexStore.natures.map((nature) => ({
    value: nature,
    label: natureOptionLabel(nature),
  })),
)

const teraOptions = computed<SearchOption[]>(() =>
  TYPE_KEYS.map((type) => ({
    value: type,
    label: locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en,
  })),
)

const matrixCells = shallowRef<DamageMatrixCell[]>([])
const pairDetail = shallowRef<DamagePairComputation>({
  attackerSide: 'A',
  attackerSlot: 1,
  defenderSlot: 1,
  resultsByMove: [],
  best: null,
})

const teamTemplateOptions = computed<SearchOption[]>(() =>
  teamTemplates.value.map((entry) => ({ value: entry.id, label: entry.name })),
)
const matrixFilterHelp = computed(() => {
  if (matrixMinPercent.value === 100) return t('damageCalc.matrixFilterHelpKo')
  if (matrixMinPercent.value === 75) return t('damageCalc.matrixFilterHelpHigh')
  return t('damageCalc.matrixFilterHelpAll')
})
const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
type TeamStatKey = (typeof statKeys)[number]
const stageKeys = ['atk', 'def', 'spa', 'spd', 'spe'] as const
type StageKey = (typeof stageKeys)[number]
type CombatBooleanKey =
  | 'wasHitThisTurn'
  | 'tookDamageThisTurn'
  | 'statsLoweredThisTurn'
  | 'previousMoveFailed'
type CombatNumberKey =
  | 'consecutiveMoveUses'
  | 'timesHitThisBattle'
  | 'alliesFaintedCount'
  | 'stockpileCount'
  | 'friendship'

function defaultCombatContext(): DamageCombatContext {
  return {
    wasHitThisTurn: false,
    tookDamageThisTurn: false,
    statsLoweredThisTurn: false,
    previousMoveFailed: false,
    moveOrderHint: 'auto',
    consecutiveMoveUses: 0,
    timesHitThisBattle: 0,
    alliesFaintedCount: 0,
    stockpileCount: 0,
    friendship: 255,
  }
}

function sideName(side: DamageSideId): string {
  if (side === 'A') {
    const teamName = teamStore.getActiveTeam(mode.value).name?.trim()
    return teamName || t('damageCalc.sideA')
  }
  const rivalName = customTeamBName.value.trim()
  return rivalName || t('damageCalc.sideB')
}

function localeCode(): LocaleCode {
  return locale.value === 'en' ? 'en' : 'es'
}

function logDamageCalcPerf(label: string, startedAt: number, context: string) {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return
  const duration = performance.now() - startedAt
  if (duration < 8) return
  console.info(`[DamageCalcPagePerf] ${label} ${duration.toFixed(1)}ms ${context}`)
}

function prettifySlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
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

function natureLabel(natureId: string): string {
  const key = natureId.toLowerCase()
  const mapped = NATURE_LABELS[key]
  if (mapped) return localeCode() === 'es' ? mapped.es : mapped.en
  return prettifySlug(natureId)
}

function natureEffectLabel(natureId: string): string {
  const nature = getNatureModifier(natureId)
  if (!nature.up || !nature.down) {
    return localeCode() === 'es' ? 'Neutra' : 'Neutral'
  }
  return `+${localeStatLabel(nature.up)} / -${localeStatLabel(nature.down)}`
}

function natureOptionLabel(natureId: string): string {
  return `${natureLabel(natureId)} (${natureEffectLabel(natureId)})`
}

function natureIndicator(natureId: string, stat: StatKey): '+' | '-' | '' {
  const nature = getNatureModifier(natureId)
  if (nature.up === stat) return '+'
  if (nature.down === stat) return '-'
  return ''
}

function natureIndicatorClass(natureId: string, stat: StatKey): string {
  const indicator = natureIndicator(natureId, stat)
  if (indicator === '+') return 'text-emerald-300'
  if (indicator === '-') return 'text-rose-300'
  return 'text-gray-500'
}

function statDeltaClass(value: number): string {
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-rose-300'
  return 'text-gray-400'
}

function signed(value: number): string {
  if (value > 0) return `+${value}`
  return String(value)
}

async function ensureScenarioDexReferencesLoaded() {
  const slotSets = [...scenario.value.sideA.slots, ...scenario.value.sideB.slots]

  const pokemonIds = [...new Set(slotSets.map((slotSet) => slotSet.pokemonId).filter(Boolean))]
  const missingPokemonIds = pokemonIds.filter((pokemonId) => !dexStore.getPokemon(mode.value, pokemonId))
  if (missingPokemonIds.length > 0) {
    await Promise.all(
      missingPokemonIds.map((pokemonId) =>
        dexStore.ensurePokemonForms(mode.value, pokemonId, localeCode()),
      ),
    )
  }

  const moveIds = [...new Set(slotSets.flatMap((slotSet) => slotSet.moves).filter(Boolean))]
  if (moveIds.length > 0) {
    await dexStore.ensureMovesByIds(moveIds, localeCode())
  }
}

function availableDefenderSlots(attackerSide: DamageSideId): DamageSlotNumber[] {
  const defenderActive = attackerSide === 'A' ? scenario.value.sideB.activeSlotIds : scenario.value.sideA.activeSlotIds
  if (isVgc.value) return defenderActive.slice(0, 2)
  return defenderActive
}

function targetOptions(attackerSide: DamageSideId): SearchOption[] {
  const defenders = leadSlots(attackerSide === 'A' ? 'B' : 'A')
  if (defenders.length > 0) {
    return defenders.map((slotSet) => ({
      value: String(slotSet.slot),
      label: pokemonNameById(slotSet.pokemonId),
    }))
  }
  return availableDefenderSlots(attackerSide).map((slot) => ({
    value: String(slot),
    label: `#${slot}`,
  }))
}

function sideState(side: DamageSideId) {
  return side === 'A' ? scenario.value.sideA : scenario.value.sideB
}

function lineupSlots(side: DamageSideId) {
  const state = sideState(side)
  return state.activeSlotIds
    .map((slot) => state.slots.find((entry) => entry.slot === slot))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function leadSlots(side: DamageSideId) {
  const state = sideState(side)
  const leadIds = isVgc.value ? state.activeSlotIds.slice(0, 2) : state.activeSlotIds
  return leadIds
    .map((slot) => state.slots.find((entry) => entry.slot === slot))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function backActiveSlots(side: DamageSideId) {
  if (!isVgc.value) return []
  const state = sideState(side)
  const backIds = state.activeSlotIds.slice(2)
  return backIds
    .map((slot) => state.slots.find((entry) => entry.slot === slot))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function reserveSlots(side: DamageSideId) {
  const state = sideState(side)
  const activeSet = new Set(state.activeSlotIds)
  const reserves = state.slots.filter((slot) => !activeSet.has(slot.slot) && Boolean(slot.pokemonId))
  if (!isVgc.value) return reserves
  return reserves.slice(0, 2)
}

const stepOptions = computed<Array<{ value: DamageCalcStep; label: string }>>(() => [
  { value: 'teams', label: t('damageCalc.stepTeams') },
  { value: 'results', label: t('damageCalc.stepResults') },
])

function activeRoleLabel(side: DamageSideId, slot: DamageSlotNumber): string {
  if (!isVgc.value) return t('damageCalc.active')
  const idx = sideState(side).activeSlotIds.indexOf(slot)
  if (idx < 0) return t('damageCalc.roleReserve')
  return idx < 2 ? t('damageCalc.roleLead') : t('damageCalc.roleBack')
}

function swapIntoLead(side: DamageSideId, leadSlot: DamageSlotNumber, candidateSlot: DamageSlotNumber) {
  if (!isVgc.value) return
  const state = sideState(side)
  const active = [...state.activeSlotIds]
  const leadIndex = active.indexOf(leadSlot)
  if (leadIndex < 0) return
  const candidateIndex = active.indexOf(candidateSlot)
  if (candidateIndex >= 0 && candidateIndex === leadIndex) return
  if (candidateIndex >= 0) {
    ;[active[leadIndex], active[candidateIndex]] = [active[candidateIndex], active[leadIndex]]
  } else {
    active[leadIndex] = candidateSlot
  }
  damageCalcStore.setActiveSlots(mode.value, side, active as DamageSlotNumber[])
}

function promptSwapWithReserve(side: DamageSideId, reserveSlot: DamageSlotNumber) {
  if (!isVgc.value) return
  const leads = lineupSlots(side)
  if (leads.length === 0) return
  swapModal.value = {
    open: true,
    side,
    reserveSlot,
    selectedActiveSlot: leads[0]?.slot ?? null,
  }
}

function closeSwapModal() {
  swapModal.value = {
    open: false,
    side: 'A',
    reserveSlot: null,
    selectedActiveSlot: null,
  }
}

function openStatEditor(side: DamageSideId, slot: DamageSlotNumber) {
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  const snapshot: StatEditorDraftState = {
    evs: { ...slotSet.evs },
    ivs: { ...slotSet.ivs },
    stages: { ...slotSet.stages },
  }
  statEditorModal.value = {
    open: true,
    side,
    slot,
  }
  statEditorOriginal.value = structuredClone(snapshot)
  statEditorDraft.value = structuredClone(snapshot)
  statEditorPosition.value = clampStatEditorPosition(statEditorPosition.value.x, statEditorPosition.value.y)
}

function closeStatEditor(options?: { revert?: boolean }) {
  if (options?.revert !== false && statEditorOriginal.value && statEditorModal.value.slot) {
    patchSlot(statEditorModal.value.side, statEditorModal.value.slot, {
      evs: { ...statEditorOriginal.value.evs } as Record<StatKey, number>,
      ivs: { ...statEditorOriginal.value.ivs } as Record<StatKey, number>,
      stages: { ...statEditorOriginal.value.stages },
    })
  }
  statEditorModal.value = {
    open: false,
    side: 'A',
    slot: null,
  }
  statEditorOriginal.value = null
  statEditorDraft.value = null
}

function cancelStatEditor() {
  closeStatEditor()
}

function clampStatEditorPosition(x: number, y: number): FloatingPosition {
  if (typeof window === 'undefined') return { x, y }
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const panelWidth = Math.min(960, Math.max(320, viewportWidth - 32))
  const panelHeight = Math.min(720, Math.max(320, viewportHeight - 32))
  return {
    x: Math.max(16, Math.min(x, Math.max(16, viewportWidth - panelWidth - 16))),
    y: Math.max(16, Math.min(y, Math.max(16, viewportHeight - panelHeight - 16))),
  }
}

function startStatEditorDrag(event: MouseEvent) {
  if (event.button !== 0) return
  statEditorDrag.value = {
    startX: event.clientX,
    startY: event.clientY,
    originX: statEditorPosition.value.x,
    originY: statEditorPosition.value.y,
  }
  window.addEventListener('mousemove', onStatEditorDrag)
  window.addEventListener('mouseup', stopStatEditorDrag)
}

function onStatEditorDrag(event: MouseEvent) {
  const drag = statEditorDrag.value
  if (!drag) return
  const nextX = drag.originX + (event.clientX - drag.startX)
  const nextY = drag.originY + (event.clientY - drag.startY)
  statEditorPosition.value = clampStatEditorPosition(nextX, nextY)
}

function stopStatEditorDrag() {
  statEditorDrag.value = null
  if (typeof window === 'undefined') return
  window.removeEventListener('mousemove', onStatEditorDrag)
  window.removeEventListener('mouseup', stopStatEditorDrag)
}

onBeforeUnmount(() => {
  stopStatEditorDrag()
})

function confirmReserveSwap() {
  if (!swapModal.value.open) return
  const reserveSlot = swapModal.value.reserveSlot
  const selectedActiveSlot = swapModal.value.selectedActiveSlot
  if (!reserveSlot || !selectedActiveSlot) return
  swapIntoLead(swapModal.value.side, selectedActiveSlot, reserveSlot)
  closeSwapModal()
}

function spriteUrl(pokemonId: string): string {
  return primaryPokemonSpriteUrl(pokemonId)
}

function onSpriteError(event: Event) {
  onPokemonSpriteError(event)
}

function slotTouchKey(side: DamageSideId, slot: DamageSlotNumber): string {
  return `${side}-${slot}`
}

function markSlotTouched(side: DamageSideId, slot: DamageSlotNumber) {
  const key = slotTouchKey(side, slot)
  if (touchTimers.has(key)) {
    clearTimeout(touchTimers.get(key))
  }
  touchedSlotFlags.value = { ...touchedSlotFlags.value, [key]: true }
  const timer = setTimeout(() => {
    const next = { ...touchedSlotFlags.value }
    delete next[key]
    touchedSlotFlags.value = next
    touchTimers.delete(key)
  }, 1400)
  touchTimers.set(key, timer)
}

function isSlotTouched(side: DamageSideId, slot: DamageSlotNumber): boolean {
  return Boolean(touchedSlotFlags.value[slotTouchKey(side, slot)])
}

function patchSlot(side: DamageSideId, slot: DamageSlotNumber, patch: Partial<(typeof scenario.value.sideA.slots)[number]>) {
  damageCalcStore.updateSlotSet(mode.value, side, slot, patch)
  markSlotTouched(side, slot)
}

function pokemonNameById(pokemonId: string): string {
  if (!pokemonId) return t('builder.selectPokemon')
  return dexStore.getPokemon(mode.value, pokemonId)?.name ?? pokemonId
}

function typeLabel(type: PokemonTypeKey): string {
  return locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en
}

function normalizeMoveType(typeValue: unknown): PokemonTypeKey | null {
  if (typeof typeValue !== 'string') return null
  return TYPE_KEYS.includes(typeValue as PokemonTypeKey) ? (typeValue as PokemonTypeKey) : null
}

function moveOptionSurfaceStyle(typeValue: unknown) {
  return moveTypeGradientStyle(normalizeMoveType(typeValue))
}

function moveTypeIcon(typeValue: unknown): string | null {
  const type = normalizeMoveType(typeValue)
  return type ? TYPE_META[type].icon : null
}

function moveTypeLabel(typeValue: unknown): string {
  const type = normalizeMoveType(typeValue)
  return type ? typeLabel(type) : '-'
}

function moveCategoryLabel(category: unknown): string {
  if (category === 'physical') return t('builder.moveCategoryPhysical')
  if (category === 'special') return t('builder.moveCategorySpecial')
  if (category === 'status') return t('builder.moveCategoryStatus')
  return '-'
}

function moveCategoryIcon(category: unknown): string | null {
  if (category === 'physical') return movePhysicalSeal
  if (category === 'special') return moveSpecialSeal
  if (category === 'status') return moveStatusSeal
  return null
}

function normalizeMoveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function moveValueLabel(value: unknown): string {
  const normalized = normalizeMoveNumber(value)
  return normalized == null ? '-' : String(normalized)
}

function moveAccuracyValueLabel(value: unknown): string {
  const normalized = normalizeMoveNumber(value)
  return normalized == null ? '-' : `${normalized}%`
}

function movePriorityValueLabel(value: unknown): string {
  const normalized = normalizeMoveNumber(value)
  if (normalized == null) return '0'
  return normalized >= 0 ? `+${normalized}` : String(normalized)
}

function setSlotRole(side: DamageSideId, slot: DamageSlotNumber, role: 'lead' | 'back' | 'reserve' | 'active') {
  const sideState = side === 'A' ? scenario.value.sideA : scenario.value.sideB
  const slotSet = sideState.slots.find((entry) => entry.slot === slot)
  if (role !== 'reserve' && !slotSet?.pokemonId) return
  const active = [...sideState.activeSlotIds]
  const withoutSlot = active.filter((entry) => entry !== slot)

  if (role === 'reserve') {
    damageCalcStore.setActiveSlots(mode.value, side, withoutSlot as DamageSlotNumber[])
    return
  }

  if (!isVgc.value || role === 'active') {
    const next = [slot, ...withoutSlot]
    damageCalcStore.setActiveSlots(mode.value, side, next as DamageSlotNumber[])
    return
  }

  const leadCount = Math.min(2, withoutSlot.length)
  let next: DamageSlotNumber[]
  if (role === 'lead') {
    next = [slot, ...withoutSlot] as DamageSlotNumber[]
  } else {
    next = [
      ...withoutSlot.slice(0, leadCount),
      slot,
      ...withoutSlot.slice(leadCount),
    ] as DamageSlotNumber[]
  }
  damageCalcStore.setActiveSlots(mode.value, side, next)
}

function moveOptionsForPokemon(pokemonId: string): SearchOption[] {
  if (!pokemonId) return []
  const cacheKey = `${mode.value}:${locale.value}:${pokemonId}`
  const cached = moveOptionsCache.value.get(cacheKey)
  if (cached) return cached
  const pokemon = dexStore.getPokemon(mode.value, pokemonId)
  if (!pokemon) return []
  const allowed = new Set(
    getEffectiveLearnsetMoveIds(pokemon, (id) => dexStore.getPokemon(mode.value, id)),
  )
  const options: SearchOption[] = []
  for (const move of dexStore.moves) {
    if (!allowed.has(move.id)) continue
    options.push({
      value: move.id,
      label: move.name,
      meta: {
        type: move.type,
        category: move.category ?? undefined,
        power: move.power > 0 ? move.power : null,
        accuracy: move.accuracy ?? null,
        pp: move.pp ?? null,
        effect: move.description || move.effect || '',
        priority: move.priority ?? 0,
      },
    })
  }
  options.sort((a, b) => a.label.localeCompare(b.label, locale.value === 'es' ? 'es' : 'en'))
  moveOptionsCache.value.set(cacheKey, options)
  return options
}

function abilityOptionsForPokemon(pokemonId: string): SearchOption[] {
  const pokemon = pokemonId ? dexStore.getPokemon(mode.value, pokemonId) : undefined
  if (!pokemon) return []
  return pokemon.abilities.map((abilityId) => ({
    value: abilityId,
    label: dexStore.getAbilityMeta(abilityId).name,
  }))
}

function applyLevelPreset(level: number) {
  const sides: DamageSideId[] = ['A', 'B']
  for (const side of sides) {
    const sideState = side === 'A' ? scenario.value.sideA : scenario.value.sideB
    for (const slot of sideState.slots) {
      patchSlot(side, slot.slot, { level })
    }
  }
}

function applyFieldPreset(preset: 'clear' | 'vgc-standard' | 'singles-standard' | 'sun' | 'rain' | 'sand' | 'snow') {
  const emptyHazards: DamageHazardsState = {
    stealthRock: false,
    spikesLayers: 0,
    toxicSpikesLayers: 0,
    stickyWeb: false,
  }
  const standardSinglesHazards: DamageHazardsState = {
    stealthRock: true,
    spikesLayers: 1,
    toxicSpikesLayers: 0,
    stickyWeb: false,
  }
  const baseField = {
    weather: scenario.value.field.weather,
    terrain: scenario.value.field.terrain,
    sideA: {
      ...scenario.value.field.sideA,
      reflect: false,
      lightScreen: false,
      auroraVeil: false,
      friendGuard: false,
      helpingHand: false,
      battery: false,
      powerSpot: false,
      hazards: { ...emptyHazards },
      protectBySlot: {
        '1': false,
        '2': false,
        '3': false,
        '4': false,
        '5': false,
        '6': false,
      },
    },
    sideB: {
      ...scenario.value.field.sideB,
      reflect: false,
      lightScreen: false,
      auroraVeil: false,
      friendGuard: false,
      helpingHand: false,
      battery: false,
      powerSpot: false,
      hazards: { ...emptyHazards },
      protectBySlot: {
        '1': false,
        '2': false,
        '3': false,
        '4': false,
        '5': false,
        '6': false,
      },
    },
    globalFlags: { gravity: false, magicRoom: false, wonderRoom: false },
  }

  if (preset === 'clear') {
    damageCalcStore.updateField(mode.value, baseField)
    return
  }

  if (preset === 'sun' || preset === 'rain' || preset === 'sand' || preset === 'snow') {
    damageCalcStore.updateField(mode.value, {
      ...baseField,
      weather: preset,
    })
    return
  }

  if (preset === 'vgc-standard') {
    damageCalcStore.updateField(mode.value, {
      ...baseField,
      weather: 'none',
      terrain: 'none',
      sideA: {
        ...baseField.sideA,
        protectBySlot: {
          '1': true,
          '2': true,
          '3': false,
          '4': false,
          '5': false,
          '6': false,
        },
      },
      sideB: {
        ...baseField.sideB,
        protectBySlot: {
          '1': true,
          '2': true,
          '3': false,
          '4': false,
          '5': false,
          '6': false,
        },
      },
    })
    return
  }

  damageCalcStore.updateField(mode.value, {
    ...baseField,
    weather: 'none',
    terrain: 'none',
    sideA: {
      ...baseField.sideA,
      hazards: { ...standardSinglesHazards },
    },
    sideB: {
      ...baseField.sideB,
      hazards: { ...standardSinglesHazards },
    },
  })
}

function importBuilderToSideA() {
  damageCalcStore.initFromBuilder(mode.value)
  void ensureScenarioDexReferencesLoaded()
}

function resetScenario() {
  damageCalcStore.resetScenario(mode.value)
  selectedTemplateB.value = ''
  customTeamBName.value = ''
}

function applyDamageCalcToBuilder() {
  const activeTeam = teamStore.getActiveTeam(mode.value)
  for (const slotSet of scenario.value.sideA.slots) {
    const currentMember = activeTeam.members.find((member) => member.slot === slotSet.slot)
    const pokemon = slotSet.pokemonId ? dexStore.getPokemon(mode.value, slotSet.pokemonId) : undefined
    const natureId = slotSet.natureId || pokemon?.defaultNature || currentMember?.natureId || 'jolly'
    const abilityId = slotSet.abilityId || pokemon?.abilities[0] || currentMember?.abilityId || ''
    teamStore.updateMember(mode.value, slotSet.slot, {
      pokemonId: slotSet.pokemonId,
      abilityId,
      itemId: slotSet.itemId || '',
      natureId,
      teraType: slotSet.teraType,
      evs: { ...slotSet.evs },
      ivs: { ...slotSet.ivs },
      moves: [
        slotSet.moves[0] ?? '',
        slotSet.moves[1] ?? '',
        slotSet.moves[2] ?? '',
        slotSet.moves[3] ?? '',
      ],
      roleTags: pokemon?.roleTags ?? currentMember?.roleTags ?? [],
    })
  }
  applyToBuilderMessage.value = t('damageCalc.applyBuilderSuccess')
  window.setTimeout(() => {
    applyToBuilderMessage.value = ''
  }, 2600)
}

function setGeneration(value: string) {
  damageCalcStore.setGeneration(mode.value, value as DamageGeneration)
}

function onPokemonChange(side: DamageSideId, slot: DamageSlotNumber, pokemonId: string) {
  const pokemon = pokemonId ? dexStore.getPokemon(mode.value, pokemonId) : undefined
  if (!pokemon) {
    patchSlot(side, slot, {
      pokemonId: '',
      abilityId: '',
      itemId: '',
      moves: ['', '', '', ''],
      teraType: undefined,
      isTeraActive: false,
      combatContext: defaultCombatContext(),
    })
    return
  }
  patchSlot(side, slot, {
    pokemonId: pokemon.id,
    abilityId: pokemon.abilities[0] || '',
    natureId: pokemon.defaultNature || 'jolly',
    itemId: pokemon.suggestedItems[0] || '',
    moves: [
      pokemon.suggestedMoves[0] ?? '',
      pokemon.suggestedMoves[1] ?? '',
      pokemon.suggestedMoves[2] ?? '',
      pokemon.suggestedMoves[3] ?? '',
    ],
    teraType: pokemon.types[0],
    isTeraActive: false,
    currentHpPercent: 100,
    status: 'healthy',
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    combatContext: defaultCombatContext(),
  })
}

function updateMove(side: DamageSideId, slot: DamageSlotNumber, moveIndex: number, moveId: string) {
  const sideState = side === 'A' ? scenario.value.sideA : scenario.value.sideB
  const slotSet = sideState.slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  const moves = [...slotSet.moves]
  moves[moveIndex] = moveId
  patchSlot(side, slot, {
    moves: [moves[0], moves[1], moves[2], moves[3]],
  })
}

function applyTemplateB(templateId: string) {
  const template = teamTemplates.value.find((entry) => entry.id === templateId)
  customTeamBName.value = template?.name ?? ''
  if (!template) return

  const templateMemberMap = new Map(template.members.map((member) => [member.slot, member]))
  const defaultLevel = mode.value === 'vgc' ? 50 : 100

  for (const slotSet of scenario.value.sideB.slots) {
    const member = templateMemberMap.get(slotSet.slot)
    if (!member) {
      damageCalcStore.updateSlotSet(mode.value, 'B', slotSet.slot, {
        pokemonId: '',
        abilityId: '',
        itemId: '',
        natureId: 'jolly',
        teraType: undefined,
        isTeraActive: false,
        moves: ['', '', '', ''],
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        level: defaultLevel,
        currentHpPercent: 100,
        status: 'healthy',
        stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        combatContext: defaultCombatContext(),
      })
      continue
    }

    damageCalcStore.updateSlotSet(mode.value, 'B', slotSet.slot, {
      pokemonId: member.pokemonId,
      abilityId: member.abilityId,
      itemId: member.itemId,
      natureId: member.natureId,
      teraType: member.teraType,
      isTeraActive: false,
      moves: [
        member.moves[0] ?? '',
        member.moves[1] ?? '',
        member.moves[2] ?? '',
        member.moves[3] ?? '',
      ],
      evs: { ...member.evs },
      ivs: { ...member.ivs },
      level: member.level || defaultLevel,
      currentHpPercent: 100,
      status: 'healthy',
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      combatContext: defaultCombatContext(),
    })
  }

  const nextActive = template.members
    .map((member) => member.slot)
    .filter((slot, index, arr) => arr.indexOf(slot) === index)
    .slice(0, maxActiveSlots.value) as DamageSlotNumber[]
  if (nextActive.length > 0) {
    damageCalcStore.setActiveSlots(mode.value, 'B', nextActive)
  }
}

function updateSideFieldFlag(side: DamageSideId, key: keyof (typeof scenario.value.field.sideA), value: boolean | number) {
  damageCalcStore.updateSideField(mode.value, side, {
    [key]: value,
  })
}

function updateProtectBySlot(side: DamageSideId, slot: DamageSlotNumber, value: boolean) {
  const fieldSide = side === 'A' ? scenario.value.field.sideA : scenario.value.field.sideB
  damageCalcStore.updateSideField(mode.value, side, {
    protectBySlot: {
      ...fieldSide.protectBySlot,
      [String(slot)]: value,
    },
  })
  markSlotTouched(side, slot)
}

function updateTarget(side: DamageSideId, attackerSlot: DamageSlotNumber, defenderSlot: DamageSlotNumber) {
  const validTargets = availableDefenderSlots(side)
  const safeTarget = validTargets.includes(defenderSlot) ? defenderSlot : (validTargets[0] ?? defenderSlot)
  damageCalcStore.setTarget(mode.value, side, attackerSlot, safeTarget)
  if (
    scenario.value.selectedPair.attackerSide === side &&
    scenario.value.selectedPair.attackerSlot === attackerSlot
  ) {
    damageCalcStore.setSelectedPair(mode.value, side, attackerSlot, safeTarget)
  }
}

function selectPair(attackerSlot: DamageSlotNumber, defenderSlot: DamageSlotNumber) {
  damageCalcStore.setSelectedPair(mode.value, matrixAttackerSide.value, attackerSlot, defenderSlot)
}

function syncSelectedPairWithDefaultTarget(attackerSide: DamageSideId) {
  const attackerState = sideState(attackerSide)
  const defaultAttackerSlot = attackerState.activeSlotIds[0]
  if (!defaultAttackerSlot) return
  const defenderChoices = availableDefenderSlots(attackerSide)
  const preferredDefender = attackerState.targetByAttacker[String(defaultAttackerSlot)] as DamageSlotNumber | undefined
  const fallbackDefender = preferredDefender && defenderChoices.includes(preferredDefender)
    ? preferredDefender
    : defenderChoices[0]
  if (!fallbackDefender) return
  damageCalcStore.setSelectedPair(mode.value, attackerSide, defaultAttackerSlot, fallbackDefender)
}

function inputNumber(value: string): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function stageLabel(key: StageKey): string {
  return key.toUpperCase()
}

function updateStage(side: DamageSideId, slot: DamageSlotNumber, key: StageKey, value: string) {
  const parsed = Number(value)
  const clamped = Number.isFinite(parsed) ? Math.max(-6, Math.min(6, Math.round(parsed))) : 0
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  patchSlot(side, slot, {
    stages: {
      ...slotSet.stages,
      [key]: clamped,
    },
  })
}

function slotCombatContext(slotSet?: { combatContext?: Partial<DamageCombatContext> }): DamageCombatContext {
  return {
    ...defaultCombatContext(),
    ...(slotSet?.combatContext ?? {}),
  }
}

function updateCombatContext(side: DamageSideId, slot: DamageSlotNumber, patch: Partial<DamageCombatContext>) {
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  patchSlot(side, slot, {
    combatContext: {
      ...slotCombatContext(slotSet),
      ...patch,
    },
  })
}

function updateCombatFlag(side: DamageSideId, slot: DamageSlotNumber, key: CombatBooleanKey, checked: boolean) {
  updateCombatContext(side, slot, { [key]: checked } as Partial<DamageCombatContext>)
}

function updateCombatNumber(
  side: DamageSideId,
  slot: DamageSlotNumber,
  key: CombatNumberKey,
  value: string,
  max: number,
) {
  const parsed = Number(value)
  const normalized = Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : 0
  updateCombatContext(side, slot, { [key]: normalized } as Partial<DamageCombatContext>)
}

function updateMoveOrderHint(side: DamageSideId, slot: DamageSlotNumber, value: string) {
  const hint: DamageMoveOrderHint =
    value === 'before-target' || value === 'after-target' ? value : 'auto'
  updateCombatContext(side, slot, { moveOrderHint: hint })
}

function updateEv(side: DamageSideId, slot: DamageSlotNumber, key: TeamStatKey, value: string) {
  const parsed = Number(value)
  const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(252, Math.round(parsed))) : 0
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  patchSlot(side, slot, {
    evs: {
      ...slotSet.evs,
      [key]: clamped,
    } as Record<StatKey, number>,
  })
}

function updateIv(side: DamageSideId, slot: DamageSlotNumber, key: TeamStatKey, value: string) {
  const parsed = Number(value)
  const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(31, Math.round(parsed))) : 31
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  patchSlot(side, slot, {
    ivs: {
      ...slotSet.ivs,
      [key]: clamped,
    } as Record<StatKey, number>,
  })
}

function slotEvTotal(side: DamageSideId, slot: DamageSlotNumber): number {
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return 0
  return statKeys.reduce((sum, stat) => sum + (slotSet.evs[stat] ?? 0), 0)
}

function slotHasIllegalEvTotal(side: DamageSideId, slot: DamageSlotNumber): boolean {
  return slotEvTotal(side, slot) > 510
}

function statLabel(key: TeamStatKey): string {
  return key.toUpperCase()
}

function stageTags(slotSet?: { stages: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number> }): string[] {
  if (!slotSet) return [t('damageCalc.stageNeutralTag')]
  const tags = stageKeys
    .map((key) => {
      const value = slotSet.stages[key] ?? 0
      if (value === 0) return ''
      const sign = value > 0 ? '+' : ''
      return `${stageLabel(key)} ${sign}${value}`
    })
    .filter((value) => Boolean(value))
  return tags.length > 0 ? tags : [t('damageCalc.stageNeutralTag')]
}

function hasAlteredStatus(status: DamageStatus | undefined): boolean {
  return Boolean(status && status !== 'healthy')
}

function statusBadgeLabel(status: DamageStatus | undefined): string {
  switch (status) {
    case 'burn':
      return 'BRN'
    case 'poison':
      return 'PSN'
    case 'toxic':
      return 'TOX'
    case 'paralyze':
      return 'PAR'
    case 'sleep':
      return 'SLP'
    case 'freeze':
      return 'FRZ'
    default:
      return ''
  }
}

function statusBadgeClass(status: DamageStatus | undefined): string {
  switch (status) {
    case 'burn':
      return 'border-orange-400/50 bg-orange-500/15 text-orange-100'
    case 'poison':
      return 'border-violet-400/50 bg-violet-500/15 text-violet-100'
    case 'toxic':
      return 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100'
    case 'paralyze':
      return 'border-amber-400/50 bg-amber-500/15 text-amber-100'
    case 'sleep':
      return 'border-indigo-400/50 bg-indigo-500/15 text-indigo-100'
    case 'freeze':
      return 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
    default:
      return 'border-gray-700 bg-off-black/50 text-gray-300'
  }
}

interface MatrixSideEntry {
  slot: DamageSlotNumber
  pokemonId: string
  name: string
  sprite: string
}

const matrixAttackerEntries = computed<MatrixSideEntry[]>(() =>
  (isVgc.value ? leadSlots(matrixAttackerSide.value) : lineupSlots(matrixAttackerSide.value)).map((slotSet) => ({
    slot: slotSet.slot,
    pokemonId: slotSet.pokemonId,
    name: pokemonNameById(slotSet.pokemonId),
    sprite: spriteUrl(slotSet.pokemonId),
  })),
)

const matrixDefenderEntries = computed<MatrixSideEntry[]>(() =>
  (isVgc.value ? leadSlots(matrixAttackerSide.value === 'A' ? 'B' : 'A') : lineupSlots(matrixAttackerSide.value === 'A' ? 'B' : 'A')).map((slotSet) => ({
    slot: slotSet.slot,
    pokemonId: slotSet.pokemonId,
    name: pokemonNameById(slotSet.pokemonId),
    sprite: spriteUrl(slotSet.pokemonId),
  })),
)

const matrixAtoBLabel = computed(() => `${sideName('A')} -> ${sideName('B')}`)
const matrixBtoALabel = computed(() => `${sideName('B')} -> ${sideName('A')}`)
const protectLabelsA = computed<Record<string, string>>(() =>
  Object.fromEntries(lineupSlots('A').map((slotSet) => [String(slotSet.slot), pokemonNameById(slotSet.pokemonId)])),
)
const protectLabelsB = computed<Record<string, string>>(() =>
  Object.fromEntries(lineupSlots('B').map((slotSet) => [String(slotSet.slot), pokemonNameById(slotSet.pokemonId)])),
)
const selectedLevelPreset = computed<50 | 100 | null>(() => {
  const levels = [...scenario.value.sideA.slots, ...scenario.value.sideB.slots].map((entry) => entry.level)
  if (levels.length === 0) return null
  const uniqueLevels = [...new Set(levels)]
  if (uniqueLevels.length !== 1) return null
  const value = uniqueLevels[0]
  return value === 50 || value === 100 ? value : null
})

const selectedPairAttackerSlotSet = computed(() => {
  const pair = scenario.value.selectedPair
  const state = pair.attackerSide === 'A' ? scenario.value.sideA : scenario.value.sideB
  return state.slots.find((entry) => entry.slot === pair.attackerSlot)
})

const selectedPairAttackerSide = computed<DamageSideId>(() => scenario.value.selectedPair.attackerSide)
const selectedPairDefenderSide = computed<DamageSideId>(() =>
  scenario.value.selectedPair.attackerSide === 'A' ? 'B' : 'A',
)

const selectedPairDefenderSlotSet = computed(() => {
  const pair = scenario.value.selectedPair
  const defenderSide = pair.attackerSide === 'A' ? scenario.value.sideB : scenario.value.sideA
  return defenderSide.slots.find((entry) => entry.slot === pair.defenderSlot)
})

const selectedPairAttackerName = computed(() =>
  pokemonNameById(selectedPairAttackerSlotSet.value?.pokemonId ?? ''),
)

const selectedPairDefenderName = computed(() =>
  pokemonNameById(selectedPairDefenderSlotSet.value?.pokemonId ?? ''),
)

const selectedPairMoveOptions = computed<SearchOption[]>(() =>
  moveOptionsForPokemon(selectedPairAttackerSlotSet.value?.pokemonId ?? ''),
)

const selectedPairMoves = computed<[string, string, string, string]>(() =>
  selectedPairAttackerSlotSet.value?.moves ?? ['', '', '', ''],
)
const canSyncSelectedPairMovesToBuilder = computed(
  () => selectedPairAttackerSide.value === 'A' && Boolean(selectedPairAttackerSlotSet.value?.pokemonId),
)

const statEditorSlotSet = computed(() => {
  if (!statEditorModal.value.open || !statEditorModal.value.slot) return undefined
  return sideState(statEditorModal.value.side).slots.find((entry) => entry.slot === statEditorModal.value.slot)
})

const statEditorModalStyle = computed(() => ({
  left: `${statEditorPosition.value.x}px`,
  top: `${statEditorPosition.value.y}px`,
  width: 'min(960px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 32px)',
}))

const statEditorPokemonName = computed(() =>
  pokemonNameById(statEditorSlotSet.value?.pokemonId ?? ''),
)

const statEditorPokemon = computed(() => {
  const pokemonId = statEditorSlotSet.value?.pokemonId ?? ''
  if (!pokemonId) return undefined
  return dexStore.getPokemon(mode.value, pokemonId)
})

const statEditorNatureId = computed(() =>
  statEditorSlotSet.value?.natureId || statEditorPokemon.value?.defaultNature || 'hardy',
)

const statEditorCalculatedStats = computed(() => {
  const slotSet = statEditorSlotSet.value
  const pokemon = statEditorPokemon.value
  const draft = statEditorDraft.value
  if (!slotSet || !pokemon || !draft) {
    return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  }
  return calculateBattleStats(
    pokemon.baseStats,
    draft.ivs as Record<StatKey, number>,
    draft.evs as Record<StatKey, number>,
    slotSet.level,
    statEditorNatureId.value,
  )
})

const statEditorBaselineStats = computed(() => {
  const slotSet = statEditorSlotSet.value
  const pokemon = statEditorPokemon.value
  if (!slotSet || !pokemon) {
    return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  }
  return calculateBattleStats(
    pokemon.baseStats,
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    slotSet.level,
    'hardy',
  )
})

const statEditorEvTotal = computed(() => {
  const draft = statEditorDraft.value
  if (!draft) return 0
  return draft.evs.hp + draft.evs.atk + draft.evs.def + draft.evs.spa + draft.evs.spd + draft.evs.spe
})
const statEditorHasIllegalEvs = computed(() => statEditorEvTotal.value > 510)

function updateMoveFromPairDetail(moveIndex: number, moveId: string) {
  const pair = scenario.value.selectedPair
  updateMove(pair.attackerSide, pair.attackerSlot, moveIndex, moveId)
}

function syncSelectedPairMovesToBuilder() {
  const attackerSlotSet = selectedPairAttackerSlotSet.value
  if (!attackerSlotSet || selectedPairAttackerSide.value !== 'A' || !attackerSlotSet.pokemonId) return

  teamStore.updateMember(mode.value, attackerSlotSet.slot, {
    moves: [...attackerSlotSet.moves] as [string, string, string, string],
  })
  applyToBuilderMessage.value = t('damageCalc.pairSyncMovesSaved')
  window.setTimeout(() => {
    if (applyToBuilderMessage.value === t('damageCalc.pairSyncMovesSaved')) {
      applyToBuilderMessage.value = ''
    }
  }, 2200)
}

function updateStatEditorEv(key: TeamStatKey, value: string) {
  if (!statEditorModal.value.open || !statEditorModal.value.slot) return
  if (!statEditorDraft.value) return
  const numeric = Number(value)
  const clamped = Math.max(0, Math.min(252, Math.floor((Number.isFinite(numeric) ? numeric : 0) / 4) * 4))
  statEditorDraft.value = {
    ...statEditorDraft.value,
    evs: {
      ...statEditorDraft.value.evs,
      [key]: clamped,
    },
  }
  patchSlot(statEditorModal.value.side, statEditorModal.value.slot, {
    evs: { ...statEditorDraft.value.evs } as Record<StatKey, number>,
  })
}

function updateStatEditorIv(key: TeamStatKey, value: string) {
  if (!statEditorModal.value.open || !statEditorModal.value.slot) return
  if (!statEditorDraft.value) return
  const numeric = Number(value)
  const clamped = Math.max(0, Math.min(31, Math.floor(Number.isFinite(numeric) ? numeric : 0)))
  statEditorDraft.value = {
    ...statEditorDraft.value,
    ivs: {
      ...statEditorDraft.value.ivs,
      [key]: clamped,
    },
  }
  patchSlot(statEditorModal.value.side, statEditorModal.value.slot, {
    ivs: { ...statEditorDraft.value.ivs } as Record<StatKey, number>,
  })
}

function updateStatEditorStage(key: StageKey, value: string) {
  if (!statEditorModal.value.open || !statEditorModal.value.slot) return
  if (!statEditorDraft.value) return
  const numeric = Number(value)
  const clamped = Math.max(-6, Math.min(6, Math.floor(Number.isFinite(numeric) ? numeric : 0)))
  statEditorDraft.value = {
    ...statEditorDraft.value,
    stages: {
      ...statEditorDraft.value.stages,
      [key]: clamped,
    },
  }
  patchSlot(statEditorModal.value.side, statEditorModal.value.slot, {
    stages: { ...statEditorDraft.value.stages },
  })
}

function saveStatEditor() {
  if (!statEditorModal.value.open || !statEditorModal.value.slot || !statEditorDraft.value) return

  if (statEditorModal.value.side === 'A') {
    teamStore.updateMember(mode.value, statEditorModal.value.slot, {
      evs: { ...statEditorDraft.value.evs } as Record<StatKey, number>,
      ivs: { ...statEditorDraft.value.ivs } as Record<StatKey, number>,
    })
    applyToBuilderMessage.value = t('damageCalc.quickStatsSavedToBuilder')
    window.setTimeout(() => {
      if (applyToBuilderMessage.value === t('damageCalc.quickStatsSavedToBuilder')) {
        applyToBuilderMessage.value = ''
      }
    }, 2200)
  }

  closeStatEditor({ revert: false })
}

function setQuickTeraType(side: DamageSideId, slot: DamageSlotNumber, teraTypeValue: string) {
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  const teraType = (teraTypeValue || undefined) as PokemonTypeKey | undefined
  patchSlot(side, slot, {
    teraType,
    isTeraActive: teraType ? slotSet.isTeraActive : false,
  })
}

function toggleQuickTera(side: DamageSideId, slot: DamageSlotNumber, enabled: boolean) {
  const slotSet = sideState(side).slots.find((entry) => entry.slot === slot)
  if (!slotSet) return
  let teraType = slotSet.teraType
  if (enabled && !teraType) {
    const pokemon = slotSet.pokemonId ? dexStore.getPokemon(mode.value, slotSet.pokemonId) : undefined
    teraType = pokemon?.types[0]
  }
  patchSlot(side, slot, {
    teraType,
    isTeraActive: enabled && Boolean(teraType),
  })
}

watch(
  mode,
  () => {
    damageCalcStore.initFromBuilder(mode.value)
    void damageCalcStore.ensureMetaTemplatesLoaded(mode.value)
    void ensureScenarioDexReferencesLoaded()
    moveOptionsCache.value.clear()
    selectedTemplateB.value = ''
    customTeamBName.value = ''
  },
  { immediate: true },
)

watch(
  [activeStep, mode, matrixAttackerSide, scenarioVersion],
  ([step, currentMode, attackerSide]) => {
    if (step !== 'results') {
      matrixCells.value = []
      return
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
    matrixCells.value = damageCalcStore.computeMatrix(currentMode, attackerSide)
    logDamageCalcPerf('matrix-sync', startedAt, `${currentMode}:${attackerSide}`)
  },
  { immediate: true },
)

watch(
  [
    activeStep,
    mode,
    scenarioVersion,
    () => scenario.value.selectedPair.attackerSide,
    () => scenario.value.selectedPair.attackerSlot,
    () => scenario.value.selectedPair.defenderSlot,
  ],
  ([step, currentMode, , attackerSide, attackerSlot, defenderSlot]) => {
    if (step !== 'results') {
      pairDetail.value = {
        attackerSide: 'A',
        attackerSlot: 1,
        defenderSlot: 1,
        resultsByMove: [],
        best: null,
      }
      return
    }
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
    pairDetail.value = damageCalcStore.computePair(
      currentMode,
      attackerSide,
      attackerSlot,
      defenderSlot,
    )
    logDamageCalcPerf('pair-sync', startedAt, `${currentMode}:${attackerSide}:${attackerSlot}->${defenderSlot}`)
  },
  { immediate: true },
)

watch(
  () => [
    mode.value,
    locale.value,
    ...scenario.value.sideA.slots.map((slotSet) => `${slotSet.pokemonId}|${slotSet.moves.join(',')}`),
    ...scenario.value.sideB.slots.map((slotSet) => `${slotSet.pokemonId}|${slotSet.moves.join(',')}`),
  ],
  () => {
    void ensureScenarioDexReferencesLoaded()
  },
)

watch(
  () => [locale.value, dexStore.moves.length],
  () => {
    moveOptionsCache.value.clear()
  },
)

watch(
  mode,
  () => {
    for (const timer of touchTimers.values()) {
      clearTimeout(timer)
    }
    touchTimers.clear()
    touchedSlotFlags.value = {}
  },
)

watch(matrixAttackerSide, (side) => {
  syncSelectedPairWithDefaultTarget(side)
})

watch(activeStep, (step) => {
  if (step === 'results') {
    syncSelectedPairWithDefaultTarget(matrixAttackerSide.value)
  }
})

watch(selectedTemplateB, (templateId) => {
  if (!templateId) {
    customTeamBName.value = ''
    return
  }
  applyTemplateB(templateId)
})
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-xl border border-sky-500/30 bg-off-black/70 p-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-sky-200">{{ t('damageCalc.title') }}</h1>
          <p class="mt-1 text-xs text-gray-400">
            {{ t('damageCalc.modeHint') }}
          </p>
          <p v-if="isVgc" class="mt-1 text-xs text-gray-500">
            {{ t('damageCalc.vgcRolesHint') }}
          </p>
        </div>

        <div class="flex flex-col gap-2 lg:items-end">
          <div class="w-full min-w-[220px] lg:w-[240px]">
            <label class="text-xs">
              <span class="mb-1 block text-gray-300">{{ t('damageCalc.generation') }}</span>
              <SearchableSelect
                :model-value="scenario.generation"
                :options="generationOptions"
                :clearable="false"
                @update:model-value="setGeneration"
              />
            </label>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded-md border px-3 py-1.5 text-xs transition"
              :class="
                selectedLevelPreset === 50
                  ? 'border-cyan-400/80 bg-cyan-500/20 text-cyan-100'
                  : 'border-gray-700 bg-off-black/60 text-gray-100 hover:border-sky-500/60'
              "
              @click="applyLevelPreset(50)"
            >
              {{ t('damageCalc.levelPreset', { level: 50 }) }}
            </button>
            <button
              type="button"
              class="rounded-md border px-3 py-1.5 text-xs transition"
              :class="
                selectedLevelPreset === 100
                  ? 'border-cyan-400/80 bg-cyan-500/20 text-cyan-100'
                  : 'border-gray-700 bg-off-black/60 text-gray-100 hover:border-sky-500/60'
              "
              @click="applyLevelPreset(100)"
            >
              {{ t('damageCalc.levelPreset', { level: 100 }) }}
            </button>
            <button
              type="button"
              class="rounded-md border border-sky-500/45 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100"
              @click="importBuilderToSideA"
            >
              {{ t('damageCalc.importBuilderA') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-emerald-500/45 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100"
              @click="applyDamageCalcToBuilder"
            >
              {{ t('damageCalc.applyBuilder') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-rose-500/45 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100"
              @click="resetScenario"
            >
              {{ t('damageCalc.resetScenario') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-violet-500/45 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100"
              @click="applyFieldPreset(isVgc ? 'vgc-standard' : 'singles-standard')"
            >
              {{ t('damageCalc.applyPreset') }}
            </button>
            <div class="min-w-[240px]">
              <select
                class="w-full rounded-md border border-gray-700 bg-st-black p-2 text-sm text-gray-100 outline-none transition focus:border-sky-400/70"
                v-model="selectedTemplateB"
              >
                <option value="">{{ t('damageCalc.loadMetaTemplate') }}</option>
                <option
                  v-for="option in teamTemplateOptions"
                  :key="`meta-template-option-${option.value}`"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <p v-if="templateLoadStatus === 'loading'" class="mt-1 text-[10px] text-cyan-200">
                {{ t('damageCalc.metaTemplatesLoading') }}
              </p>
              <p v-else-if="templateLoadStatus === 'error'" class="mt-1 text-[10px] text-rose-200">
                {{ t('damageCalc.metaTemplatesError', { message: templateLoadError || 'unknown' }) }}
              </p>
              <p v-else-if="templateLoadStatus === 'ready'" class="mt-1 text-[10px] text-emerald-200">
                {{ t('damageCalc.metaTemplatesReady') }}
              </p>
            </div>
          </div>
        <p v-if="applyToBuilderMessage" class="text-right text-xs text-emerald-200">
          {{ applyToBuilderMessage }}
        </p>
      </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-700/70 pt-3">
        <div class="inline-flex rounded-lg border border-gray-700 bg-off-black/70 p-1 text-xs">
          <button
            v-for="step in stepOptions"
            :key="step.value"
            type="button"
            class="rounded px-2.5 py-1"
            :class="activeStep === step.value ? 'bg-sky-500/20 text-sky-100' : 'text-gray-300'"
            @click="activeStep = step.value"
          >
            {{ step.label }}
          </button>
        </div>

        <div v-if="activeStep !== 'results'" class="inline-flex rounded-lg border border-gray-700 bg-off-black/70 p-1 text-xs">
          <button
            type="button"
            class="rounded px-2.5 py-1"
            :class="editorMode === 'simple' ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-300'"
            @click="editorMode = 'simple'"
          >
            {{ t('damageCalc.simpleMode') }}
          </button>
          <button
            type="button"
            class="rounded px-2.5 py-1"
            :class="editorMode === 'advanced' ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-gray-300'"
            @click="editorMode = 'advanced'"
          >
            {{ t('damageCalc.advancedMode') }}
          </button>
        </div>
      </div>
    </header>

    <section v-if="activeStep === 'results'" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
      <article class="rounded-xl border border-sky-500/30 bg-off-black/70 p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-sky-200">{{ t('damageCalc.matrixTitle') }}</h3>
          <div class="flex flex-wrap items-center gap-2">
            <div class="inline-flex rounded-lg border border-gray-700 bg-off-black/70 p-1 text-xs">
              <button
                type="button"
                class="rounded px-2 py-1"
                :class="matrixAttackerSide === 'A' ? 'bg-sky-500/20 text-sky-100' : 'text-gray-300'"
                @click="matrixAttackerSide = 'A'"
              >
                {{ matrixAtoBLabel }}
              </button>
              <button
                type="button"
                class="rounded px-2 py-1"
                :class="matrixAttackerSide === 'B' ? 'bg-sky-500/20 text-sky-100' : 'text-gray-300'"
                @click="matrixAttackerSide = 'B'"
              >
                {{ matrixBtoALabel }}
              </button>
            </div>

            <div class="inline-flex rounded-lg border border-gray-700 bg-off-black/70 p-1 text-xs">
              <button
                type="button"
                class="rounded px-2 py-1"
                :class="matrixMinPercent === 0 ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-300'"
                @click="matrixMinPercent = 0"
              >
                {{ t('damageCalc.filterAll') }}
              </button>
              <button
                type="button"
                class="rounded px-2 py-1"
                :class="matrixMinPercent === 75 ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-300'"
                @click="matrixMinPercent = 75"
              >
                {{ t('damageCalc.filterHigh') }}
              </button>
              <button
                type="button"
                class="rounded px-2 py-1"
                :class="matrixMinPercent === 100 ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-300'"
                @click="matrixMinPercent = 100"
              >
                {{ t('damageCalc.filterKo') }}
              </button>
            </div>
          </div>
        </div>
        <p class="mb-2 text-[11px] text-gray-400">
          {{ matrixFilterHelp }}
        </p>

        <div class="mb-3 rounded-xl border border-fuchsia-500/30 bg-off-black/55 p-2">
          <div class="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-md border border-gray-700 bg-off-black/60 px-2.5 py-1.5 text-xs text-gray-200 hover:border-cyan-500/60"
              @click="applyFieldPreset('clear')"
            >
              {{ t('damageCalc.fieldPresetClear') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-700 bg-off-black/60 px-2.5 py-1.5 text-xs text-gray-200 hover:border-cyan-500/60"
              @click="applyFieldPreset('sun')"
            >
              {{ t('damageCalc.fieldPresetSun') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-700 bg-off-black/60 px-2.5 py-1.5 text-xs text-gray-200 hover:border-cyan-500/60"
              @click="applyFieldPreset('rain')"
            >
              {{ t('damageCalc.fieldPresetRain') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-700 bg-off-black/60 px-2.5 py-1.5 text-xs text-gray-200 hover:border-cyan-500/60"
              @click="applyFieldPreset('sand')"
            >
              {{ t('damageCalc.fieldPresetSand') }}
            </button>
            <button
              type="button"
              class="rounded-md border border-gray-700 bg-off-black/60 px-2.5 py-1.5 text-xs text-gray-200 hover:border-cyan-500/60"
              @click="applyFieldPreset('snow')"
            >
              {{ t('damageCalc.fieldPresetSnow') }}
            </button>
          </div>

          <DamageFieldControls
            :scenario="scenario"
            :is-vgc="isVgc"
            :protect-labels-a="protectLabelsA"
            :protect-labels-b="protectLabelsB"
            @update-weather="damageCalcStore.updateField(mode, { weather: $event })"
            @update-terrain="damageCalcStore.updateField(mode, { terrain: $event })"
            @update-global-flag="
              damageCalcStore.updateField(mode, {
                globalFlags: {
                  ...scenario.field.globalFlags,
                  [$event.key]: $event.value,
                },
              })
            "
            @update-advanced-flag="
              damageCalcStore.updateField(mode, {
                advancedFlags: {
                  ...scenario.field.advancedFlags,
                  [$event.key]: $event.value,
                },
              })
            "
            @update-side-flag="updateSideFieldFlag($event.side, $event.key, $event.value)"
            @update-protect="updateProtectBySlot($event.side, $event.slot, $event.value)"
            @update-side-hazards="
              damageCalcStore.updateSideField(mode, $event.side, {
                hazards: {
                  ...($event.side === 'A' ? scenario.field.sideA.hazards : scenario.field.sideB.hazards),
                  ...$event.patch,
                },
              })
            "
          />
        </div>

        <p class="mb-2 text-[11px] text-gray-400">
          {{ t('damageCalc.matrixDirectionHelp') }}
        </p>

        <div v-if="isVgc" class="mb-3 grid gap-2 xl:grid-cols-2">
          <div class="rounded-lg border border-gray-700 bg-st-black/40 p-2">
            <p class="text-xs font-semibold text-sky-100">{{ sideName('A') }}</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <span
                v-for="slotSet in lineupSlots('A')"
                :key="`results-a-lineup-${slotSet.slot}`"
                class="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100"
              >
                {{ pokemonNameById(slotSet.pokemonId) }} · {{ activeRoleLabel('A', slotSet.slot) }}
              </span>
            </div>
            <div v-if="isVgc && leadSlots('A').length > 0" class="mt-2 rounded border border-sky-500/30 bg-sky-500/5 p-2">
              <p class="mb-1 text-[11px] font-semibold text-sky-100">{{ t('damageCalc.quickTeraLeads') }}</p>
              <div class="grid gap-2">
                <div
                  v-for="lead in leadSlots('A')"
                  :key="`results-a-tera-${lead.slot}`"
                  class="flex flex-wrap items-center justify-between gap-2"
                >
                  <span class="text-[11px] text-gray-200">{{ pokemonNameById(lead.pokemonId) }}</span>
                  <div class="flex items-center gap-2">
                    <select
                      class="rounded border border-gray-700 bg-off-black/80 px-2 py-1 text-[11px] text-gray-100"
                      :value="lead.teraType ?? ''"
                      @change="setQuickTeraType('A', lead.slot, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">{{ t('damageCalc.tera') }}</option>
                      <option v-for="option in teraOptions" :key="`quick-tera-a-${lead.slot}-${option.value}`" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                    <label class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                      <input
                        class="accent-sky-400"
                        type="checkbox"
                        :checked="lead.isTeraActive"
                        @change="toggleQuickTera('A', lead.slot, ($event.target as HTMLInputElement).checked)"
                      />
                      {{ t('damageCalc.tera') }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="backActiveSlots('A').length > 0" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="back in backActiveSlots('A')"
                :key="`results-a-back-${back.slot}`"
                type="button"
                class="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-100 hover:border-cyan-400"
                @click="promptSwapWithReserve('A', back.slot)"
              >
                {{ t('damageCalc.swapBackToLead') }}: {{ pokemonNameById(back.pokemonId) }}
              </button>
            </div>
            <div v-if="reserveSlots('A').length > 0" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="reserve in reserveSlots('A')"
                :key="`results-a-reserve-${reserve.slot}`"
                type="button"
                class="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-100 hover:border-violet-400"
                @click="promptSwapWithReserve('A', reserve.slot)"
              >
                {{ t('damageCalc.swapReserve') }}: {{ pokemonNameById(reserve.pokemonId) }}
              </button>
            </div>
          </div>

          <div class="rounded-lg border border-gray-700 bg-st-black/40 p-2">
            <p class="text-xs font-semibold text-rose-100">{{ sideName('B') }}</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <span
                v-for="slotSet in lineupSlots('B')"
                :key="`results-b-lineup-${slotSet.slot}`"
                class="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-100"
              >
                {{ pokemonNameById(slotSet.pokemonId) }} · {{ activeRoleLabel('B', slotSet.slot) }}
              </span>
            </div>
            <div v-if="isVgc && leadSlots('B').length > 0" class="mt-2 rounded border border-rose-500/30 bg-rose-500/5 p-2">
              <p class="mb-1 text-[11px] font-semibold text-rose-100">{{ t('damageCalc.quickTeraLeads') }}</p>
              <div class="grid gap-2">
                <div
                  v-for="lead in leadSlots('B')"
                  :key="`results-b-tera-${lead.slot}`"
                  class="flex flex-wrap items-center justify-between gap-2"
                >
                  <span class="text-[11px] text-gray-200">{{ pokemonNameById(lead.pokemonId) }}</span>
                  <div class="flex items-center gap-2">
                    <select
                      class="rounded border border-gray-700 bg-off-black/80 px-2 py-1 text-[11px] text-gray-100"
                      :value="lead.teraType ?? ''"
                      @change="setQuickTeraType('B', lead.slot, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">{{ t('damageCalc.tera') }}</option>
                      <option v-for="option in teraOptions" :key="`quick-tera-b-${lead.slot}-${option.value}`" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                    <label class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                      <input
                        class="accent-sky-400"
                        type="checkbox"
                        :checked="lead.isTeraActive"
                        @change="toggleQuickTera('B', lead.slot, ($event.target as HTMLInputElement).checked)"
                      />
                      {{ t('damageCalc.tera') }}
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="backActiveSlots('B').length > 0" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="back in backActiveSlots('B')"
                :key="`results-b-back-${back.slot}`"
                type="button"
                class="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-100 hover:border-cyan-400"
                @click="promptSwapWithReserve('B', back.slot)"
              >
                {{ t('damageCalc.swapBackToLead') }}: {{ pokemonNameById(back.pokemonId) }}
              </button>
            </div>
            <div v-if="reserveSlots('B').length > 0" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="reserve in reserveSlots('B')"
                :key="`results-b-reserve-${reserve.slot}`"
                type="button"
                class="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-100 hover:border-violet-400"
                @click="promptSwapWithReserve('B', reserve.slot)"
              >
                {{ t('damageCalc.swapReserve') }}: {{ pokemonNameById(reserve.pokemonId) }}
              </button>
            </div>
          </div>
        </div>

        <DamageMatrix
          :attacker-side="matrixAttackerSide"
          :attacker-entries="matrixAttackerEntries"
          :defender-entries="matrixDefenderEntries"
          :cells="matrixCells"
          :min-percent="matrixMinPercent"
          :selected-pair="scenario.selectedPair"
          @select-pair="selectPair($event.attackerSlot, $event.defenderSlot)"
        />
      </article>

      <div class="xl:sticky xl:top-4 xl:self-start">
        <DamagePairDetail
          :pair="pairDetail"
          :move-options="selectedPairMoveOptions"
          :editable-moves="selectedPairMoves"
          :attacker-name="selectedPairAttackerName"
          :defender-name="selectedPairDefenderName"
          :can-sync-moves-to-builder="canSyncSelectedPairMovesToBuilder"
          @update-move="updateMoveFromPairDetail($event.moveIndex, $event.moveId)"
          @sync-moves-to-builder="syncSelectedPairMovesToBuilder"
        />

        <article class="mt-3 rounded-xl border border-sky-500/25 bg-off-black/70 p-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-sky-200">{{ t('damageCalc.statsQuickEdit') }}</h4>
          <div class="mt-2 grid gap-2">
            <div class="rounded border border-sky-500/45 bg-sky-500/10 p-2">
              <button
                type="button"
                class="w-full text-left text-xs text-sky-100 hover:text-sky-50"
                @click="openStatEditor(selectedPairAttackerSide, scenario.selectedPair.attackerSlot)"
              >
                {{ t('damageCalc.editIvEvFor', { side: sideName(selectedPairAttackerSide), pokemon: selectedPairAttackerName }) }}
              </button>
              <div class="mt-1 flex flex-wrap gap-1">
                <span
                  v-if="hasAlteredStatus(selectedPairAttackerSlotSet?.status)"
                  :title="t(`damageCalc.status.${selectedPairAttackerSlotSet?.status}`)"
                  class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="statusBadgeClass(selectedPairAttackerSlotSet?.status)"
                >
                  {{ statusBadgeLabel(selectedPairAttackerSlotSet?.status) }}
                </span>
                <span
                  v-for="tag in stageTags(selectedPairAttackerSlotSet)"
                  :key="`attacker-stage-tag-${tag}`"
                  class="rounded border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-100"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="rounded border border-rose-500/45 bg-rose-500/10 p-2">
              <button
                type="button"
                class="w-full text-left text-xs text-rose-100 hover:text-rose-50"
                @click="openStatEditor(selectedPairDefenderSide, scenario.selectedPair.defenderSlot)"
              >
                {{ t('damageCalc.editIvEvFor', { side: sideName(selectedPairDefenderSide), pokemon: selectedPairDefenderName }) }}
              </button>
              <div class="mt-1 flex flex-wrap gap-1">
                <span
                  v-if="hasAlteredStatus(selectedPairDefenderSlotSet?.status)"
                  :title="t(`damageCalc.status.${selectedPairDefenderSlotSet?.status}`)"
                  class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="statusBadgeClass(selectedPairDefenderSlotSet?.status)"
                >
                  {{ statusBadgeLabel(selectedPairDefenderSlotSet?.status) }}
                </span>
                <span
                  v-for="tag in stageTags(selectedPairDefenderSlotSet)"
                  :key="`defender-stage-tag-${tag}`"
                  class="rounded border border-rose-400/40 bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-100"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <div v-if="activeStep === 'teams'" class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-xl border border-sky-500/25 bg-off-black/70 p-3">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-sky-200">{{ sideName('A') }}</h2>
          <span class="text-xs text-gray-400">
            {{ t('damageCalc.activeCount', { count: scenario.sideA.activeSlotIds.length, max: maxActiveSlots }) }}
          </span>
        </div>

        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">{{ t('damageCalc.combatLineTitle') }}</h3>
        <div class="mb-3 overflow-x-auto pb-1">
          <div class="flex min-w-max gap-2">
            <div
              v-for="slotSet in lineupSlots('A')"
              :key="`sideA-lineup-${slotSet.slot}`"
              class="w-[190px] rounded-lg border border-gray-700 bg-st-black/60 p-2"
            >
              <div class="flex items-center gap-2">
                <img
                  :src="spriteUrl(slotSet.pokemonId)"
                  :alt="pokemonNameById(slotSet.pokemonId)"
                  :data-sprite-id="slotSet.pokemonId"
                  :data-sprite-fallback-index="0"
                  class="h-9 w-9 rounded bg-black/20 object-contain"
                  loading="lazy"
                  @error="onSpriteError"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="truncate text-xs font-semibold text-gray-100">{{ pokemonNameById(slotSet.pokemonId) }}</p>
                    <span
                      v-if="hasAlteredStatus(slotSet.status)"
                      :title="t(`damageCalc.status.${slotSet.status}`)"
                      class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="statusBadgeClass(slotSet.status)"
                    >
                      {{ statusBadgeLabel(slotSet.status) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="mt-2 space-y-2">
                <p class="text-[11px] text-gray-300">{{ activeRoleLabel('A', slotSet.slot) }}</p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isVgc && reserveSlots('A').length > 0" class="mb-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">{{ t('damageCalc.reserveLineTitle') }}</h4>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="reserve in reserveSlots('A')"
              :key="`sideA-reserve-chip-${reserve.slot}`"
              type="button"
              class="flex items-center gap-2 rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-left text-xs text-violet-100 hover:border-violet-400"
              @click="promptSwapWithReserve('A', reserve.slot)"
            >
              <img
                :src="spriteUrl(reserve.pokemonId)"
                :alt="pokemonNameById(reserve.pokemonId)"
                :data-sprite-id="reserve.pokemonId"
                :data-sprite-fallback-index="0"
                class="h-6 w-6 rounded bg-black/20 object-contain"
                loading="lazy"
                @error="onSpriteError"
              />
              <span class="truncate">{{ pokemonNameById(reserve.pokemonId) }}</span>
              <span
                v-if="hasAlteredStatus(reserve.status)"
                :title="t(`damageCalc.status.${reserve.status}`)"
                class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="statusBadgeClass(reserve.status)"
              >
                {{ statusBadgeLabel(reserve.status) }}
              </span>
            </button>
          </div>
        </div>

        <div class="grid gap-2">
          <div
            v-for="slotSet in lineupSlots('A')"
            :key="`sideA-slot-${slotSet.slot}`"
            class="rounded-lg border bg-off-black/60 p-2 transition"
            :class="
              isSlotTouched('A', slotSet.slot)
                ? 'border-emerald-400/80 ring-1 ring-emerald-400/70'
                : 'border-gray-700'
            "
          >
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <img
                  :src="spriteUrl(slotSet.pokemonId)"
                  :alt="pokemonNameById(slotSet.pokemonId)"
                  :data-sprite-id="slotSet.pokemonId"
                  :data-sprite-fallback-index="0"
                  class="h-8 w-8 rounded bg-black/20 object-contain"
                  loading="lazy"
                  @error="onSpriteError"
                />
                <div>
                  <div class="flex items-center gap-1.5">
                    <p class="text-xs font-semibold text-gray-100">{{ pokemonNameById(slotSet.pokemonId) }}</p>
                    <span
                      v-if="hasAlteredStatus(slotSet.status)"
                      :title="t(`damageCalc.status.${slotSet.status}`)"
                      class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="statusBadgeClass(slotSet.status)"
                    >
                      {{ statusBadgeLabel(slotSet.status) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label v-if="!isVgc" class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="scenario.sideA.activeSlotIds.includes(slotSet.slot)"
                    @change="setSlotRole('A', slotSet.slot, ($event.target as HTMLInputElement).checked ? (isVgc ? 'back' : 'active') : 'reserve')"
                  />
                  {{ t('damageCalc.active') }}
                </label>
                <button
                  type="button"
                  class="rounded border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200"
                  @click="openStatEditor('A', slotSet.slot)"
                >
                  {{ t('damageCalc.editIvEvShort') }}
                </button>
                <span
                  v-if="slotHasIllegalEvTotal('A', slotSet.slot)"
                  class="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
                >
                  {{ t('damageCalc.evsWarningShort') }}
                </span>
              </div>
            </div>

            <div class="grid gap-2 lg:grid-cols-2">
              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.pokemon') }}</span>
                <SearchableSelect
                  :model-value="slotSet.pokemonId"
                  :options="pokemonOptions"
                  :placeholder="t('damageCalc.selectPokemon')"
                  @update:model-value="onPokemonChange('A', slotSet.slot, $event)"
                />
              </label>

              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.defaultTarget') }}</span>
                <SearchableSelect
                  :model-value="String(scenario.sideA.targetByAttacker[String(slotSet.slot)] ?? 1)"
                  :options="targetOptions('A')"
                  :clearable="false"
                  @update:model-value="updateTarget('A', slotSet.slot, Number($event) as DamageSlotNumber)"
                />
                <span class="mt-1 block text-[10px] text-gray-500">{{ t('damageCalc.defaultTargetHelp') }}</span>
              </label>

              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.ability') }}</span>
                <SearchableSelect
                  :model-value="slotSet.abilityId"
                  :options="abilityOptionsForPokemon(slotSet.pokemonId)"
                  :placeholder="t('damageCalc.ability')"
                  @update:model-value="patchSlot('A', slotSet.slot, { abilityId: $event })"
                />
              </label>

              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.item') }}</span>
                <SearchableSelect
                  :model-value="slotSet.itemId"
                  :options="itemOptions"
                  :placeholder="t('damageCalc.item')"
                  @update:model-value="patchSlot('A', slotSet.slot, { itemId: $event })"
                />
              </label>

              <label v-if="editorMode === 'advanced'" class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.nature') }}</span>
                <SearchableSelect
                  :model-value="slotSet.natureId"
                  :options="natureOptions"
                  :clearable="false"
                  @update:model-value="patchSlot('A', slotSet.slot, { natureId: $event })"
                />
              </label>

              <label v-if="editorMode === 'advanced'" class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.teraActivate') }}</span>
                <div class="flex items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <SearchableSelect
                      :model-value="slotSet.teraType ?? ''"
                      :options="teraOptions"
                      :placeholder="t('damageCalc.tera')"
                      @update:model-value="patchSlot('A', slotSet.slot, { teraType: ($event || undefined) as PokemonTypeKey | undefined })"
                    />
                  </div>
                  <label class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                    <input
                      class="accent-sky-400"
                      type="checkbox"
                      :checked="slotSet.isTeraActive"
                      @change="patchSlot('A', slotSet.slot, { isTeraActive: ($event.target as HTMLInputElement).checked })"
                    />
                    {{ t('damageCalc.tera') }}
                  </label>
                </div>
              </label>
            </div>

            <div class="mt-2 space-y-2">
              <label
                v-for="(moveId, moveIndex) in slotSet.moves"
                :key="`A-slot-${slotSet.slot}-move-${moveIndex}`"
                class="text-xs"
              >
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.moveLabel', { index: moveIndex + 1 }) }}</span>
                <SearchableSelect
                  :model-value="moveId"
                  :options="moveOptionsForPokemon(slotSet.pokemonId)"
                  :placeholder="t('damageCalc.movePlaceholder')"
                  @update:model-value="updateMove('A', slotSet.slot, moveIndex, $event)"
                >
                  <template #option="{ option }">
                    <div class="-mx-2 -my-1.5 rounded-md px-2 py-1.5" :style="moveOptionSurfaceStyle(option.meta?.type)">
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
                            <template v-if="(option.meta?.priority ?? 0) !== 0">
                              <span class="px-1">|</span>
                              <span>{{ t('builder.movePriorityShort') }} {{ movePriorityValueLabel(option.meta?.priority) }}</span>
                            </template>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </SearchableSelect>
              </label>
            </div>

            <div class="mt-2 grid gap-2 md:grid-cols-2">
              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.currentHpPercent') }}</span>
                <input
                  class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                  type="number"
                  min="1"
                  max="100"
                  :value="slotSet.currentHpPercent"
                  @change="patchSlot('A', slotSet.slot, { currentHpPercent: inputNumber(($event.target as HTMLInputElement).value) })"
                />
              </label>
              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.statusLabel') }}</span>
                <SearchableSelect
                  :model-value="slotSet.status"
                  :options="statusOptions"
                  :clearable="false"
                  @update:model-value="patchSlot('A', slotSet.slot, { status: $event as DamageStatus })"
                />
              </label>
            </div>

            <div v-if="editorMode === 'advanced'" class="mt-2 rounded border border-gray-700 bg-st-black/50 p-2">
              <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('damageCalc.statsStages') }}</p>
              <p class="mb-2 text-[11px] text-gray-400">{{ t('damageCalc.statsStagesHelp') }}</p>
              <div class="mt-2 grid gap-2 md:grid-cols-5">
                <label v-for="key in stageKeys" :key="`A-stage-${slotSet.slot}-${key}`" class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ stageLabel(key) }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="-6"
                    max="6"
                    :value="slotSet.stages[key]"
                    @change="updateStage('A', slotSet.slot, key, ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </div>
            </div>

            <div v-if="editorMode === 'advanced'" class="mt-2 rounded border border-gray-700 bg-st-black/50 p-2">
              <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('damageCalc.combat.title') }}</p>
              <p class="mb-2 text-[11px] text-gray-400">{{ t('damageCalc.combat.help') }}</p>

              <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.wasHitThisTurn"
                    @change="updateCombatFlag('A', slotSet.slot, 'wasHitThisTurn', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.wasHitThisTurn') }}
                </label>
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.tookDamageThisTurn"
                    @change="updateCombatFlag('A', slotSet.slot, 'tookDamageThisTurn', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.tookDamageThisTurn') }}
                </label>
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.statsLoweredThisTurn"
                    @change="updateCombatFlag('A', slotSet.slot, 'statsLoweredThisTurn', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.statsLoweredThisTurn') }}
                </label>
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.previousMoveFailed"
                    @change="updateCombatFlag('A', slotSet.slot, 'previousMoveFailed', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.previousMoveFailed') }}
                </label>
              </div>

              <div class="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.moveOrderHint') }}</span>
                  <SearchableSelect
                    :model-value="slotSet.combatContext.moveOrderHint"
                    :options="moveOrderOptions"
                    :clearable="false"
                    @update:model-value="updateMoveOrderHint('A', slotSet.slot, $event)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.consecutiveMoveUses') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="5"
                    :value="slotSet.combatContext.consecutiveMoveUses"
                    @change="updateCombatNumber('A', slotSet.slot, 'consecutiveMoveUses', ($event.target as HTMLInputElement).value, 5)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.timesHitThisBattle') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="6"
                    :value="slotSet.combatContext.timesHitThisBattle"
                    @change="updateCombatNumber('A', slotSet.slot, 'timesHitThisBattle', ($event.target as HTMLInputElement).value, 6)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.alliesFaintedCount') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="5"
                    :value="slotSet.combatContext.alliesFaintedCount"
                    @change="updateCombatNumber('A', slotSet.slot, 'alliesFaintedCount', ($event.target as HTMLInputElement).value, 5)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.stockpileCount') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="3"
                    :value="slotSet.combatContext.stockpileCount"
                    @change="updateCombatNumber('A', slotSet.slot, 'stockpileCount', ($event.target as HTMLInputElement).value, 3)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.friendship') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="255"
                    :value="slotSet.combatContext.friendship"
                    @change="updateCombatNumber('A', slotSet.slot, 'friendship', ($event.target as HTMLInputElement).value, 255)"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="rounded-xl border border-rose-500/25 bg-off-black/70 p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-rose-200">{{ sideName('B') }}</h2>
          <span class="text-xs text-gray-400">
            {{ t('damageCalc.activeCount', { count: scenario.sideB.activeSlotIds.length, max: maxActiveSlots }) }}
          </span>
        </div>

        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">{{ t('damageCalc.combatLineTitle') }}</h3>
        <div class="mb-3 overflow-x-auto pb-1">
          <div class="flex min-w-max gap-2">
            <div
              v-for="slotSet in lineupSlots('B')"
              :key="`sideB-lineup-${slotSet.slot}`"
              class="w-[190px] rounded-lg border border-gray-700 bg-st-black/60 p-2"
            >
              <div class="flex items-center gap-2">
                <img
                  :src="spriteUrl(slotSet.pokemonId)"
                  :alt="pokemonNameById(slotSet.pokemonId)"
                  :data-sprite-id="slotSet.pokemonId"
                  :data-sprite-fallback-index="0"
                  class="h-9 w-9 rounded bg-black/20 object-contain"
                  loading="lazy"
                  @error="onSpriteError"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="truncate text-xs font-semibold text-gray-100">{{ pokemonNameById(slotSet.pokemonId) }}</p>
                    <span
                      v-if="hasAlteredStatus(slotSet.status)"
                      :title="t(`damageCalc.status.${slotSet.status}`)"
                      class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="statusBadgeClass(slotSet.status)"
                    >
                      {{ statusBadgeLabel(slotSet.status) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="mt-2 space-y-2">
                <p class="text-[11px] text-gray-300">{{ activeRoleLabel('B', slotSet.slot) }}</p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isVgc && reserveSlots('B').length > 0" class="mb-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">{{ t('damageCalc.reserveLineTitle') }}</h4>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="reserve in reserveSlots('B')"
              :key="`sideB-reserve-chip-${reserve.slot}`"
              type="button"
              class="flex items-center gap-2 rounded border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-left text-xs text-violet-100 hover:border-violet-400"
              @click="promptSwapWithReserve('B', reserve.slot)"
            >
              <img
                :src="spriteUrl(reserve.pokemonId)"
                :alt="pokemonNameById(reserve.pokemonId)"
                :data-sprite-id="reserve.pokemonId"
                :data-sprite-fallback-index="0"
                class="h-6 w-6 rounded bg-black/20 object-contain"
                loading="lazy"
                @error="onSpriteError"
              />
              <span class="truncate">{{ pokemonNameById(reserve.pokemonId) }}</span>
              <span
                v-if="hasAlteredStatus(reserve.status)"
                :title="t(`damageCalc.status.${reserve.status}`)"
                class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                :class="statusBadgeClass(reserve.status)"
              >
                {{ statusBadgeLabel(reserve.status) }}
              </span>
            </button>
          </div>
        </div>

        <div class="grid gap-2">
          <div
            v-for="slotSet in lineupSlots('B')"
            :key="`sideB-slot-${slotSet.slot}`"
            class="rounded-lg border bg-off-black/60 p-2 transition"
            :class="
              isSlotTouched('B', slotSet.slot)
                ? 'border-emerald-400/80 ring-1 ring-emerald-400/70'
                : 'border-gray-700'
            "
          >
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <img
                  :src="spriteUrl(slotSet.pokemonId)"
                  :alt="pokemonNameById(slotSet.pokemonId)"
                  :data-sprite-id="slotSet.pokemonId"
                  :data-sprite-fallback-index="0"
                  class="h-8 w-8 rounded bg-black/20 object-contain"
                  loading="lazy"
                  @error="onSpriteError"
                />
                <div>
                  <div class="flex items-center gap-1.5">
                    <p class="text-xs font-semibold text-gray-100">{{ pokemonNameById(slotSet.pokemonId) }}</p>
                    <span
                      v-if="hasAlteredStatus(slotSet.status)"
                      :title="t(`damageCalc.status.${slotSet.status}`)"
                      class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="statusBadgeClass(slotSet.status)"
                    >
                      {{ statusBadgeLabel(slotSet.status) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label v-if="!isVgc" class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="scenario.sideB.activeSlotIds.includes(slotSet.slot)"
                    @change="setSlotRole('B', slotSet.slot, ($event.target as HTMLInputElement).checked ? (isVgc ? 'back' : 'active') : 'reserve')"
                  />
                  {{ t('damageCalc.active') }}
                </label>
                <button
                  type="button"
                  class="rounded border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200"
                  @click="openStatEditor('B', slotSet.slot)"
                >
                  {{ t('damageCalc.editIvEvShort') }}
                </button>
                <span
                  v-if="slotHasIllegalEvTotal('B', slotSet.slot)"
                  class="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
                >
                  {{ t('damageCalc.evsWarningShort') }}
                </span>
              </div>
            </div>

            <div class="grid gap-2 lg:grid-cols-2">
              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.pokemon') }}</span>
                <SearchableSelect
                  :model-value="slotSet.pokemonId"
                  :options="pokemonOptions"
                  :placeholder="t('damageCalc.selectPokemon')"
                  @update:model-value="onPokemonChange('B', slotSet.slot, $event)"
                />
              </label>

              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.defaultTarget') }}</span>
                <SearchableSelect
                  :model-value="String(scenario.sideB.targetByAttacker[String(slotSet.slot)] ?? 1)"
                  :options="targetOptions('B')"
                  :clearable="false"
                  @update:model-value="updateTarget('B', slotSet.slot, Number($event) as DamageSlotNumber)"
                />
                <span class="mt-1 block text-[10px] text-gray-500">{{ t('damageCalc.defaultTargetHelp') }}</span>
              </label>

              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.ability') }}</span>
                <SearchableSelect
                  :model-value="slotSet.abilityId"
                  :options="abilityOptionsForPokemon(slotSet.pokemonId)"
                  :placeholder="t('damageCalc.ability')"
                  @update:model-value="patchSlot('B', slotSet.slot, { abilityId: $event })"
                />
              </label>

              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.item') }}</span>
                <SearchableSelect
                  :model-value="slotSet.itemId"
                  :options="itemOptions"
                  :placeholder="t('damageCalc.item')"
                  @update:model-value="patchSlot('B', slotSet.slot, { itemId: $event })"
                />
              </label>

              <label v-if="editorMode === 'advanced'" class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.nature') }}</span>
                <SearchableSelect
                  :model-value="slotSet.natureId"
                  :options="natureOptions"
                  :clearable="false"
                  @update:model-value="patchSlot('B', slotSet.slot, { natureId: $event })"
                />
              </label>

              <label v-if="editorMode === 'advanced'" class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.teraActivate') }}</span>
                <div class="flex items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <SearchableSelect
                      :model-value="slotSet.teraType ?? ''"
                      :options="teraOptions"
                      :placeholder="t('damageCalc.tera')"
                      @update:model-value="patchSlot('B', slotSet.slot, { teraType: ($event || undefined) as PokemonTypeKey | undefined })"
                    />
                  </div>
                  <label class="inline-flex items-center gap-1 text-[11px] text-gray-300">
                    <input
                      class="accent-sky-400"
                      type="checkbox"
                      :checked="slotSet.isTeraActive"
                      @change="patchSlot('B', slotSet.slot, { isTeraActive: ($event.target as HTMLInputElement).checked })"
                    />
                    {{ t('damageCalc.tera') }}
                  </label>
                </div>
              </label>
            </div>

            <div class="mt-2 space-y-2">
              <label
                v-for="(moveId, moveIndex) in slotSet.moves"
                :key="`B-slot-${slotSet.slot}-move-${moveIndex}`"
                class="text-xs"
              >
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.moveLabel', { index: moveIndex + 1 }) }}</span>
                <SearchableSelect
                  :model-value="moveId"
                  :options="moveOptionsForPokemon(slotSet.pokemonId)"
                  :placeholder="t('damageCalc.movePlaceholder')"
                  @update:model-value="updateMove('B', slotSet.slot, moveIndex, $event)"
                >
                  <template #option="{ option }">
                    <div class="-mx-2 -my-1.5 rounded-md px-2 py-1.5" :style="moveOptionSurfaceStyle(option.meta?.type)">
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
                            <template v-if="(option.meta?.priority ?? 0) !== 0">
                              <span class="px-1">|</span>
                              <span>{{ t('builder.movePriorityShort') }} {{ movePriorityValueLabel(option.meta?.priority) }}</span>
                            </template>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </SearchableSelect>
              </label>
            </div>

            <div class="mt-2 grid gap-2 md:grid-cols-2">
              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.currentHpPercent') }}</span>
                <input
                  class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                  type="number"
                  min="1"
                  max="100"
                  :value="slotSet.currentHpPercent"
                  @change="patchSlot('B', slotSet.slot, { currentHpPercent: inputNumber(($event.target as HTMLInputElement).value) })"
                />
              </label>
              <label class="text-xs">
                <span class="mb-1 block text-gray-300">{{ t('damageCalc.statusLabel') }}</span>
                <SearchableSelect
                  :model-value="slotSet.status"
                  :options="statusOptions"
                  :clearable="false"
                  @update:model-value="patchSlot('B', slotSet.slot, { status: $event as DamageStatus })"
                />
              </label>
            </div>

            <div v-if="editorMode === 'advanced'" class="mt-2 rounded border border-gray-700 bg-st-black/50 p-2">
              <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('damageCalc.statsStages') }}</p>
              <p class="mb-2 text-[11px] text-gray-400">{{ t('damageCalc.statsStagesHelp') }}</p>
              <div class="mt-2 grid gap-2 md:grid-cols-5">
                <label v-for="key in stageKeys" :key="`B-stage-${slotSet.slot}-${key}`" class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ stageLabel(key) }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="-6"
                    max="6"
                    :value="slotSet.stages[key]"
                    @change="updateStage('B', slotSet.slot, key, ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </div>
            </div>

            <div v-if="editorMode === 'advanced'" class="mt-2 rounded border border-gray-700 bg-st-black/50 p-2">
              <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('damageCalc.combat.title') }}</p>
              <p class="mb-2 text-[11px] text-gray-400">{{ t('damageCalc.combat.help') }}</p>

              <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.wasHitThisTurn"
                    @change="updateCombatFlag('B', slotSet.slot, 'wasHitThisTurn', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.wasHitThisTurn') }}
                </label>
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.tookDamageThisTurn"
                    @change="updateCombatFlag('B', slotSet.slot, 'tookDamageThisTurn', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.tookDamageThisTurn') }}
                </label>
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.statsLoweredThisTurn"
                    @change="updateCombatFlag('B', slotSet.slot, 'statsLoweredThisTurn', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.statsLoweredThisTurn') }}
                </label>
                <label class="inline-flex items-center gap-2 rounded border border-gray-700 bg-off-black/50 px-2 py-1.5 text-[11px] text-gray-200">
                  <input
                    class="accent-sky-400"
                    type="checkbox"
                    :checked="slotSet.combatContext.previousMoveFailed"
                    @change="updateCombatFlag('B', slotSet.slot, 'previousMoveFailed', ($event.target as HTMLInputElement).checked)"
                  />
                  {{ t('damageCalc.combat.previousMoveFailed') }}
                </label>
              </div>

              <div class="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.moveOrderHint') }}</span>
                  <SearchableSelect
                    :model-value="slotSet.combatContext.moveOrderHint"
                    :options="moveOrderOptions"
                    :clearable="false"
                    @update:model-value="updateMoveOrderHint('B', slotSet.slot, $event)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.consecutiveMoveUses') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="5"
                    :value="slotSet.combatContext.consecutiveMoveUses"
                    @change="updateCombatNumber('B', slotSet.slot, 'consecutiveMoveUses', ($event.target as HTMLInputElement).value, 5)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.timesHitThisBattle') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="6"
                    :value="slotSet.combatContext.timesHitThisBattle"
                    @change="updateCombatNumber('B', slotSet.slot, 'timesHitThisBattle', ($event.target as HTMLInputElement).value, 6)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.alliesFaintedCount') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="5"
                    :value="slotSet.combatContext.alliesFaintedCount"
                    @change="updateCombatNumber('B', slotSet.slot, 'alliesFaintedCount', ($event.target as HTMLInputElement).value, 5)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.stockpileCount') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="3"
                    :value="slotSet.combatContext.stockpileCount"
                    @change="updateCombatNumber('B', slotSet.slot, 'stockpileCount', ($event.target as HTMLInputElement).value, 3)"
                  />
                </label>
                <label class="text-xs">
                  <span class="mb-1 block text-gray-300">{{ t('damageCalc.combat.friendship') }}</span>
                  <input
                    class="w-full rounded border border-gray-700 bg-off-black/70 px-2 py-1 text-xs text-gray-100"
                    type="number"
                    min="0"
                    max="255"
                    :value="slotSet.combatContext.friendship"
                    @change="updateCombatNumber('B', slotSet.slot, 'friendship', ($event.target as HTMLInputElement).value, 255)"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="swapModal.open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
      @click.self="closeSwapModal"
    >
      <article class="w-full max-w-md rounded-xl border border-violet-500/40 bg-off-black/95 p-4">
        <h3 class="text-sm font-semibold text-violet-100">{{ t('damageCalc.swapReserve') }}</h3>
        <p class="mt-1 text-xs text-gray-300">
          {{
            t('damageCalc.swapReservePrompt', {
              pokemon: swapReservePokemonName(),
            })
          }}
        </p>

        <div class="mt-3 grid gap-2">
          <button
            v-for="activeSlot in lineupSlots(swapModal.side)"
            :key="`swap-active-${swapModal.side}-${activeSlot.slot}`"
            type="button"
            class="flex items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition"
            :class="
              swapModal.selectedActiveSlot === activeSlot.slot
                ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                : 'border-gray-700 bg-st-black/50 text-gray-200 hover:border-violet-400/60'
            "
            @click="swapModal.selectedActiveSlot = activeSlot.slot"
          >
            <img
              :src="spriteUrl(activeSlot.pokemonId)"
              :alt="pokemonNameById(activeSlot.pokemonId)"
              :data-sprite-id="activeSlot.pokemonId"
              :data-sprite-fallback-index="0"
              class="h-7 w-7 rounded bg-black/20 object-contain"
              loading="lazy"
              @error="onSpriteError"
            />
            <span class="truncate">{{ pokemonNameById(activeSlot.pokemonId) }}</span>
          </button>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-700 bg-st-black/60 px-3 py-1.5 text-xs text-gray-200"
            @click="closeSwapModal"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-violet-400 bg-violet-500/20 px-3 py-1.5 text-xs text-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!swapModal.selectedActiveSlot"
            @click="confirmReserveSwap"
          >
            {{ t('damageCalc.confirmSwap') }}
          </button>
        </div>
      </article>
    </div>

    <div
      v-if="statEditorModal.open && statEditorSlotSet"
      class="fixed inset-0 z-40 p-4 pointer-events-none"
    >
      <article
        class="pointer-events-auto absolute overflow-auto rounded-xl border border-sky-500/40 bg-off-black/95 p-4 shadow-2xl shadow-black/50"
        :style="statEditorModalStyle"
      >
        <div
          class="flex cursor-move items-start justify-between gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 select-none"
          @mousedown.stop.prevent="startStatEditorDrag"
        >
          <div>
            <h3 class="text-sm font-semibold text-sky-100">{{ t('damageCalc.statsModalTitle') }}</h3>
            <p class="mt-1 text-xs text-gray-300">
              {{ t('damageCalc.editIvEvFor', { side: sideName(statEditorModal.side), pokemon: statEditorPokemonName }) }}
            </p>
            <p class="mt-1 text-[11px] text-gray-400">{{ t('damageCalc.evsTotalLabel', { value: statEditorEvTotal }) }}</p>
            <p v-if="statEditorHasIllegalEvs" class="mt-1 text-[11px] text-amber-300">
              {{ t('damageCalc.evsWarningLong') }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-md border border-gray-700 bg-st-black/60 px-2 py-1 text-xs text-gray-200"
            @mousedown.stop
            @click="cancelStatEditor"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-sky-500/45 bg-sky-500/15 px-2 py-1 text-xs font-semibold text-sky-100"
            @mousedown.stop
            @click="saveStatEditor"
          >
            {{ t('common.save') }}
          </button>
        </div>

        <div class="mt-3 grid gap-3 xl:grid-cols-4">
          <div class="rounded-lg border border-gray-700 bg-st-black/50 p-3">
            <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('builder.evs') }}</p>
            <div class="space-y-2">
              <label
                v-for="key in statKeys"
                :key="`modal-ev-${statEditorModal.side}-${statEditorModal.slot}-${key}`"
                class="block text-xs"
              >
                <div class="mb-1 flex items-center justify-between text-gray-300">
                  <span>{{ statLabel(key) }}</span>
                  <span>{{ statEditorDraft?.evs[key] ?? statEditorSlotSet.evs[key] }}</span>
                </div>
                <input
                  class="w-full accent-sky-400"
                  type="range"
                  min="0"
                  max="252"
                  step="4"
                  :value="statEditorDraft?.evs[key] ?? statEditorSlotSet.evs[key]"
                  @input="updateStatEditorEv(key, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </div>

          <div class="rounded-lg border border-gray-700 bg-st-black/50 p-3">
            <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('builder.ivs') }}</p>
            <div class="space-y-2">
              <label
                v-for="key in statKeys"
                :key="`modal-iv-${statEditorModal.side}-${statEditorModal.slot}-${key}`"
                class="block text-xs"
              >
                <div class="mb-1 flex items-center justify-between text-gray-300">
                  <span>{{ statLabel(key) }}</span>
                  <span>{{ statEditorDraft?.ivs[key] ?? statEditorSlotSet.ivs[key] }}</span>
                </div>
                <input
                  class="w-full accent-cyan-400"
                  type="range"
                  min="0"
                  max="31"
                  step="1"
                  :value="statEditorDraft?.ivs[key] ?? statEditorSlotSet.ivs[key]"
                  @input="updateStatEditorIv(key, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </div>

          <div class="rounded-lg border border-gray-700 bg-st-black/50 p-3">
            <p class="mb-2 text-xs font-semibold text-gray-200">{{ t('damageCalc.statsStages') }}</p>
            <div class="space-y-2">
              <label
                v-for="key in stageKeys"
                :key="`modal-stage-${statEditorModal.side}-${statEditorModal.slot}-${key}`"
                class="block text-xs"
              >
                <div class="mb-1 flex items-center justify-between text-gray-300">
                  <span>{{ stageLabel(key) }}</span>
                  <span>{{
                    (statEditorDraft?.stages[key] ?? statEditorSlotSet.stages[key]) > 0
                      ? `+${statEditorDraft?.stages[key] ?? statEditorSlotSet.stages[key]}`
                      : (statEditorDraft?.stages[key] ?? statEditorSlotSet.stages[key])
                  }}</span>
                </div>
                <input
                  class="w-full accent-violet-400"
                  type="range"
                  min="-6"
                  max="6"
                  step="1"
                  :value="statEditorDraft?.stages[key] ?? statEditorSlotSet.stages[key]"
                  @input="updateStatEditorStage(key, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </div>

          <div class="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-xs font-semibold text-sky-100">{{ t('builder.finalStats') }}</p>
                <p class="mt-1 text-[11px] text-gray-400">
                  {{ t('builder.calcLevel') }} {{ statEditorSlotSet.level }}
                </p>
              </div>
              <div class="text-right text-[11px] text-gray-300">
                <p class="font-medium text-sky-100">{{ natureLabel(statEditorNatureId) }}</p>
                <p>{{ natureEffectLabel(statEditorNatureId) }}</p>
              </div>
            </div>

            <div v-if="statEditorPokemon" class="mt-3 space-y-1.5">
              <div
                v-for="stat in statKeys"
                :key="`modal-stats-preview-${stat}`"
                class="rounded-md border border-gray-700 bg-off-black/45 px-2 py-1.5 text-xs"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="inline-flex items-center gap-1 uppercase text-gray-200">
                    <span>{{ stat }}</span>
                    <span class="text-[10px] font-semibold" :class="natureIndicatorClass(statEditorNatureId, stat)">
                      {{ natureIndicator(statEditorNatureId, stat) }}
                    </span>
                  </span>
                  <span class="font-semibold text-gray-100">{{ statEditorCalculatedStats[stat] }}</span>
                </div>
                <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span>{{ t('builder.baseStats') }} {{ statEditorPokemon.baseStats[stat] }}</span>
                  <span :class="statDeltaClass(statEditorCalculatedStats[stat] - statEditorBaselineStats[stat])">
                    {{ signed(statEditorCalculatedStats[stat] - statEditorBaselineStats[stat]) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-else class="mt-3 rounded-md border border-gray-700 bg-off-black/45 px-2 py-2 text-xs text-gray-500">
              {{ t('builder.slotEmptyHint') }}
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
button,
input[type='checkbox'],
input[type='radio'],
input[type='range'],
select {
  cursor: pointer;
}

.move-option-effect {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
