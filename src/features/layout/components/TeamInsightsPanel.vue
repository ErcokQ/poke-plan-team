<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode } from '@/models/domain'
import type { ThreatResponseRow } from '@/models/threats'
import { useAnalyticsStore } from '@/stores/analytics'
import { useMetaUsageStore } from '@/stores/meta-usage'
import { useTeamStore } from '@/stores/team'
import InsightsBlock from './insights/InsightsBlock.vue'

type InsightsPanelPreset = 'builder' | 'analytics' | 'strategy' | 'dex'
type InsightsSection =
  | 'metrics'
  | 'offensePressure'
  | 'speedMap'
  | 'teraDependency'
  | 'formula'
  | 'metaFit'
  | 'threats'
  | 'sources'
  | 'notes'
  | 'alerts'

const props = withDefaults(
  defineProps<{
    preset?: InsightsPanelPreset
  }>(),
  {
    preset: 'builder',
  },
)

const SECTION_PRESETS: Record<InsightsPanelPreset, InsightsSection[]> = {
  builder: ['metrics', 'metaFit', 'notes', 'alerts'],
  analytics: [
    'metrics',
    'offensePressure',
    'speedMap',
    'teraDependency',
    'formula',
    'metaFit',
    'threats',
    'sources',
    'alerts',
  ],
  strategy: ['notes', 'alerts'],
  dex: ['alerts'],
}

const route = useRoute()
const { t } = useI18n()
const analyticsStore = useAnalyticsStore()
const metaUsageStore = useMetaUsageStore()
const teamStore = useTeamStore()

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const team = computed(() => teamStore.getActiveTeam(mode.value))
const analytics = computed(() => analyticsStore.getTeamAnalytics(mode.value))
const scoreBreakdown = computed(() => analyticsStore.getTeamScoreBreakdown(mode.value))
const threatSummary = computed(() => analyticsStore.getThreatResponseSummary(mode.value))
const threatRows = computed(() => analyticsStore.getThreatResponses(mode.value))
const threatAlerts = computed(() => analyticsStore.getThreatAlerts(mode.value))
const offensivePressure = computed(() => analyticsStore.getOffensivePressureSummary(mode.value))
const offensivePressureAlerts = computed(() => analyticsStore.getOffensivePressureAlerts(mode.value))
const speedMap = computed(() => analyticsStore.getTeamSpeedMap(mode.value))
const teraDependency = computed(() => analyticsStore.getTeamTeraDependency(mode.value))
const teraAlerts = computed(() => analyticsStore.getTeraDependencyAlerts(mode.value))
const metaStatus = computed(() => metaUsageStore.getModeStatus(mode.value))
const metaError = computed(() => metaUsageStore.errorByMode[mode.value])
const activeSections = computed(() => SECTION_PRESETS[props.preset] ?? SECTION_PRESETS.builder)
const criticalThreatNames = computed(() => threatSummary.value.criticalThreats.map((row) => row.name).join(', '))
const combinedAlerts = computed(() => {
  let alerts = [...analytics.value.keyAlerts]
  if (hasSection('threats')) alerts = [...alerts, ...threatAlerts.value]
  if (hasSection('offensePressure')) alerts = [...alerts, ...offensivePressureAlerts.value]
  if (hasSection('teraDependency')) alerts = [...alerts, ...teraAlerts.value]
  return alerts
})
const speedProfileLabel = computed(() => {
  if (speedMap.value.profile === 'slow') return t('analytics.speedProfileSlow')
  if (speedMap.value.profile === 'mid') return t('analytics.speedProfileMid')
  if (speedMap.value.profile === 'fast') return t('analytics.speedProfileFast')
  if (speedMap.value.profile === 'veryFast') return t('analytics.speedProfileVeryFast')
  if (speedMap.value.profile === 'mixed') return t('analytics.speedProfileMixed')
  return t('analytics.speedProfileEmpty')
})
const speedSupportLabel = computed(() => {
  if (speedMap.value.hasTailwind && speedMap.value.hasTrickRoom) return t('analytics.speedSupportHybrid')
  if (speedMap.value.hasTailwind) return t('analytics.speedSupportTailwind')
  if (speedMap.value.hasTrickRoom) return t('analytics.speedSupportTrickRoom')
  if (speedMap.value.speedControlCount > 0) return t('analytics.speedSupportUtility')
  return t('analytics.speedSupportNone')
})
const speedMapText = computed(() => {
  if (speedMap.value.total === 0) return t('analytics.speedMapEmpty')
  return t('analytics.speedMapProfile', {
    profile: speedProfileLabel.value,
    support: speedSupportLabel.value,
  })
})

