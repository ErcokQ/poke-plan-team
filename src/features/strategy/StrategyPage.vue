<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode, LocaleCode, PokemonTypeKey, StrategyThreatSeenTag } from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { useDamageCalcStore } from '@/stores/damage-calc'
import { useDexStore } from '@/stores/dex'
import { useStrategyStore } from '@/stores/strategy'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'
import { moveTypeGradientStyle } from '@/utils/move-type-style'
import { onPokemonSpriteError, primaryPokemonSpriteUrl } from '@/utils/pokemon-sprite'
import { typeBadgeStyle } from '@/utils/type-badge-style'

interface TagFilterOption {
  value: 'all' | StrategyThreatSeenTag
  label: string
}

interface ThreatRadarEntry {
  pokemonId: string
  name: string
  timesSeen: number
  lastSeenAt: string
  tags: StrategyThreatSeenTag[]
  abilityLine: string
  baseSpeed: number | null
  types: PokemonTypeKey[]
  weaknesses: Array<{ type: PokemonTypeKey; multiplier: number }>
}

type ObservedChipTone = 'sky' | 'amber' | 'emerald' | 'fuchsia' | 'violet'

interface ObservedChip {
  key: string
  label: string
  group: string
  tone: ObservedChipTone
  remove: () => void
}

interface StrategyTeamMoveSummary {
  id: string
  name: string
  type: PokemonTypeKey | null
  category: 'physical' | 'special' | 'status' | null
  power: number | null
  accuracy: number | null
  pp: number | null
  priority: number
}

interface StrategyTeamSnapshotEntry {
  slot: number
  pokemonId: string
  name: string
  baseSpeed: number | null
  types: PokemonTypeKey[]
  moves: StrategyTeamMoveSummary[]
}

type DamageTargetAction = 'load' | 'open'
type ObservationSource = 'moves' | 'items' | 'abilities' | 'tera' | 'partners'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const dexStore = useDexStore()
const strategyStore = useStrategyStore()
const teamStore = useTeamStore()
const damageCalcStore = useDamageCalcStore()
const uiStore = useUiStore()

const TAGS: StrategyThreatSeenTag[] = ['common', 'danger', 'prep', 'solved']

const tagFilter = ref<'all' | StrategyThreatSeenTag>('all')
const searchQuery = ref('')
const quickActionMessage = ref('')

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const currentLocale = computed<LocaleCode>(() => (locale.value === 'en' ? 'en' : 'es'))
const activeTeam = computed(() => teamStore.getActiveTeam(mode.value))
const draft = computed(() => strategyStore.ensureDraft(mode.value))
const activeObservationSource = computed<ObservationSource>({
  get: () => uiStore.getStrategyObservationSource(mode.value),
  set: (value) => uiStore.setStrategyObservationSource(mode.value, value),
})
const selectedThreat = computed(() => {
  const selectedId = draft.value.selectedThreatPokemonId
  if (!selectedId) return null
  return draft.value.threatNotes.find((entry) => entry.pokemonId === selectedId) ?? null
})
const selectedThreatPokemon = computed(() =>
  selectedThreat.value ? dexStore.getPokemon(mode.value, selectedThreat.value.pokemonId) : undefined,
)

const tagFilterOptions = computed<TagFilterOption[]>(() => [
  { value: 'all', label: t('strategy.filterAll') },
  { value: 'danger', label: t('strategy.tagDanger') },
  { value: 'prep', label: t('strategy.tagPrep') },
  { value: 'solved', label: t('strategy.tagSolved') },
])

const threatEntries = computed<ThreatRadarEntry[]>(() =>
  draft.value.threatNotes.map((entry) => {
    const pokemon = dexStore.getPokemon(mode.value, entry.pokemonId)
    return {
      pokemonId: entry.pokemonId,
      name: pokemon?.name ?? entry.pokemonId,
      timesSeen: entry.timesSeen,
      lastSeenAt: entry.lastSeenAt,
      tags: entry.tags,
      abilityLine: abilityLineFor(entry.pokemonId, entry.commonAbilities),
      baseSpeed: pokemon?.baseStats.spe ?? null,
      types: pokemon?.types ?? [],
      weaknesses: weaknessEntriesFor(pokemon?.types ?? []),
    }
  }),
)

