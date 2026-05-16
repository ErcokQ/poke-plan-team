<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode, PokemonTypeKey } from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { useDexStore } from '@/stores/dex'
import { useStrategyStore } from '@/stores/strategy'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'
import { getEffectiveLearnsetMoveIds } from '@/utils/move-legality'
import { onPokemonSpriteError, primaryPokemonSpriteUrl } from '@/utils/pokemon-sprite'
import { typeBadgeStyle } from '@/utils/type-badge-style'
import RightSidebarBlock from './RightSidebarBlock.vue'

interface StrategySidebarEntry {
  pokemonId: string
  name: string
  pokedexNumber: number
  abilityLine: string
  baseSpeed: number | null
  types: PokemonTypeKey[]
  weaknesses: Array<{ type: PokemonTypeKey; multiplier: number }>
  timesSeen?: number
}

interface ObservationCatalogEntry {
  id: string
  label: string
  labelNorm: string
  description: string
  descriptionNorm: string
  type?: PokemonTypeKey
  spriteId?: string
  types?: PokemonTypeKey[]
  speed?: number | null
  abilityLine?: string
}

type ObservationSource = 'moves' | 'items' | 'abilities' | 'tera' | 'partners'

const route = useRoute()
const { t, locale } = useI18n()
const dexStore = useDexStore()
const strategyStore = useStrategyStore()
const teamStore = useTeamStore()
const uiStore = useUiStore()

