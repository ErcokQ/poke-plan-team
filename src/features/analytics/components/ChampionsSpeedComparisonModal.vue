<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LocaleCode, PokemonEntry } from '@/models/domain'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDexStore } from '@/stores/dex'
import {
  calculateFavorableSpeedBenchmark,
  compareSpeed,
  megaFormLabel,
  speedComparisonPokemonName,
  type SpeedComparisonRelation,
  type SpeedComparisonResult,
} from '@/utils/speed-comparison'

type ViewFilter = 'all' | 'outpaces-team' | 'ties'

interface SpeedComparisonRow {
  pokemon: PokemonEntry
  benchmarkSpeed: number
  comparisons: Array<SpeedComparisonResult & { slot: number }>
  outpacesEntireTeam: boolean
  hasTie: boolean
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const analyticsStore = useAnalyticsStore()
const dexStore = useDexStore()
const query = ref('')
const viewFilter = ref<ViewFilter>('all')
const page = ref(1)
const pageSize = 60
const viewFilters: ViewFilter[] = ['all', 'outpaces-team', 'ties']

const localeCode = computed<LocaleCode>(() => (locale.value === 'en' ? 'en' : 'es'))
const teamColumns = computed(() =>
  Object.values(analyticsStore.getTeamSpeedMap('vgc').buckets)
    .flatMap((bucket) => bucket.members)
    .sort((a, b) => a.slot - b.slot),
)
const fastestTeamSpeed = computed(() =>
  teamColumns.value.reduce((highest, member) => Math.max(highest, member.effectiveSpeed), 0),
)

const allRows = computed<SpeedComparisonRow[]>(() => {
  if (!props.open) return []

  const seen = new Set<string>()
  return dexStore
    .getPokemonByMode('vgc')
    .filter((pokemon) => {
      if (seen.has(pokemon.id)) return false
      seen.add(pokemon.id)
      return dexStore
        .getGameAvailabilityForPokemon(pokemon.id, localeCode.value)
        .includes('pokemon-champions')
    })
    .map((pokemon) => {
      const benchmarkSpeed = calculateFavorableSpeedBenchmark(pokemon)
      const comparisons = teamColumns.value.map((member) => ({
        slot: member.slot,
        ...compareSpeed(member.effectiveSpeed, benchmarkSpeed),
      }))
      return {
        pokemon,
        benchmarkSpeed,
        comparisons,
        outpacesEntireTeam:
          comparisons.length > 0 && comparisons.every((entry) => entry.relation === 'slower'),
        hasTie: comparisons.some((entry) => entry.relation === 'tie'),
      }
    })
    .sort(
      (a, b) =>
        b.benchmarkSpeed - a.benchmarkSpeed ||
        a.pokemon.pokedexNumber - b.pokemon.pokedexNumber ||
        a.pokemon.name.localeCompare(b.pokemon.name, locale.value),
    )
})

const filteredRows = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase(locale.value)
  return allRows.value.filter((row) => {
    if (viewFilter.value === 'outpaces-team' && !row.outpacesEntireTeam) return false
    if (viewFilter.value === 'ties' && !row.hasTie) return false
    if (!normalizedQuery) return true
    return (
      speedComparisonPokemonName(row.pokemon).toLocaleLowerCase(locale.value).includes(normalizedQuery) ||
      row.pokemon.id.toLocaleLowerCase(locale.value).includes(normalizedQuery) ||
      String(row.pokemon.pokedexNumber).includes(normalizedQuery)
    )
  })
})

const outpacesTeamCount = computed(
  () => allRows.value.filter((row) => row.outpacesEntireTeam).length,
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize)))
const visibleRows = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredRows.value.slice(start, start + pageSize)
})

function relationClass(relation: SpeedComparisonRelation): string {
  if (relation === 'faster') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
  if (relation === 'tie') return 'border-amber-500/35 bg-amber-500/10 text-amber-200'
  return 'border-rose-500/35 bg-rose-500/10 text-rose-200'
}

function relationSymbol(comparison: SpeedComparisonResult): string {
  if (comparison.relation === 'faster') return `↑ +${comparison.delta}`
  if (comparison.relation === 'tie') return '= 0'
  return `↓ ${comparison.delta}`
}