const filteredThreats = computed<ThreatRadarEntry[]>(() => {
  const query = normalize(searchQuery.value)
  return threatEntries.value.filter((entry) => {
    const matchesQuery =
      !query ||
      normalize(entry.name).includes(query) ||
      entry.pokemonId.includes(query)
    const matchesTag = tagFilter.value === 'all' || entry.tags.includes(tagFilter.value)
    return matchesQuery && matchesTag
  })
})

const pokemonById = computed(() => new Map(dexStore.getPokemonByMode(mode.value).map((pokemon) => [pokemon.id, pokemon])))
const currentTeamEntries = computed<StrategyTeamSnapshotEntry[]>(() =>
  activeTeam.value.members
    .filter((member) => member.pokemonId)
    .map((member) => {
      const pokemon = pokemonById.value.get(member.pokemonId)
      return {
        slot: member.slot,
        pokemonId: member.pokemonId,
        name: pokemon?.name ?? member.pokemonId,
        baseSpeed: pokemon?.baseStats.spe ?? null,
        types: pokemon?.types ?? [],
        moves: member.moves
          .filter(Boolean)
          .map((moveId) => {
            const move = dexStore.getMove(moveId)
            return {
              id: moveId,
              name: move?.name ?? moveId,
              type: move?.type ?? null,
              category: move?.category ?? null,
              power: move?.power && move.power > 0 ? move.power : null,
              accuracy: move?.accuracy ?? null,
              pp: move?.pp ?? null,
              priority: move?.priority ?? 0,
            } satisfies StrategyTeamMoveSummary
          }),
      } satisfies StrategyTeamSnapshotEntry
    }),
)
const observedChips = computed<ObservedChip[]>(() => {
  const threat = selectedThreat.value
  if (!threat) return []

  return [
    ...threat.commonMoves.map((moveId) => ({
      key: `move:${moveId}`,
      label: moveName(moveId),
      group: t('strategy.commonMoves'),
      tone: 'sky' as const,
      remove: () => strategyStore.removeThreatMove(mode.value, threat.pokemonId, moveId),
    })),
    ...threat.commonItems.map((itemId) => ({
      key: `item:${itemId}`,
      label: itemName(itemId),
      group: t('strategy.commonItems'),
      tone: 'amber' as const,
      remove: () => strategyStore.removeThreatItem(mode.value, threat.pokemonId, itemId),
    })),
    ...threat.commonAbilities.map((abilityId) => ({
      key: `ability:${abilityId}`,
      label: abilityName(abilityId),
      group: t('strategy.commonAbilities'),
      tone: 'emerald' as const,
      remove: () => strategyStore.removeThreatAbility(mode.value, threat.pokemonId, abilityId),
    })),
    ...threat.commonTeraTypes.map((teraType) => ({
      key: `tera:${teraType}`,
      label: typeLabel(teraType),
      group: t('strategy.commonTera'),
      tone: 'fuchsia' as const,
      remove: () => strategyStore.removeThreatTera(mode.value, threat.pokemonId, teraType),
    })),
    ...threat.commonPartners.map((partnerPokemonId) => ({
      key: `partner:${partnerPokemonId}`,
      label: threatName(partnerPokemonId),
      group: t('strategy.commonPartners'),
      tone: 'violet' as const,
      remove: () => strategyStore.removeThreatPartner(mode.value, threat.pokemonId, partnerPokemonId),
    })),
  ]
})

watch(
  () => selectedThreat.value?.pokemonId ?? null,
  () => {
    quickActionMessage.value = ''
  },
)

watch(mode, () => {
  tagFilter.value = 'all'
  searchQuery.value = ''
  quickActionMessage.value = ''
})

onMounted(() => {
  void dexStore.ensureCatalogLoaded({ locale: currentLocale.value })
})