const searchQuery = ref('')
const observationSearchQuery = ref('')

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const activeTeam = computed(() => teamStore.getActiveTeam(mode.value))
const draft = computed(() => strategyStore.ensureDraft(mode.value))
const observationSource = computed<ObservationSource>({
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

const threatMap = computed(() => new Map(draft.value.threatNotes.map((entry) => [entry.pokemonId, entry])))

const sidebarPokemonMap = computed(() =>
  new Map(
    dexStore.getPokemonByMode(mode.value).map((pokemon) => {
      return [
        pokemon.id,
        {
          pokemonId: pokemon.id,
          name: pokemon.name,
          pokedexNumber: pokemon.pokedexNumber,
          abilityLine: abilityLineFor(pokemon.id),
          baseSpeed: pokemon.baseStats.spe ?? null,
          types: pokemon.types,
          weaknesses: weaknessEntriesFor(pokemon.types),
        } satisfies StrategySidebarEntry,
      ]
    }),
  ),
)

const filteredCatalog = computed<StrategySidebarEntry[]>(() => {
  const query = normalize(searchQuery.value)
  const allPokemon = [...sidebarPokemonMap.value.values()]
  const filtered = !query
    ? allPokemon.slice(0, 18)
    : allPokemon.filter((pokemon) => {
        const name = normalize(pokemon.name)
        const id = normalize(pokemon.pokemonId)
        const number = String(pokemon.pokedexNumber)
        return name.includes(query) || id.includes(query) || number.includes(query)
      })

  return filtered.slice(0, query ? 36 : 18)
})

const recentThreats = computed<StrategySidebarEntry[]>(() =>
  draft.value.threatNotes.slice(0, 8).map((threat) => {
    const baseEntry = sidebarPokemonMap.value.get(threat.pokemonId)
    return {
      pokemonId: threat.pokemonId,
      name: baseEntry?.name ?? threat.pokemonId,
      pokedexNumber: baseEntry?.pokedexNumber ?? 0,
      abilityLine: abilityLineFor(threat.pokemonId, draft.value.threatNotes.find((entry) => entry.pokemonId === threat.pokemonId)?.commonAbilities ?? []),
      baseSpeed: baseEntry?.baseSpeed ?? null,
      types: baseEntry?.types ?? [],
      weaknesses: baseEntry?.weaknesses ?? [],
      timesSeen: threat.timesSeen,
    }
  }),
)

const observationSourceOptions = computed(() => [
  { key: 'moves' as const, label: t('strategy.commonMoves') },
  { key: 'items' as const, label: t('strategy.commonItems') },
  { key: 'abilities' as const, label: t('strategy.commonAbilities') },
  { key: 'tera' as const, label: t('strategy.commonTera') },
  { key: 'partners' as const, label: t('strategy.commonPartners') },
])
const activeObservationSourceLabel = computed(() =>
  observationSourceOptions.value.find((option) => option.key === observationSource.value)?.label ?? t('strategy.commonMoves'),
)
const annotatedObservationIds = computed(() => {
  const threat = selectedThreat.value
  if (!threat) return new Set<string>()
  if (observationSource.value === 'moves') return new Set(threat.commonMoves)
  if (observationSource.value === 'items') return new Set(threat.commonItems)
  if (observationSource.value === 'abilities') return new Set(threat.commonAbilities)
  if (observationSource.value === 'tera') return new Set(threat.commonTeraTypes)
  return new Set(threat.commonPartners)
})

const observationEntries = computed<ObservationCatalogEntry[]>(() => {
  const pokemon = selectedThreatPokemon.value
  if (!selectedThreat.value || !pokemon) return []

  if (observationSource.value === 'moves') {
    const allowedMoveIds = new Set<string>([
      ...pokemon.suggestedMoves,
      ...getEffectiveLearnsetMoveIds(pokemon, (id) => dexStore.getPokemon(mode.value, id)),
    ])
    return [...allowedMoveIds]
      .map((moveId) => dexStore.getMove(moveId))
      .filter((move): move is NonNullable<typeof move> => Boolean(move))
      .sort((a, b) => a.name.localeCompare(b.name, locale.value === 'en' ? 'en' : 'es'))
      .map((move) => ({
        id: move.id,
        label: move.name,
        labelNorm: normalize(move.name),
        description: move.description || move.effect || '',
        descriptionNorm: normalize(move.description || move.effect || ''),
        type: move.type ?? undefined,
      }))
  }

  if (observationSource.value === 'items') {
    return dexStore.items
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, locale.value === 'en' ? 'en' : 'es'))
      .map((item) => ({
        id: item.id,
        label: item.name,
        labelNorm: normalize(item.name),
        description: item.description || item.effect || '',
        descriptionNorm: normalize(item.description || item.effect || ''),
      }))
  }

  if (observationSource.value === 'abilities') {
    return pokemon.abilities
      .map((abilityId) => dexStore.getAbilityMeta(abilityId))
      .map((ability) => ({
        id: ability.id,
        label: ability.name,
        labelNorm: normalize(ability.name),
        description: ability.shortEffect || ability.effect || '',
        descriptionNorm: normalize(ability.shortEffect || ability.effect || ''),
      }))
  }

  if (observationSource.value === 'tera') {
    return (Object.keys(TYPE_META) as PokemonTypeKey[]).map((type) => ({
      id: type,
      label: locale.value === 'en' ? TYPE_META[type].en : TYPE_META[type].es,
      labelNorm: normalize(locale.value === 'en' ? TYPE_META[type].en : TYPE_META[type].es),
      description: '',
      descriptionNorm: '',
      type,
    }))
  }

  return dexStore
    .getPokemonByMode(mode.value)
    .filter((pokemonEntry) => pokemonEntry.id !== selectedThreat.value?.pokemonId)
    .map((pokemonEntry) => ({
      id: pokemonEntry.id,
      label: `#${String(pokemonEntry.pokedexNumber).padStart(4, '0')} ${pokemonEntry.name}`,
      labelNorm: normalize(pokemonEntry.name),
      description: '',
      descriptionNorm: '',
      spriteId: pokemonEntry.id,
      types: pokemonEntry.types,
      speed: pokemonEntry.baseStats.spe ?? null,
      abilityLine: abilityLineFor(pokemonEntry.id),
    }))
})

const filteredObservationEntries = computed(() => {
  const needle = normalize(observationSearchQuery.value)
  if (!needle) return observationEntries.value.slice(0, 72)
  return observationEntries.value
    .filter(
      (entry) =>
        entry.labelNorm.includes(needle) ||
        entry.descriptionNorm.includes(needle) ||
        normalize(entry.id).includes(needle),
    )
    .slice(0, 120)
})