const metricRows = computed(() => {
  const helpByKey = {
    offenseCoverage: t('analytics.pillarMatchupsHelp'),
    defenseCoverage: t('analytics.pillarResourcesHelp'),
    roleBalance: t('analytics.pillarPlanHelp'),
    speedControl: t('analytics.pillarTempoHelp'),
  } as const

  const colorByKey = {
    offenseCoverage: 'bg-sky-500',
    defenseCoverage: 'bg-amber-500',
    roleBalance: 'bg-fuchsia-500',
    speedControl: 'bg-cyan-500',
  } as const

  const labelByKey = {
    offenseCoverage: t('analytics.pillarMatchups'),
    defenseCoverage: t('analytics.pillarResources'),
    roleBalance: t('analytics.pillarPlan'),
    speedControl: t('analytics.pillarTempo'),
  } as const

  const metricValueByKey = {
    offenseCoverage: analytics.value.matchupScore ?? analytics.value.offenseCoverage,
    defenseCoverage: analytics.value.resourcesScore ?? analytics.value.defenseCoverage,
    roleBalance: analytics.value.planScore ?? analytics.value.roleBalance,
    speedControl: analytics.value.tempoScore ?? analytics.value.speedControl,
  } as const

  const diagnosticByKey = {
    offenseCoverage: analytics.value.pillarDiagnostics?.matchups,
    defenseCoverage: analytics.value.pillarDiagnostics?.resources,
    roleBalance: analytics.value.pillarDiagnostics?.plan,
    speedControl: analytics.value.pillarDiagnostics?.tempo,
  } as const

  return scoreBreakdown.value.map((entry) => ({
    ...entry,
    metricValue: metricValueByKey[entry.key],
    label: labelByKey[entry.key],
    help: helpByKey[entry.key],
    diagnostic: diagnosticByKey[entry.key],
    colorClass: colorByKey[entry.key],
  }))
})

const totalWeighted = computed(() =>
  Math.round(metricRows.value.reduce((sum, entry) => sum + entry.weightedPoints, 0) * 10) / 10,
)

const scoreFormula = computed(() => {
  const find = (key: 'offenseCoverage' | 'defenseCoverage' | 'roleBalance' | 'speedControl') =>
    metricRows.value.find((entry) => entry.key === key)

  const offense = find('offenseCoverage')
  const defense = find('defenseCoverage')
  const role = find('roleBalance')
  const speed = find('speedControl')

  if (!offense || !defense || !role || !speed) return ''

  return `${t('common.score')} = (${offense.metricValue}x${formatPercent(offense.weight)}) + (${defense.metricValue}x${formatPercent(defense.weight)}) + (${role.metricValue}x${formatPercent(role.weight)}) + (${speed.metricValue}x${formatPercent(speed.weight)})`
})

const metaFit = computed(() => {
  const members = team.value.members.filter((member) => Boolean(member.pokemonId))
  let pokemonWithMeta = 0
  let itemChecks = 0
  let itemHits = 0
  let moveChecks = 0
  let moveHits = 0

  for (const member of members) {
    const meta = metaUsageStore.getPokemonMeta(mode.value, member.pokemonId)
    if (!meta) continue
    pokemonWithMeta += 1

    const topItems = new Set(meta.items.slice(0, 12).map((entry) => entry.id))
    const topMoves = new Set(meta.moves.slice(0, 24).map((entry) => entry.id))

    if (member.itemId) {
      itemChecks += 1
      if (topItems.has(member.itemId)) itemHits += 1
    }

    for (const moveId of member.moves.filter(Boolean)) {
      moveChecks += 1
      if (topMoves.has(moveId)) moveHits += 1
    }
  }

  const itemFitValue = itemChecks > 0 ? Math.round((itemHits / itemChecks) * 100) : null
  const moveFitValue = moveChecks > 0 ? Math.round((moveHits / moveChecks) * 100) : null
  const coverage = members.length > 0 ? Math.round((pokemonWithMeta / members.length) * 100) : 0

  const parts: number[] = []
  if (itemFitValue !== null) parts.push(itemFitValue * 0.4)
  if (moveFitValue !== null) parts.push(moveFitValue * 0.6)
  const metaFitScore = parts.length > 0 ? Math.round(parts.reduce((sum, value) => sum + value, 0)) : null

  return {
    teamSize: members.length,
    pokemonWithMeta,
    coverage,
    itemFitValue,
    moveFitValue,
    metaFitScore,
  }
})