function relationLabel(comparison: SpeedComparisonResult): string {
  if (comparison.relation === 'faster') {
    return t('analytics.speedCompareCellFaster', { delta: comparison.delta })
  }
  if (comparison.relation === 'tie') return t('analytics.speedCompareCellTie')
  return t('analytics.speedCompareCellSlower', { delta: Math.abs(comparison.delta) })
}

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') close()
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    viewFilter.value = 'all'
    page.value = 1
  },
)
watch([query, viewFilter], () => {
  page.value = 1
})
watch(totalPages, (nextTotal) => {
  if (page.value > nextTotal) page.value = nextTotal
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      :aria-label="t('analytics.speedCompareTitle')"
      @click.self="close"
    >
      <article
        class="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-sky-500/35 bg-off-black/98 shadow-2xl"
      >
        <header class="border-b border-gray-800 px-4 py-3 sm:px-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-sky-100">
                {{ t('analytics.speedCompareTitle') }}
              </h2>
              <p class="mt-1 text-xs text-gray-300">
                {{ t('analytics.speedCompareHint') }}
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:border-sky-500/60"
              @click="close"
            >
              {{ t('common.close') }}
            </button>
          </div>

          <div class="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div class="rounded-lg border border-gray-700 bg-black/30 px-3 py-2 text-gray-300">
              {{ t('analytics.speedCompareRoster') }}:
              <strong class="text-sky-200">{{ allRows.length }}</strong>
            </div>
            <div class="rounded-lg border border-gray-700 bg-black/30 px-3 py-2 text-gray-300">
              {{ t('analytics.speedCompareFastestTeam') }}:
              <strong class="text-emerald-200">{{ fastestTeamSpeed || '-' }}</strong>
            </div>
            <div class="rounded-lg border border-gray-700 bg-black/30 px-3 py-2 text-gray-300">
              {{ t('analytics.speedCompareOutpacesCount') }}:
              <strong class="text-rose-200">{{ outpacesTeamCount }}</strong>
            </div>
          </div>

          <p
            v-if="teamColumns.length === 0"
            class="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
          >
            {{ t('analytics.speedCompareEmptyTeam') }}
          </p>

          <div class="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <input
              v-model="query"
              type="search"
              class="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-gray-100 lg:max-w-sm"
              :placeholder="t('analytics.speedCompareSearch')"
            />
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="filter in viewFilters"
                :key="filter"
                type="button"
                class="rounded-lg border px-2.5 py-1.5 text-xs"
                :class="
                  viewFilter === filter
                    ? 'border-sky-400 bg-sky-500/15 text-sky-100'
                    : 'border-gray-700 text-gray-300'
                "
                @click="viewFilter = filter"
              >
                {{
                  filter === 'all'
                    ? t('analytics.speedCompareFilterAll')
                    : filter === 'outpaces-team'
                      ? t('analytics.speedCompareFilterOutpaces')
                      : t('analytics.speedCompareFilterTies')
                }}
              </button>
            </div>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-auto">
          <table class="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead class="sticky top-0 z-10 bg-[#111827] text-gray-300">
              <tr>
                <th class="sticky left-0 z-20 min-w-48 border-b border-gray-700 bg-[#111827] px-3 py-2">
                  {{ t('analytics.speedComparePokemon') }}
                </th>
                <th class="min-w-24 border-b border-gray-700 px-3 py-2 text-center">
                  {{ t('analytics.speedCompareBase') }}
                </th>
                <th class="min-w-28 border-b border-gray-700 px-3 py-2 text-center">
                  {{ t('analytics.speedCompareBenchmark') }}
                </th>
                <th
                  v-for="member in teamColumns"
                  :key="`speed-header-${member.slot}`"
                  class="min-w-32 border-b border-gray-700 px-3 py-2 text-center"
                >
                  <span class="block text-gray-100">S{{ member.slot }} {{ member.pokemonName }}</span>
                  <span class="text-sky-300">{{ member.effectiveSpeed }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in visibleRows"
                :key="row.pokemon.id"
                class="odd:bg-black/20 hover:bg-sky-500/5"
              >
                <td class="sticky left-0 border-b border-gray-800 bg-off-black px-3 py-2">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500">#{{ row.pokemon.pokedexNumber }}</span>
                    <span class="font-medium text-gray-100">{{ row.pokemon.name }}</span>
                    <span
                      v-if="megaFormLabel(row.pokemon.id)"
                      class="rounded border border-violet-500/35 px-1 py-0.5 text-[10px] text-violet-200"
                    >
                      {{ megaFormLabel(row.pokemon.id) }}
                    </span>
                  </div>
                </td>
                <td class="border-b border-gray-800 px-3 py-2 text-center text-gray-300">
                  {{ row.pokemon.baseStats.spe }}
                </td>
                <td class="border-b border-gray-800 px-3 py-2 text-center font-semibold text-sky-200">
                  {{ row.benchmarkSpeed }}
                </td>
                <td
                  v-for="comparison in row.comparisons"
                  :key="`${row.pokemon.id}-${comparison.slot}`"
                  class="border-b border-gray-800 px-2 py-1.5 text-center"
                >
                  <span
                    class="inline-flex min-w-16 justify-center rounded-md border px-2 py-1 font-semibold"
                    :class="relationClass(comparison.relation)"
                    :title="relationLabel(comparison)"
                  >
                    {{ relationSymbol(comparison) }}
                  </span>
                </td>
              </tr>
              <tr v-if="filteredRows.length === 0">
                <td
                  :colspan="teamColumns.length + 3"
                  class="px-3 py-8 text-center text-sm text-gray-400"
                >
                  {{
                    t('analytics.speedCompareNoResults')
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer
          class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 px-4 py-2 text-[11px] text-gray-400 sm:px-5"
        >
          <span>{{ t('analytics.speedCompareLegend') }} · {{ filteredRows.length }}/{{ allRows.length }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded border border-gray-700 px-2 py-1 text-gray-200 disabled:opacity-35"
              :disabled="page <= 1"
              @click="page -= 1"
            >
              {{ t('analytics.speedComparePrevious') }}
            </button>
            <span>{{ t('analytics.speedComparePage', { page, total: totalPages }) }}</span>
            <button
              type="button"
              class="rounded border border-gray-700 px-2 py-1 text-gray-200 disabled:opacity-35"
              :disabled="page >= totalPages"
              @click="page += 1"
            >
              {{ t('analytics.speedCompareNext') }}
            </button>
          </div>
        </footer>
      </article>
    </div>
  </Teleport>
</template>