watch(
  () => selectedThreat.value?.pokemonId ?? null,
  () => {
    observationSearchQuery.value = ''
  },
)

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function spriteUrlFor(pokemonId: string): string {
  return primaryPokemonSpriteUrl(pokemonId)
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

  const pokemon = dexStore.getPokemon(mode.value, pokemonId)
  const available = (pokemon?.abilities ?? [])
    .map((abilityId) => abilityName(abilityId))
    .filter(Boolean)

  return available.length > 0 ? available.join(' / ') : t('strategy.sidebarUnknownAbility')
}

function typeLabel(type: PokemonTypeKey): string {
  return locale.value === 'en' ? TYPE_META[type].en : TYPE_META[type].es
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
    .sort((a, b) => b.multiplier - a.multiplier || typeLabel(a.type).localeCompare(typeLabel(b.type), locale.value === 'en' ? 'en' : 'es'))
    .slice(0, 4)
}

function weaknessLabel(multiplier: number): string {
  if (multiplier === 4) return 'x4'
  if (multiplier === 2) return 'x2'
  return `x${multiplier}`
}

function addOrSelectThreat(pokemonId: string) {
  const existing = threatMap.value.get(pokemonId)
  if (!existing) {
    strategyStore.upsertThreatNote(mode.value, pokemonId, {
      timesSeen: 1,
      lastSeenAt: new Date().toISOString(),
    })
  }
  strategyStore.setSelectedThreat(mode.value, pokemonId)
}

function incrementSeen(pokemonId: string) {
  strategyStore.incrementThreatSeen(mode.value, pokemonId)
  strategyStore.setSelectedThreat(mode.value, pokemonId)
}

function observationSourceButtonClass(source: ObservationSource): string {
  return observationSource.value === source
    ? 'border-sky-400 bg-sky-500/15 text-sky-100'
    : 'border-gray-700 text-gray-300 hover:border-sky-500/30 hover:text-sky-100'
}

function observationEntryClass(entryId: string): string {
  return annotatedObservationIds.value.has(entryId)
    ? 'border-emerald-500/35 bg-emerald-500/8'
    : 'border-gray-800 bg-black/20 hover:border-sky-500/30'
}

function addObservation(observationId: string) {
  const threat = selectedThreat.value
  if (!threat || !observationId) return

  if (observationSource.value === 'moves') {
    strategyStore.appendThreatMove(mode.value, threat.pokemonId, observationId)
  } else if (observationSource.value === 'items') {
    strategyStore.appendThreatItem(mode.value, threat.pokemonId, observationId)
  } else if (observationSource.value === 'abilities') {
    strategyStore.appendThreatAbility(mode.value, threat.pokemonId, observationId)
  } else if (observationSource.value === 'tera') {
    strategyStore.appendThreatTera(mode.value, threat.pokemonId, observationId as PokemonTypeKey)
  } else {
    strategyStore.appendThreatPartner(mode.value, threat.pokemonId, observationId)
  }
}
</script>