watch(
  () => currentLocale.value,
  (nextLocale) => {
    void dexStore.ensureCatalogLoaded({ locale: nextLocale })
  },
)

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function formatRelativeDate(value: string): string {
  if (!value) return t('strategy.lastSeenUnknown')
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return t('strategy.lastSeenUnknown')
  const diffMs = timestamp - Date.now()
  const diffMinutes = Math.round(diffMs / (60 * 1000))
  const formatter = new Intl.RelativeTimeFormat(currentLocale.value, { numeric: 'auto' })
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour')
  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

function threatName(pokemonId: string): string {
  return pokemonById.value.get(pokemonId)?.name ?? pokemonId
}

function moveName(moveId: string): string {
  return dexStore.getMove(moveId)?.name ?? moveId
}

function itemName(itemId: string): string {
  return dexStore.getItem(itemId)?.name ?? itemId
}

function abilityName(abilityId: string): string {
  return dexStore.getAbilityMeta(abilityId).name
}

function abilityLineFor(pokemonId: string, preferredAbilityIds: string[] = []): string {
  const preferred = preferredAbilityIds
    .map((abilityId) => abilityName(abilityId))
    .filter(Boolean)
  if (preferred.length > 0) {
    return preferred.join(' / ')
  }

  const pokemon = pokemonById.value.get(pokemonId)
  const available = (pokemon?.abilities ?? [])
    .map((abilityId) => abilityName(abilityId))
    .filter(Boolean)

  return available.length > 0 ? available.join(' / ') : t('strategy.sidebarUnknownAbility')
}

function typeLabel(type: PokemonTypeKey): string {
  const meta = TYPE_META[type]
  return currentLocale.value === 'es' ? meta.es : meta.en
}

function weaknessEntriesFor(types: PokemonTypeKey[]): Array<{ type: PokemonTypeKey; multiplier: number }> {
  if (types.length === 0) return []
  const [first, second] = types
  return (Object.keys(TYPE_META) as PokemonTypeKey[])
    .map((attackingType) => ({
      type: attackingType,
      multiplier: effectivenessAgainstDual(attackingType, first, second),
    }))
    .filter((entry) => entry.multiplier > 1)
    .sort((a, b) => b.multiplier - a.multiplier || typeLabel(a.type).localeCompare(typeLabel(b.type), currentLocale.value))
    .slice(0, 4)
}

function weaknessLabel(multiplier: number): string {
  if (multiplier === 4) return 'x4'
  if (multiplier === 2) return 'x2'
  return `x${multiplier}`
}

function baseSpeed(pokemonId: string): number | null {
  return pokemonById.value.get(pokemonId)?.baseStats.spe ?? null
}

function observedChipClass(tone: ObservedChipTone): string {
  if (tone === 'amber') return 'border-amber-500/30 bg-amber-500/12 text-amber-100'
  if (tone === 'emerald') return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100'
  if (tone === 'fuchsia') return 'border-fuchsia-500/30 bg-fuchsia-500/12 text-fuchsia-100'
  if (tone === 'violet') return 'border-violet-500/30 bg-violet-500/12 text-violet-100'
  return 'border-sky-500/30 bg-sky-500/12 text-sky-100'
}

function observationSourceButtonClass(source: ObservationSource): string {
  return activeObservationSource.value === source
    ? 'border-sky-400 bg-sky-500/15 text-sky-100'
    : 'border-gray-700 text-gray-300 hover:border-sky-500/35 hover:text-sky-100'
}

function moveSurfaceStyle(type: PokemonTypeKey | null): Record<string, string> | undefined {
  return moveTypeGradientStyle(type ?? undefined) as Record<string, string> | undefined
}

function moveCategoryLabel(category: StrategyTeamMoveSummary['category']): string {
  if (category === 'physical') return t('builder.moveCategoryPhysical')
  if (category === 'special') return t('builder.moveCategorySpecial')
  return t('builder.moveCategoryStatus')
}

function moveValueLabel(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${value}${suffix}`
}

function priorityLabel(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function tagLabel(tag: StrategyThreatSeenTag): string {
  if (tag === 'common') return t('strategy.tagCommon')
  if (tag === 'danger') return t('strategy.tagDanger')
  if (tag === 'prep') return t('strategy.tagPrep')
  return t('strategy.tagSolved')
}

function tagButtonClass(tag: StrategyThreatSeenTag): string {
  if (tag === 'danger') return 'border-rose-500/40 text-rose-200'
  if (tag === 'prep') return 'border-amber-500/40 text-amber-200'
  if (tag === 'solved') return 'border-emerald-500/40 text-emerald-200'
  return 'border-sky-500/40 text-sky-200'
}

function dangerBadgeClass(tag: StrategyThreatSeenTag): string {
  if (tag === 'danger') return 'bg-rose-500/15 text-rose-200 border-rose-500/35'
  if (tag === 'prep') return 'bg-amber-500/15 text-amber-200 border-amber-500/35'
  if (tag === 'solved') return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35'
  return 'bg-sky-500/15 text-sky-200 border-sky-500/35'
}

function spriteUrlFor(pokemonId: string): string {
  return primaryPokemonSpriteUrl(pokemonId)
}

function selectThreat(pokemonId: string) {
  strategyStore.setSelectedThreat(mode.value, pokemonId)
}

function incrementSeen(pokemonId: string) {
  strategyStore.incrementThreatSeen(mode.value, pokemonId)
}

function removeThreat(pokemonId: string) {
  strategyStore.removeThreatNote(mode.value, pokemonId)
}

function toggleThreatTag(tag: StrategyThreatSeenTag) {
  if (!selectedThreat.value) return
  strategyStore.toggleThreatTag(mode.value, selectedThreat.value.pokemonId, tag)
}

function updateThreatNotes(event: Event) {
  if (!selectedThreat.value) return
  strategyStore.setThreatNotes(mode.value, selectedThreat.value.pokemonId, (event.target as HTMLTextAreaElement).value)
}

function updateThreatResponsePlan(event: Event) {
  if (!selectedThreat.value) return
  strategyStore.setThreatResponsePlan(mode.value, selectedThreat.value.pokemonId, (event.target as HTMLTextAreaElement).value)
}

function updateUserEdits(event: Event) {
  strategyStore.setUserEdits(mode.value, (event.target as HTMLTextAreaElement).value)
}

function emptyEvs() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function emptyIvs() {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
}

function emptyStages() {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function defaultCombatContext() {
  return {
    wasHitThisTurn: false,
    tookDamageThisTurn: false,
    statsLoweredThisTurn: false,
    previousMoveFailed: false,
    moveOrderHint: 'auto' as const,
    consecutiveMoveUses: 0,
    timesHitThisBattle: 0,
    alliesFaintedCount: 0,
    stockpileCount: 0,
    friendship: 255,
  }
}

function normalizeMoves(moves: string[]): [string, string, string, string] {
  return [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? '']
}

function resolveQuickLoadSlot() {
  const scenario = damageCalcStore.getScenario(mode.value)
  const sideB = scenario.sideB
  const emptyActive = sideB.activeSlotIds.find((slotId) => {
    const slot = sideB.slots.find((entry) => entry.slot === slotId)
    return !slot?.pokemonId
  })
  if (emptyActive) return emptyActive
  const emptyAny = sideB.slots.find((slot) => !slot.pokemonId)?.slot
  if (emptyAny) return emptyAny
  if (mode.value === 'vgc') {
    const reserveSlot = sideB.slots.find((slot) => !sideB.activeSlotIds.includes(slot.slot))?.slot
    return reserveSlot ?? 5
  }
  return 1
}

async function applyThreatToDamageCalc(action: DamageTargetAction) {
  const threat = selectedThreat.value
  const pokemon = selectedThreatPokemon.value
  if (!threat || !pokemon) return

  const currentScenario = damageCalcStore.getScenario(mode.value)
  const sideAHasPokemon = currentScenario.sideA.slots.some((slot) => Boolean(slot.pokemonId))
  if (!sideAHasPokemon) {
    damageCalcStore.initFromBuilder(mode.value)
  }

  const targetSlot = resolveQuickLoadSlot()
  const defaultItemId = pokemon.requiredItemId ?? pokemon.suggestedItems[0] ?? ''

  damageCalcStore.updateSlotSet(mode.value, 'B', targetSlot, {
    pokemonId: pokemon.id,
    abilityId: pokemon.abilities[0] ?? '',
    itemId: defaultItemId,
    natureId: pokemon.defaultNature || 'jolly',
    teraType: pokemon.types[0],
    isTeraActive: false,
    moves: normalizeMoves(pokemon.suggestedMoves),
    evs: emptyEvs(),
    ivs: emptyIvs(),
    level: mode.value === 'vgc' ? 50 : 100,
    currentHpPercent: 100,
    status: 'healthy',
    stages: emptyStages(),
    combatContext: defaultCombatContext(),
  })

  await damageCalcStore.applyBenchmark(mode.value, 'B', targetSlot)

  const nextScenario = damageCalcStore.getScenario(mode.value)
  const firstActiveAttacker =
    nextScenario.sideA.activeSlotIds.find((slotId) =>
      Boolean(nextScenario.sideA.slots.find((entry) => entry.slot === slotId)?.pokemonId),
    ) ??
    nextScenario.sideA.activeSlotIds[0] ??
    1

  damageCalcStore.setSelectedPair(mode.value, 'A', firstActiveAttacker, targetSlot)
  quickActionMessage.value =
    action === 'open'
      ? t('strategy.openDamageCalcReady', { name: pokemon.name })
      : t('strategy.loadQuickRivalReady', { name: pokemon.name })

  if (action === 'open') {
    await router.push({ name: 'damage-calc', params: { mode: mode.value } })
  }
}
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.24em] text-sky-300/70">
            {{ t('strategy.title') }}
          </p>
          <h1 class="mt-1 text-2xl font-semibold text-white">
            {{ activeTeam.name }}
          </h1>
          <p class="mt-2 max-w-3xl text-sm text-gray-300">
            {{ t('strategy.subtitle') }}
          </p>
        </div>

        <div class="flex w-full flex-col gap-3 lg:w-[26rem]">
          <div class="rounded-xl border border-sky-500/20 bg-sky-500/8 p-3 text-sm text-gray-300">
            <p class="font-medium text-sky-100">{{ t('strategy.sidebarPromptTitle') }}</p>
            <p class="mt-1 text-xs text-gray-400">{{ t('strategy.sidebarPromptBody') }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-sky-500/40 hover:text-sky-100"
              type="button"
              @click="strategyStore.regenerate(mode)"
            >
              {{ t('strategy.regenerate') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <section class="rounded-2xl border border-fuchsia-500/20 bg-off-black/70 p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-fuchsia-200">{{ t('strategy.teamSnapshotTitle') }}</h2>
          <p class="mt-1 text-xs text-gray-400">{{ t('strategy.teamSnapshotHint') }}</p>
        </div>
      </div>

      <div v-if="currentTeamEntries.length" class="mt-4 grid gap-3 xl:grid-cols-2">
        <article
          v-for="entry in currentTeamEntries"
          :key="`strategy-team-${entry.slot}`"
          class="rounded-xl border border-gray-800 bg-st-black/55 p-3"
        >
          <div class="flex items-start gap-3">
            <img
              :src="spriteUrlFor(entry.pokemonId)"
              :alt="entry.name"
              class="h-14 w-14 rounded-lg bg-black/30 object-contain"
              :data-sprite-id="entry.pokemonId"
              data-sprite-fallback-index="0"
              loading="lazy"
              @error="onPokemonSpriteError"
            />

            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-semibold text-white">
                  {{ t('common.slot', { slot: entry.slot }) }} · {{ entry.name }}
                </p>
                <span class="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100">
                  {{ t('strategy.sidebarSpeedShort', { value: entry.baseSpeed ?? '-' }) }}
                </span>
              </div>

              <div class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="type in entry.types"
                  :key="`${entry.pokemonId}-${type}`"
                  class="rounded-full border px-2 py-0.5 text-[11px]"
                  :style="typeBadgeStyle(type)"
                >
                  {{ typeLabel(type) }}
                </span>
              </div>
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <p class="text-[11px] text-gray-500">{{ t('strategy.teamSnapshotMovesHint') }}</p>
            <div v-if="entry.moves.length" class="space-y-2">
              <div
                v-for="move in entry.moves"
                :key="`${entry.slot}-${move.id}`"
                class="rounded-lg border border-gray-700 bg-st-black/65 p-2"
                :style="moveSurfaceStyle(move.type)"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <img
                      v-if="move.type"
                      :src="TYPE_META[move.type].icon"
                      :alt="typeLabel(move.type)"
                      class="h-4 w-4 shrink-0 object-contain"
                    />
                    <div v-else class="h-4 w-4 shrink-0 rounded-full border border-gray-700 bg-off-black/70" />
                    <p class="truncate text-xs font-semibold text-gray-100">{{ move.name }}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1 text-[10px] text-gray-300">
                    <span
                      v-if="move.type"
                      class="inline-flex items-center gap-1 rounded border border-gray-700 bg-off-black/70 px-1 py-0.5"
                    >
                      {{ typeLabel(move.type) }}
                    </span>
                    <span class="rounded border border-gray-700 bg-off-black/70 px-1 py-0.5">
                      {{ moveCategoryLabel(move.category) }}
                    </span>
                  </div>
                </div>
                <p class="mt-1 font-mono text-[10px] text-gray-400">
                  {{ t('builder.movePowerShort') }} {{ moveValueLabel(move.power) }} |
                  {{ t('builder.moveAccuracyShort') }} {{ moveValueLabel(move.accuracy, '%') }} |
                  {{ t('builder.movePpShort') }} {{ moveValueLabel(move.pp) }}
                  <template v-if="move.priority !== 0">
                    | {{ t('builder.movePriorityShort') }} {{ priorityLabel(move.priority) }}
                  </template>
                </p>
              </div>
            </div>
            <p v-else class="text-xs text-gray-500">
              {{ t('strategy.teamSnapshotNoMoves') }}
            </p>
          </div>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-xl border border-dashed border-gray-700 bg-st-black/40 p-4 text-sm text-gray-400"
      >
        {{ t('strategy.teamSnapshotEmpty') }}
      </div>

      <div class="mt-4">
        <label class="mb-2 block text-sm font-medium text-gray-200" for="strategy-user-edits">
          {{ t('strategy.manualPlan') }}
        </label>
        <textarea
          id="strategy-user-edits"
          :value="draft.userEdits"
          class="min-h-[132px] w-full rounded-xl border border-gray-800 bg-st-black/70 p-3 text-sm text-gray-100 outline-none transition focus:border-sky-400/60"
          :placeholder="t('strategy.manualPlaceholder')"
          @input="updateUserEdits"
        />
      </div>
    </section>

    <section class="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <aside class="rounded-2xl border border-sky-500/20 bg-off-black/70 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-sky-200">{{ t('strategy.radarTitle') }}</h2>
            <p class="mt-1 text-xs text-gray-400">{{ t('strategy.radarHint') }}</p>
          </div>
          <span class="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-100">
            {{ filteredThreats.length }}
          </span>
        </div>

        <div class="mt-4 space-y-3">
          <input
            v-model="searchQuery"
            type="text"
            class="w-full rounded-lg border border-gray-800 bg-st-black/70 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-sky-400/60"
            :placeholder="t('strategy.searchPlaceholder')"
          />
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in tagFilterOptions"
              :key="option.value"
              class="rounded-full border px-2.5 py-1 text-xs transition"
              :class="tagFilter === option.value
                ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                : 'border-gray-700 text-gray-300 hover:border-sky-500/35 hover:text-sky-100'"
              type="button"
              @click="tagFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div
          v-if="filteredThreats.length === 0"
          class="mt-4 rounded-xl border border-dashed border-gray-700 bg-st-black/40 p-4 text-sm text-gray-400"
        >
          {{ t('strategy.emptyThreats') }}
        </div>

        <div v-else class="mt-4 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
          <button
            v-for="entry in filteredThreats"
            :key="entry.pokemonId"
            class="w-full rounded-xl border p-3 text-left transition"
            :class="draft.selectedThreatPokemonId === entry.pokemonId
              ? 'border-sky-400/50 bg-sky-500/10'
              : 'border-gray-800 bg-st-black/55 hover:border-sky-500/30'"
            type="button"
            @click="selectThreat(entry.pokemonId)"
          >
            <div class="flex items-start gap-3">
              <img
                :src="spriteUrlFor(entry.pokemonId)"
                :alt="threatName(entry.pokemonId)"
                class="h-14 w-14 rounded-lg bg-black/30 object-contain"
                :data-sprite-id="entry.pokemonId"
                data-sprite-fallback-index="0"
                loading="lazy"
                @error="onPokemonSpriteError"
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-white">
                      {{ entry.name }}
                    </p>
                    <p class="mt-1 text-xs text-gray-400">
                      {{ t('strategy.timesSeenShort', { count: entry.timesSeen }) }}
                    </p>
                  </div>
                  <p class="shrink-0 text-[11px] text-gray-500">
                    {{ formatRelativeDate(entry.lastSeenAt) }}
                  </p>
                </div>

                <div v-if="entry.types.length" class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="type in entry.types"
                    :key="type"
                    class="rounded-full border px-2 py-0.5 text-[11px]"
                    :style="typeBadgeStyle(type)"
                  >
                    {{ typeLabel(type) }}
                  </span>
                </div>

                <p class="mt-2 text-[11px] text-gray-400">
                  {{ entry.abilityLine }} · {{ t('strategy.sidebarSpeedShort', { value: entry.baseSpeed ?? '-' }) }}
                </p>

                <div v-if="entry.weaknesses.length" class="mt-2 flex flex-wrap items-center gap-1.5">
                  <span class="text-[11px] text-gray-500">{{ t('strategy.weaknessesShort') }}</span>
                  <span
                    v-for="weakness in entry.weaknesses"
                    :key="`${entry.pokemonId}-weak-${weakness.type}`"
                    class="rounded-full border px-2 py-0.5 text-[10px]"
                    :style="typeBadgeStyle(weakness.type)"
                  >
                    {{ typeLabel(weakness.type) }} {{ weaknessLabel(weakness.multiplier) }}
                  </span>
                </div>

                <div class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in entry.tags"
                    :key="tag"
                    class="rounded-full border px-2 py-0.5 text-[11px]"
                    :class="dangerBadgeClass(tag)"
                  >
                    {{ tagLabel(tag) }}
                  </span>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    class="rounded-md border border-sky-500/35 px-2 py-1 text-xs text-sky-100 transition hover:bg-sky-500/15"
                    type="button"
                    @click.stop="incrementSeen(entry.pokemonId)"
                  >
                    {{ t('strategy.incrementSeen') }}
                  </button>
                  <button
                    class="rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-500/10"
                    type="button"
                    @click.stop="removeThreat(entry.pokemonId)"
                  >
                    {{ t('strategy.removeThreat') }}
                  </button>
                </div>
              </div>
            </div>
          </button>
        </div>
      </aside>

      <section class="rounded-2xl border border-sky-500/20 bg-off-black/70 p-4">
        <div
          v-if="!selectedThreat || !selectedThreatPokemon"
          class="rounded-xl border border-dashed border-gray-700 bg-st-black/40 p-6 text-center text-sm text-gray-400"
        >
          {{ t('strategy.selectThreatEmpty') }}
        </div>

        <div v-else class="max-h-[64rem] space-y-4 overflow-y-auto pr-1">
          <header class="rounded-xl border border-gray-800 bg-st-black/55 p-4">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="flex items-start gap-4">
                <img
                  :src="spriteUrlFor(selectedThreatPokemon.id)"
                  :alt="selectedThreatPokemon.name"
                  class="h-20 w-20 rounded-xl bg-black/30 object-contain"
                  :data-sprite-id="selectedThreatPokemon.id"
                  data-sprite-fallback-index="0"
                  loading="lazy"
                  @error="onPokemonSpriteError"
                />

                <div>
                  <p class="text-xs uppercase tracking-[0.2em] text-sky-300/70">
                    {{ t('strategy.threatProfileTitle') }}
                  </p>
                  <h2 class="mt-1 text-2xl font-semibold text-white">
                    {{ selectedThreatPokemon.name }}
                  </h2>
                  <p class="mt-2 text-sm text-gray-300">
                    {{ abilityLineFor(selectedThreatPokemon.id, selectedThreat.commonAbilities) }} · {{ t('strategy.sidebarSpeedShort', { value: baseSpeed(selectedThreatPokemon.id) ?? '-' }) }}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span
                      v-for="type in selectedThreatPokemon.types"
                      :key="type"
                      class="rounded-full border px-2.5 py-1 text-xs"
                      :style="typeBadgeStyle(type)"
                    >
                      {{ typeLabel(type) }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  v-for="tag in TAGS"
                  :key="tag"
                  class="rounded-full border px-3 py-1.5 text-xs transition"
                  :class="selectedThreat.tags.includes(tag)
                    ? `${tagButtonClass(tag)} bg-white/5`
                    : 'border-gray-700 text-gray-300 hover:border-sky-500/35 hover:text-sky-100'"
                  type="button"
                  @click="toggleThreatTag(tag)"
                >
                  {{ tagLabel(tag) }}
                </button>
              </div>
            </div>
          </header>

          <section class="rounded-xl border border-gray-800 bg-st-black/55 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-white">{{ t('strategy.observedTitle') }}</h3>
                <p class="mt-1 text-xs text-gray-400">{{ t('strategy.observedHint') }}</p>
              </div>
              <div class="text-right text-xs text-gray-400">
                <p>{{ t('strategy.timesSeenFull', { count: selectedThreat.timesSeen }) }}</p>
                <p>{{ t('strategy.lastSeenLabel') }}: {{ formatRelativeDate(selectedThreat.lastSeenAt) }}</p>
              </div>
            </div>

            <div class="mt-4 rounded-xl border border-sky-500/15 bg-sky-500/[0.06] p-3 text-xs text-gray-300">
              {{ t('strategy.observedManageHint') }}
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <button
                v-for="source in ['moves', 'items', 'abilities', 'tera', 'partners'] as ObservationSource[]"
                :key="source"
                class="rounded-full border px-2.5 py-1 text-[11px] transition"
                :class="observationSourceButtonClass(source)"
                type="button"
                @click="activeObservationSource = source"
              >
                {{
                  source === 'moves'
                    ? t('strategy.commonMoves')
                    : source === 'items'
                      ? t('strategy.commonItems')
                      : source === 'abilities'
                        ? t('strategy.commonAbilities')
                        : source === 'tera'
                          ? t('strategy.commonTera')
                          : t('strategy.commonPartners')
                }}
              </button>
            </div>

            <div
              v-if="observedChips.length"
              class="mt-4 flex flex-wrap gap-2"
            >
              <button
                v-for="chip in observedChips"
                :key="chip.key"
                class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:border-rose-400/35 hover:text-rose-100"
                :class="observedChipClass(chip.tone)"
                type="button"
                @click="chip.remove"
              >
                <span class="font-medium opacity-80">{{ chip.group }}:</span>
                <span>{{ chip.label }}</span>
                <span aria-hidden="true">x</span>
              </button>
            </div>

            <p v-else class="mt-4 text-xs text-gray-500">
              {{ t('strategy.observedEmptyCompact') }}
            </p>
          </section>

          <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div class="rounded-xl border border-gray-800 bg-st-black/55 p-4">
              <h3 class="text-base font-semibold text-white">{{ t('strategy.responseTitle') }}</h3>
              <p class="mt-1 text-xs text-gray-400">{{ t('strategy.responseHint') }}</p>

              <div class="mt-4 space-y-4">
                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-200" for="strategy-threat-notes">
                    {{ t('strategy.notesLabel') }}
                  </label>
                  <textarea
                    id="strategy-threat-notes"
                    :value="selectedThreat.notes"
                    class="min-h-[120px] w-full rounded-xl border border-gray-800 bg-off-black/80 p-3 text-sm text-gray-100 outline-none transition focus:border-sky-400/60"
                    :placeholder="t('strategy.notesPlaceholder')"
                    @input="updateThreatNotes"
                  />
                </div>

                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-200" for="strategy-threat-response">
                    {{ t('strategy.responsePlanLabel') }}
                  </label>
                  <textarea
                    id="strategy-threat-response"
                    :value="selectedThreat.responsePlan"
                    class="min-h-[140px] w-full rounded-xl border border-gray-800 bg-off-black/80 p-3 text-sm text-gray-100 outline-none transition focus:border-sky-400/60"
                    :placeholder="t('strategy.responsePlaceholder')"
                    @input="updateThreatResponsePlan"
                  />
                </div>
              </div>
            </div>

            <aside class="rounded-xl border border-gray-800 bg-st-black/55 p-4">
              <h3 class="text-base font-semibold text-white">{{ t('strategy.quickActionsTitle') }}</h3>
              <p class="mt-1 text-xs text-gray-400">{{ t('strategy.quickActionsHint') }}</p>

              <div class="mt-4 space-y-2">
                <button
                  class="w-full rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/25"
                  type="button"
                  @click="applyThreatToDamageCalc('open')"
                >
                  {{ t('strategy.openDamageCalc') }}
                </button>
                <button
                  class="w-full rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-sky-500/35 hover:text-sky-100"
                  type="button"
                  @click="applyThreatToDamageCalc('load')"
                >
                  {{ t('strategy.loadQuickRival') }}
                </button>
              </div>

              <p v-if="quickActionMessage" class="mt-3 text-xs text-emerald-300">
                {{ quickActionMessage }}
              </p>
            </aside>
          </section>
        </div>
      </section>
    </section>
  </section>
</template>