async function ensureMetaLoaded() {
  await metaUsageStore.ensureModeLoaded(mode.value)
}

onMounted(() => {
  void ensureMetaLoaded()
})

watch(mode, () => {
  void ensureMetaLoaded()
})

function hasSection(section: InsightsSection): boolean {
  return activeSections.value.includes(section)
}

function updateNotes(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  teamStore.setTeamNotes(mode.value, value)
}

function formatPercent(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`
}

function threatMiniClass(status: ThreatResponseRow['status']): string {
  if (status === 'good') return 'border-emerald-500/35 text-emerald-200'
  if (status === 'warning') return 'border-amber-500/35 text-amber-200'
  return 'border-rose-500/35 text-rose-200'
}

function threatMiniLabel(status: ThreatResponseRow['status']): string {
  if (status === 'good') return t('analytics.threatStatusGood')
  if (status === 'warning') return t('analytics.threatStatusWarning')
  return t('analytics.threatStatusDanger')
}

function teraLevelLabel(level: 'unassigned' | 'autonomous' | 'improves' | 'critical'): string {
  if (level === 'unassigned') return t('analytics.teraLevelUnassigned')
  if (level === 'critical') return t('analytics.teraLevelCritical')
  if (level === 'improves') return t('analytics.teraLevelImproves')
  return t('analytics.teraLevelAutonomous')
}

function teraLevelClass(level: 'unassigned' | 'autonomous' | 'improves' | 'critical'): string {
  if (level === 'unassigned') return 'border-gray-600 text-gray-300'
  if (level === 'critical') return 'border-rose-500/35 text-rose-200'
  if (level === 'improves') return 'border-amber-500/35 text-amber-200'
  return 'border-emerald-500/35 text-emerald-200'
}

function pressureBandLabel(band: 'none' | 'low' | 'medium' | 'high' | 'na'): string {
  if (band === 'high') return t('analytics.pressureBandHigh')
  if (band === 'medium') return t('analytics.pressureBandMedium')
  if (band === 'low') return t('analytics.pressureBandLow')
  if (band === 'na') return t('analytics.pressureBandNA')
  return t('analytics.pressureBandNone')
}

function pressureBandClass(band: 'none' | 'low' | 'medium' | 'high' | 'na'): string {
  if (band === 'high') return 'border-emerald-500/35 text-emerald-200'
  if (band === 'medium') return 'border-amber-500/35 text-amber-200'
  if (band === 'low') return 'border-orange-500/35 text-orange-200'
  if (band === 'na') return 'border-gray-600 text-gray-300'
  return 'border-rose-500/35 text-rose-200'
}
</script>

<template>
  <section class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-3">
    <h2 class="text-sm font-semibold text-sky-300">{{ t('common.insights') }}</h2>

    <div class="mt-3 rounded-lg border border-gray-700 bg-st-black/60 p-3">
      <p class="text-xs text-gray-400">{{ t('common.score') }}</p>
      <p class="text-3xl font-bold text-sky-200">{{ analytics.totalScore }}</p>
      <p class="mt-1 text-[11px] text-gray-400">{{ t('analytics.scoreFormulaHint') }}</p>
    </div>

    <div class="mt-3 space-y-3">
      <InsightsBlock
        v-if="hasSection('metrics')"
        :title="t('analytics.team')"
        tone="sky"
        :default-open="props.preset !== 'builder'"
      >
        <div class="space-y-3 text-xs">
          <div v-for="entry in metricRows" :key="entry.key">
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="font-medium text-gray-200">{{ entry.label }}</span>
              <span class="text-gray-300">{{ entry.metricValue }}</span>
            </div>
            <div class="h-2 rounded-full bg-gray-800">
              <div class="h-full rounded-full" :class="entry.colorClass" :style="{ width: `${entry.metricValue}%` }" />
            </div>
            <div class="mt-1 flex items-center justify-between text-[10px] text-gray-400">
              <span>{{ t('analytics.scoreWeightLabel', { value: formatPercent(entry.weight) }) }}</span>
              <span>{{ t('analytics.scorePointsLabel', { value: entry.weightedPoints.toFixed(1) }) }}</span>
            </div>
            <p class="mt-0.5 text-[10px] text-gray-500">{{ entry.help }}</p>
            <p v-if="entry.diagnostic" class="mt-0.5 text-[10px] text-cyan-200">{{ entry.diagnostic }}</p>
          </div>
        </div>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('offensePressure')" :title="t('analytics.offensePressureTitle')" tone="amber">
        <p class="text-[11px] text-gray-300">{{ t('analytics.offensePressureHint') }}</p>
        <div class="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.offensePressureWincons') }}:</span>
            <span class="ml-1 text-fuchsia-200">{{ offensivePressure.winconCount }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.offensePressureClosers') }}:</span>
            <span class="ml-1 text-sky-200">{{ offensivePressure.closerCount }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.offensePressureSpread') }}:</span>
            <span class="ml-1 rounded border px-1 py-0.5" :class="pressureBandClass(offensivePressure.spreadPressure)">{{
              pressureBandLabel(offensivePressure.spreadPressure)
            }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.offensePressurePivoting') }}:</span>
            <span class="ml-1 rounded border px-1 py-0.5" :class="pressureBandClass(offensivePressure.pivoting)">{{
              pressureBandLabel(offensivePressure.pivoting)
            }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.offensePressureRedirection') }}:</span>
            <span class="ml-1 rounded border px-1 py-0.5" :class="pressureBandClass(offensivePressure.redirection)">{{
              pressureBandLabel(offensivePressure.redirection)
            }}</span>
          </div>
        </div>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('speedMap')" :title="t('analytics.speedMapTitle')" tone="sky">
        <p class="text-[11px] text-gray-300">{{ t('analytics.speedMapHint', { level: speedMap.level }) }}</p>
        <p class="mt-1 text-[11px] text-cyan-200">{{ speedMapText }}</p>
        <div class="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.speedBucketSlow') }}:</span>
            <span class="ml-1 text-sky-200">{{ speedMap.buckets.slow.count }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.speedBucketMid') }}:</span>
            <span class="ml-1 text-sky-200">{{ speedMap.buckets.mid.count }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.speedBucketFast') }}:</span>
            <span class="ml-1 text-sky-200">{{ speedMap.buckets.fast.count }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.speedBucketVeryFast') }}:</span>
            <span class="ml-1 text-sky-200">{{ speedMap.buckets.veryFast.count }}</span>
          </div>
        </div>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('teraDependency')" :title="t('analytics.teraDependencyTitle')" tone="amber">
        <p class="text-[11px] text-gray-300">{{ t('analytics.teraDependencyHint') }}</p>
        <div class="mt-2 grid grid-cols-4 gap-1.5 text-[10px]">
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.teraLevelUnassigned') }}:</span>
            <span class="ml-1 text-gray-200">{{ teraDependency.unassignedCount }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.teraLevelAutonomous') }}:</span>
            <span class="ml-1 text-emerald-200">{{ teraDependency.autonomousCount }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.teraLevelImproves') }}:</span>
            <span class="ml-1 text-amber-200">{{ teraDependency.improvesCount }}</span>
          </div>
          <div class="rounded border border-gray-700 bg-off-black/60 px-1.5 py-1">
            <span class="text-gray-300">{{ t('analytics.teraLevelCritical') }}:</span>
            <span class="ml-1 text-rose-200">{{ teraDependency.criticalCount }}</span>
          </div>
        </div>
        <div v-if="teraDependency.criticalMembers.length > 0" class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="entry in teraDependency.criticalMembers"
            :key="`tera-critical-${entry.slot}-${entry.pokemonId}`"
            class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
            :class="teraLevelClass(entry.level)"
          >
            <span>S{{ entry.slot }}</span>
            <span>{{ entry.pokemonName }}</span>
            <span>{{ teraLevelLabel(entry.level) }}</span>
          </span>
        </div>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('formula')" :title="t('analytics.scoreFormulaTitle')" tone="gray">
        <p class="text-[11px] text-sky-200">{{ scoreFormula }}</p>
        <p class="mt-1 text-[11px] text-gray-400">{{ t('analytics.scoreFormulaNoBenchmark') }}</p>
        <p class="mt-1 text-[11px] text-gray-500">
          {{ t('analytics.scorePointsLabel', { value: totalWeighted.toFixed(1) }) }} ({{ t('common.score') }} {{ analytics.totalScore }})
        </p>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('metaFit')" :title="t('analytics.metaFitTitle')" tone="cyan">
        <p class="text-[11px] text-gray-300">{{ t('analytics.metaFitHint') }}</p>
        <p v-if="metaStatus === 'loading'" class="mt-1 text-[11px] text-cyan-200">
          {{ t('analytics.metaLoading') }}
        </p>
        <p v-else-if="metaStatus === 'error'" class="mt-1 text-[11px] text-rose-300">
          {{ t('analytics.metaError', { message: metaError ?? 'unknown' }) }}
        </p>
        <template v-else>
          <p class="mt-1 text-[11px] text-gray-300">
            {{
              t('analytics.metaCoverage', {
                withMeta: metaFit.pokemonWithMeta,
                total: metaFit.teamSize,
                percent: metaFit.coverage,
              })
            }}
          </p>
          <p class="mt-1 text-[11px] text-gray-300">
            {{
              t('analytics.metaItemFit', {
                value: metaFit.itemFitValue === null ? '-' : metaFit.itemFitValue,
              })
            }}
          </p>
          <p class="mt-1 text-[11px] text-gray-300">
            {{
              t('analytics.metaMoveFit', {
                value: metaFit.moveFitValue === null ? '-' : metaFit.moveFitValue,
              })
            }}
          </p>
          <p class="mt-1 text-[11px] text-cyan-100">
            {{
              metaFit.metaFitScore === null
                ? t('analytics.metaUnavailable')
                : t('analytics.metaComposite', { value: metaFit.metaFitScore })
            }}
          </p>
        </template>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('threats')" :title="t('analytics.threatResponsesTitle')" tone="amber">
        <p class="text-[11px] text-gray-300">{{ t('analytics.threatResponsesHint') }}</p>
        <p class="mt-1 text-[11px] text-gray-300">
          {{ t('analytics.threatSummaryGood') }}:
          <span class="font-semibold text-emerald-200">{{ threatSummary.goodPercent }}%</span>
        </p>
        <p class="mt-1 text-[11px] text-gray-300">
          {{ t('analytics.threatSummaryCriticalCount') }}:
          <span class="font-semibold text-rose-200">{{ threatSummary.dangerCount }}</span>
        </p>
        <p class="mt-1 text-[11px] text-gray-300">
          {{ t('analytics.threatSummaryTotal') }}:
          <span class="font-semibold text-sky-200">{{ threatSummary.total }}</span>
        </p>
        <p class="mt-1 text-[11px] text-gray-400">
          {{
            threatSummary.dangerCount > 0
              ? t('analytics.threatSummaryCriticalTop', { names: criticalThreatNames })
              : t('analytics.threatSummaryCriticalNone')
          }}
        </p>
        <div v-if="threatRows.length > 0" class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="row in threatRows.slice(0, 6)"
            :key="`threat-mini-${row.threatId}`"
            class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
            :class="threatMiniClass(row.status)"
          >
            <span>{{ threatMiniLabel(row.status) }}</span>
            <span>{{ row.name }}</span>
          </span>
        </div>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('sources')" :title="t('analytics.sourceTitle')" tone="gray" :default-open="false">
        <ul class="list-disc space-y-1 pl-5 text-[11px] text-gray-400">
          <li>{{ t('analytics.sourceLocalTeam') }}</li>
          <li>{{ t('analytics.sourceTypeChart') }}</li>
          <li>{{ t('analytics.sourcePokeapi') }}</li>
          <li>{{ t('analytics.sourceMeta') }}</li>
        </ul>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('alerts')" :title="t('common.alerts')" tone="gray">
        <ul class="list-disc space-y-1 pl-5 text-xs text-gray-300">
          <li v-for="alert in combinedAlerts" :key="alert">{{ alert }}</li>
          <li v-if="combinedAlerts.length === 0">{{ t('common.none') }}</li>
        </ul>
      </InsightsBlock>

      <InsightsBlock v-if="hasSection('notes')" :title="t('builder.notes')" tone="gray">
        <textarea
          :value="team?.notes ?? ''"
          class="h-24 w-full resize-y rounded-lg border border-sky-500/30 bg-black/80 p-2 text-xs text-gray-100 outline-none transition focus:border-sky-400"
          :placeholder="t('builder.notesPlaceholder')"
          @input="updateNotes"
        />
      </InsightsBlock>

    </div>
  </section>
</template>