<template>
  <RightSidebarBlock
    v-if="selectedThreat && selectedThreatPokemon"
    :title="`${t('strategy.sidebarObserveTitle')}: ${activeObservationSourceLabel}`"
    :default-open="true"
  >
    <div class="space-y-3">
      <p class="text-xs text-gray-400">
        {{ t('strategy.sidebarObserveHint', { name: selectedThreatPokemon.name }) }}
      </p>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in observationSourceOptions"
          :key="option.key"
          class="rounded-full border px-2.5 py-1 text-[11px] transition"
          :class="observationSourceButtonClass(option.key)"
          type="button"
          @click="observationSource = option.key"
        >
          {{ option.label }}
        </button>
      </div>

      <input
        v-model="observationSearchQuery"
        type="text"
        class="w-full rounded-lg border border-gray-700 bg-off-black/80 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-sky-400/60"
        :placeholder="t('strategy.sidebarObservePlaceholder')"
      />

      <div class="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
        <button
          v-for="entry in filteredObservationEntries"
          :key="`${observationSource}-${entry.id}`"
          class="w-full rounded-xl border px-2.5 py-2 text-left transition"
          :class="observationEntryClass(entry.id)"
          type="button"
          @click="addObservation(entry.id)"
        >
          <div class="flex items-start gap-3">
            <img
              v-if="entry.spriteId"
              :src="spriteUrlFor(entry.spriteId)"
              :alt="entry.label"
              class="h-10 w-10 rounded-lg bg-black/30 object-contain"
              :data-sprite-id="entry.spriteId"
              data-sprite-fallback-index="0"
              loading="lazy"
              @error="onPokemonSpriteError"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-medium text-gray-100">{{ entry.label }}</p>
                <span
                  v-if="entry.type"
                  class="rounded-full border px-1.5 py-0.5 text-[10px]"
                  :style="typeBadgeStyle(entry.type)"
                >
                  {{ typeLabel(entry.type) }}
                </span>
              </div>

              <div v-if="entry.types?.length" class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="type in entry.types"
                  :key="`${entry.id}-${type}`"
                  class="rounded-full border px-1.5 py-0.5 text-[10px]"
                  :style="typeBadgeStyle(type)"
                >
                  {{ typeLabel(type) }}
                </span>
              </div>

              <p v-if="entry.description" class="mt-1 text-[11px] text-gray-400">
                {{ entry.description }}
              </p>
              <p v-if="entry.abilityLine && entry.speed !== undefined && entry.speed !== null" class="mt-1 text-[11px] text-gray-400">
                {{ entry.abilityLine }} · {{ t('strategy.sidebarSpeedShort', { value: entry.speed }) }}
              </p>

              <span
                v-if="annotatedObservationIds.has(entry.id)"
                class="mt-2 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
              >
                {{ t('strategy.sidebarAlreadyLogged') }}
              </span>
            </div>
          </div>
        </button>

        <p v-if="filteredObservationEntries.length === 0" class="text-xs text-gray-500">
          {{ t('strategy.sidebarObserveNoResults') }}
        </p>
      </div>
    </div>
  </RightSidebarBlock>

  <RightSidebarBlock :title="t('strategy.sidebarCatalogTitle')">
    <p class="mb-3 text-xs text-gray-400">{{ t('strategy.sidebarCatalogHint') }}</p>

    <input
      v-model="searchQuery"
      type="text"
      class="w-full rounded-lg border border-gray-700 bg-off-black/80 px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-sky-400/60"
      :placeholder="t('strategy.sidebarCatalogSearch')"
    />

    <div class="mt-3 space-y-2">
      <button
        v-for="pokemon in filteredCatalog"
        :key="pokemon.pokemonId"
        class="flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition"
        :class="draft.selectedThreatPokemonId === pokemon.pokemonId
          ? 'border-sky-400/40 bg-sky-500/10'
          : 'border-gray-800 bg-black/20 hover:border-sky-500/30'"
        type="button"
        @click="addOrSelectThreat(pokemon.pokemonId)"
      >
        <img
          :src="spriteUrlFor(pokemon.pokemonId)"
          :alt="pokemon.name"
          class="h-11 w-11 rounded-lg bg-black/30 object-contain"
          :data-sprite-id="pokemon.pokemonId"
          data-sprite-fallback-index="0"
          loading="lazy"
          @error="onPokemonSpriteError"
        />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-gray-100">
            {{ pokemon.name }}
          </p>
          <p class="text-[11px] text-gray-500">
            #{{ String(pokemon.pokedexNumber).padStart(4, '0') }}
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="type in pokemon.types"
              :key="type"
              class="rounded-full border px-1.5 py-0.5 text-[10px]"
              :style="typeBadgeStyle(type)"
            >
              {{ typeLabel(type) }}
            </span>
          </div>
          <div v-if="pokemon.weaknesses.length" class="mt-1 flex flex-wrap items-center gap-1">
            <span class="text-[10px] text-gray-500">{{ t('strategy.weaknessesShort') }}</span>
            <span
              v-for="weakness in pokemon.weaknesses"
              :key="`${pokemon.pokemonId}-weak-${weakness.type}`"
              class="rounded-full border px-1.5 py-0.5 text-[10px]"
              :style="typeBadgeStyle(weakness.type)"
            >
              {{ typeLabel(weakness.type) }} {{ weaknessLabel(weakness.multiplier) }}
            </span>
          </div>
          <p class="mt-1 text-[11px] text-gray-400">
            {{ pokemon.abilityLine }} · {{ t('strategy.sidebarSpeedShort', { value: pokemon.baseSpeed ?? '-' }) }}
          </p>
        </div>

        <span
          v-if="threatMap.has(pokemon.pokemonId)"
          class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200"
        >
          {{ t('strategy.sidebarInRadar') }}
        </span>
        <span
          v-else
          class="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100"
        >
          {{ t('strategy.sidebarAdd') }}
        </span>
      </button>
    </div>
  </RightSidebarBlock>

  <RightSidebarBlock :title="t('strategy.sidebarRecentTitle')" :default-open="recentThreats.length > 0">
    <div v-if="recentThreats.length === 0" class="text-xs text-gray-500">
      {{ t('strategy.sidebarRecentEmpty') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="threat in recentThreats"
        :key="threat.pokemonId"
        class="flex items-center gap-2 rounded-lg border border-gray-800 bg-black/20 px-2.5 py-2"
      >
        <button
          class="flex min-w-0 flex-1 items-center gap-2 text-left"
          type="button"
          @click="addOrSelectThreat(threat.pokemonId)"
        >
          <img
            :src="spriteUrlFor(threat.pokemonId)"
            :alt="threat.name"
            class="h-9 w-9 rounded-lg bg-black/30 object-contain"
            :data-sprite-id="threat.pokemonId"
            data-sprite-fallback-index="0"
            loading="lazy"
            @error="onPokemonSpriteError"
          />
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-gray-100">
              {{ threat.name }}
            </p>
            <p class="text-[11px] text-gray-500">
              {{ t('strategy.timesSeenShort', { count: threat.timesSeen ?? 0 }) }}
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="type in threat.types"
                :key="type"
                class="rounded-full border px-1.5 py-0.5 text-[10px]"
                :style="typeBadgeStyle(type)"
              >
                {{ typeLabel(type) }}
              </span>
            </div>
            <div v-if="threat.weaknesses.length" class="mt-1 flex flex-wrap items-center gap-1">
              <span class="text-[10px] text-gray-500">{{ t('strategy.weaknessesShort') }}</span>
              <span
                v-for="weakness in threat.weaknesses"
                :key="`${threat.pokemonId}-weak-${weakness.type}`"
                class="rounded-full border px-1.5 py-0.5 text-[10px]"
                :style="typeBadgeStyle(weakness.type)"
              >
                {{ typeLabel(weakness.type) }} {{ weaknessLabel(weakness.multiplier) }}
              </span>
            </div>
            <p class="mt-1 text-[11px] text-gray-400">
              {{ threat.abilityLine }} · {{ t('strategy.sidebarSpeedShort', { value: threat.baseSpeed ?? '-' }) }}
            </p>
          </div>
        </button>

        <button
          class="rounded-md border border-sky-500/30 px-2 py-1 text-[11px] text-sky-100 transition hover:bg-sky-500/10"
          type="button"
          @click="incrementSeen(threat.pokemonId)"
        >
          {{ t('strategy.incrementSeen') }}
        </button>
      </div>
    </div>
  </RightSidebarBlock>

  <RightSidebarBlock :title="t('strategy.sidebarContextTitle')" :default-open="true">
    <div class="space-y-2 text-xs text-gray-400">
      <p>{{ t('strategy.sidebarContextTeam', { team: activeTeam.name }) }}</p>
      <p>{{ t('strategy.sidebarContextCount', { count: draft.threatNotes.length }) }}</p>
      <p>{{ t('strategy.sidebarContextHint') }}</p>
    </div>
  </RightSidebarBlock>
</template>
