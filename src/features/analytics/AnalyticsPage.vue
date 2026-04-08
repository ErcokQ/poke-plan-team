<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode, PokemonTypeKey, ScoreWeights, TeamMember } from '@/models/domain'
import type { ThreatResponseStatus } from '@/models/threats'
import type {
  PressureBand,
  SpeedBucketKey,
  SpeedProfileKey,
  TeraDependencyLevel,
  TeraDependencyReason,
  WeightPresetKey,
} from '@/stores/analytics'
import { TYPE_KEYS } from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
import { effectiveness, effectivenessAgainstDual } from '@/models/type-chart'
import TeamSlotPicker from '@/features/shared/components/TeamSlotPicker.vue'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDexStore } from '@/stores/dex'
import { useTeamStore } from '@/stores/team'
import { useUiStore } from '@/stores/ui'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'

const route = useRoute()
const { t, locale } = useI18n()
const analyticsStore = useAnalyticsStore()
const teamStore = useTeamStore()
const dexStore = useDexStore()
const uiStore = useUiStore()

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const team = computed(() => teamStore.getActiveTeam(mode.value))
const selectedSlot = computed<1 | 2 | 3 | 4 | 5 | 6>({
  get: () => uiStore.getSelectedSlot(mode.value),
  set: (slot) => uiStore.setSelectedSlot(mode.value, slot),
})

const member = computed(() => team.value.members.find((entry) => entry.slot === selectedSlot.value) ?? team.value.members[0])
const memberPokemon = computed(() => (member.value.pokemonId ? dexStore.getPokemon(mode.value, member.value.pokemonId) : undefined))

const memberAnalytics = computed(() => analyticsStore.getMemberAnalytics(mode.value, selectedSlot.value))
const teamAnalytics = computed(() => analyticsStore.getTeamAnalytics(mode.value))
const offensivePressure = computed(() => analyticsStore.getOffensivePressureSummary(mode.value))
const speedMap = computed(() => analyticsStore.getTeamSpeedMap(mode.value))
const teraDependency = computed(() => analyticsStore.getTeamTeraDependency(mode.value))
const threatRows = computed(() => analyticsStore.getThreatResponses(mode.value))
const threatSummary = computed(() => analyticsStore.getThreatResponseSummary(mode.value))
const breakerCount = computed(
  () =>
    offensivePressure.value.members.filter(
      (entry) => !entry.isWincon && !entry.isCloser && entry.damagingMoves >= 2 && entry.highPowerMoves >= 2,
    ).length,
)
const speedBucketOrder: SpeedBucketKey[] = ['slow', 'mid', 'fast', 'veryFast']
const offenseThresholdWinconText = computed(() =>
  mode.value === 'vgc'
    ? t('analytics.offensePressureThresholdWinconVgc')
    : t('analytics.offensePressureThresholdWinconSingles'),
)
const offenseThresholdCloserText = computed(() =>
  mode.value === 'vgc'
    ? t('analytics.offensePressureThresholdCloserVgc')
    : t('analytics.offensePressureThresholdCloserSingles'),
)

const speedMapProfileText = computed(() => {
  const profileLabel = speedProfileLabel(speedMap.value.profile)
  const supportLabel = speedSupportLabel()
  if (speedMap.value.total === 0) return t('analytics.speedMapEmpty')
  return t('analytics.speedMapProfile', { profile: profileLabel, support: supportLabel })
})

interface TeamTypeMemberEntry {
  slot: TeamMember['slot']
  pokemonId: string
  pokemonName: string
  factor: number
}

interface TeamDefenseTypeRow {
  type: PokemonTypeKey
  label: string
  weakCount: number
  resistCount: number
  immuneCount: number
  quadCount: number
  weakMembers: TeamTypeMemberEntry[]
  resistMembers: TeamTypeMemberEntry[]
}

interface TeamOffenseCoverageRow {
  type: PokemonTypeKey
  label: string
  coverageCount: number
  bestMultiplier: number
  hitters: TeamTypeMemberEntry[]
}

const teamMembersWithPokemon = computed(() => {
  return team.value.members
    .map((entry) => ({
      member: entry,
      pokemon: entry.pokemonId ? dexStore.getPokemon(mode.value, entry.pokemonId) : undefined,
    }))
    .filter(
      (entry): entry is { member: (typeof team.value.members)[number]; pokemon: NonNullable<ReturnType<typeof dexStore.getPokemon>> } =>
        Boolean(entry.pokemon),
    )
})

const teamDefenseTypeRows = computed<{
  weaknesses: TeamDefenseTypeRow[]
  resistances: TeamDefenseTypeRow[]
}>(() => {
  const rows: TeamDefenseTypeRow[] = TYPE_KEYS.map((type) => ({
    type,
    label: locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en,
    weakCount: 0,
    resistCount: 0,
    immuneCount: 0,
    quadCount: 0,
    weakMembers: [],
    resistMembers: [],
  }))

  for (const entry of teamMembersWithPokemon.value) {
    const typeA = entry.pokemon.types[0] ?? 'normal'
    const typeB = entry.pokemon.types[1]
    for (const row of rows) {
      const factor = effectivenessAgainstDual(row.type, typeA, typeB)
      if (factor >= 4) {
        row.weakCount += 1
        row.quadCount += 1
        row.weakMembers.push({
          slot: entry.member.slot,
          pokemonId: entry.member.pokemonId,
          pokemonName: entry.pokemon.name,
          factor,
        })
      } else if (factor > 1) {
        row.weakCount += 1
        row.weakMembers.push({
          slot: entry.member.slot,
          pokemonId: entry.member.pokemonId,
          pokemonName: entry.pokemon.name,
          factor,
        })
      } else if (factor === 0) {
        row.immuneCount += 1
        row.resistCount += 1
        row.resistMembers.push({
          slot: entry.member.slot,
          pokemonId: entry.member.pokemonId,
          pokemonName: entry.pokemon.name,
          factor,
        })
      } else if (factor < 1) {
        row.resistCount += 1
        row.resistMembers.push({
          slot: entry.member.slot,
          pokemonId: entry.member.pokemonId,
          pokemonName: entry.pokemon.name,
          factor,
        })
      }
    }
  }

  const weaknessRows = [...rows]
    .filter((row) => row.weakCount > 0)
    .sort((a, b) => b.weakCount - a.weakCount || b.quadCount - a.quadCount)
  const resistanceRows = [...rows]
    .filter((row) => row.resistCount > 0)
    .sort((a, b) => b.resistCount - a.resistCount || b.immuneCount - a.immuneCount)

  return {
    weaknesses: weaknessRows,
    resistances: resistanceRows,
  }
})

const teamOffenseCoverageRows = computed<TeamOffenseCoverageRow[]>(() => {
  const coverageMap = new Map<
    PokemonTypeKey,
    { hitters: Map<string, TeamTypeMemberEntry>; bestMultiplier: number }
  >()
  for (const type of TYPE_KEYS) {
    coverageMap.set(type, { hitters: new Map<string, TeamTypeMemberEntry>(), bestMultiplier: 0 })
  }

  for (const entry of teamMembersWithPokemon.value) {
    const seenForMember = new Set<PokemonTypeKey>()
    for (const moveId of entry.member.moves.filter(Boolean)) {
      const move = dexStore.getMove(moveId)
      if (!move || move.category === 'status') continue
      for (const targetType of TYPE_KEYS) {
        const mult = effectiveness(move.type, targetType)
        if (mult < 2) continue
        const bucket = coverageMap.get(targetType)
        if (!bucket) continue
        const key = `${entry.member.slot}:${entry.member.pokemonId}`
        if (!seenForMember.has(targetType)) {
          bucket.hitters.set(key, {
            slot: entry.member.slot,
            pokemonId: entry.member.pokemonId,
            pokemonName: entry.pokemon.name,
            factor: mult,
          })
          seenForMember.add(targetType)
        } else {
          const existing = bucket.hitters.get(key)
          if (existing && mult > existing.factor) {
            existing.factor = mult
          }
        }
        if (mult > bucket.bestMultiplier) bucket.bestMultiplier = mult
      }
    }
  }

  return TYPE_KEYS.map((type) => {
    const bucket = coverageMap.get(type)
    return {
      type,
      label: locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en,
      coverageCount: bucket?.hitters.size ?? 0,
      bestMultiplier: bucket?.bestMultiplier ?? 0,
      hitters: bucket ? [...bucket.hitters.values()] : [],
    }
  })
    .filter((row) => row.coverageCount > 0)
    .sort((a, b) => b.coverageCount - a.coverageCount || b.bestMultiplier - a.bestMultiplier)
})

function setWeight(key: keyof ScoreWeights, value: number) {
  analyticsStore.setWeight(key, value)
}

const weightPresets = computed<Array<{ key: WeightPresetKey; label: string }>>(() => [
  { key: 'balanced', label: t('analytics.presetBalanced') },
  { key: 'offense', label: t('analytics.presetOffense') },
  { key: 'defense', label: t('analytics.presetDefense') },
  { key: 'speed', label: t('analytics.presetSpeed') },
])

const activeTeamMap = ref<'plan' | 'tempo' | 'matchups' | 'resources'>('plan')
const showAllWeaknessTypes = ref(false)
const showAllResistanceTypes = ref(false)
const showAllCoveredTypes = ref(false)
const defaultTeamTypeLimit = 8

const visibleWeaknessTypes = computed(() => {
  if (showAllWeaknessTypes.value) return teamDefenseTypeRows.value.weaknesses
  return teamDefenseTypeRows.value.weaknesses.slice(0, defaultTeamTypeLimit)
})

const visibleResistanceTypes = computed(() => {
  if (showAllResistanceTypes.value) return teamDefenseTypeRows.value.resistances
  return teamDefenseTypeRows.value.resistances.slice(0, defaultTeamTypeLimit)
})

const visibleCoveredTypes = computed(() => {
  if (showAllCoveredTypes.value) return teamOffenseCoverageRows.value
  return teamOffenseCoverageRows.value.slice(0, defaultTeamTypeLimit)
})

const teamPillars = computed(() => [
  {
    key: 'plan' as const,
    label: t('analytics.pillarPlan'),
    score: teamAnalytics.value.planScore ?? teamAnalytics.value.roleBalance,
    diagnostic: teamAnalytics.value.pillarDiagnostics?.plan ?? t('analytics.pillarPlanFallback'),
  },
  {
    key: 'tempo' as const,
    label: t('analytics.pillarTempo'),
    score: teamAnalytics.value.tempoScore ?? teamAnalytics.value.speedControl,
    diagnostic: teamAnalytics.value.pillarDiagnostics?.tempo ?? t('analytics.pillarTempoFallback'),
  },
  {
    key: 'matchups' as const,
    label: t('analytics.pillarMatchups'),
    score: teamAnalytics.value.matchupScore ?? teamAnalytics.value.offenseCoverage,
    diagnostic:
      teamAnalytics.value.pillarDiagnostics?.matchups ?? t('analytics.pillarMatchupsFallback'),
  },
  {
    key: 'resources' as const,
    label: t('analytics.pillarResources'),
    score: teamAnalytics.value.resourcesScore ?? teamAnalytics.value.defenseCoverage,
    diagnostic:
      teamAnalytics.value.pillarDiagnostics?.resources ?? t('analytics.pillarResourcesFallback'),
  },
])

const teamMapRows = computed(() => {
  const weakRows = TYPE_KEYS.map((type) => ({
    type,
    label: locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en,
    base: teamAnalytics.value.baseWeaknesses?.[type] ?? 0,
    tera: teamAnalytics.value.weaknesses[type],
  }))
    .filter((entry) => entry.base > 0 || entry.tera > 0)
    .sort((a, b) => b.tera - a.tera || b.base - a.base)
  const resistRows = TYPE_KEYS.map((type) => ({
    type,
    label: locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en,
    base: teamAnalytics.value.baseResistances?.[type] ?? 0,
    tera: teamAnalytics.value.resistances[type],
  }))
    .filter((entry) => entry.base > 0 || entry.tera > 0)
    .sort((a, b) => b.tera - a.tera || b.base - a.base)

  return {
    weaknesses: weakRows.slice(0, 6),
    resistances: resistRows.slice(0, 6),
  }
})

function applyPreset(preset: WeightPresetKey) {
  analyticsStore.applyWeightPreset(preset)
}

function selectTeamMap(map: 'plan' | 'tempo' | 'matchups' | 'resources') {
  activeTeamMap.value = map
}

function threatStatusIcon(status: ThreatResponseStatus): string {
  if (status === 'good') return '✅'
  if (status === 'warning') return '⚠️'
  return '❗'
}

function threatStatusLabel(status: ThreatResponseStatus): string {
  if (status === 'good') return t('analytics.threatStatusGood')
  if (status === 'warning') return t('analytics.threatStatusWarning')
  return t('analytics.threatStatusDanger')
}

function threatStatusClass(status: ThreatResponseStatus): string {
  if (status === 'good') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
  if (status === 'warning') return 'border-amber-500/35 bg-amber-500/10 text-amber-200'
  return 'border-rose-500/35 bg-rose-500/10 text-rose-200'
}

function responderLevelClass(level: 'solid' | 'soft' | 'none'): string {
  if (level === 'solid') return 'border-emerald-500/35 text-emerald-200'
  if (level === 'soft') return 'border-amber-500/35 text-amber-200'
  return 'border-gray-700 text-gray-400'
}

function speedBucketLabel(bucket: SpeedBucketKey): string {
  if (bucket === 'slow') return t('analytics.speedBucketSlow')
  if (bucket === 'mid') return t('analytics.speedBucketMid')
  if (bucket === 'fast') return t('analytics.speedBucketFast')
  return t('analytics.speedBucketVeryFast')
}

function speedBucketClass(bucket: SpeedBucketKey): string {
  if (bucket === 'slow') return 'bg-indigo-500'
  if (bucket === 'mid') return 'bg-cyan-500'
  if (bucket === 'fast') return 'bg-sky-500'
  return 'bg-emerald-500'
}

function speedProfileLabel(profile: SpeedProfileKey): string {
  if (profile === 'slow') return t('analytics.speedProfileSlow')
  if (profile === 'mid') return t('analytics.speedProfileMid')
  if (profile === 'fast') return t('analytics.speedProfileFast')
  if (profile === 'veryFast') return t('analytics.speedProfileVeryFast')
  if (profile === 'mixed') return t('analytics.speedProfileMixed')
  return t('analytics.speedProfileEmpty')
}

function speedSupportLabel(): string {
  if (speedMap.value.hasTailwind && speedMap.value.hasTrickRoom) return t('analytics.speedSupportHybrid')
  if (speedMap.value.hasTailwind) return t('analytics.speedSupportTailwind')
  if (speedMap.value.hasTrickRoom) return t('analytics.speedSupportTrickRoom')
  if (speedMap.value.speedControlCount > 0) return t('analytics.speedSupportUtility')
  return t('analytics.speedSupportNone')
}

function speedBucketWidth(bucket: SpeedBucketKey): string {
  const count = speedMap.value.buckets[bucket].count
  if (speedMap.value.total === 0 || count === 0) return '0%'
  return `${Math.max(8, speedMap.value.buckets[bucket].percent)}%`
}

function teraLevelLabel(level: TeraDependencyLevel): string {
  if (level === 'critical') return t('analytics.teraLevelCritical')
  if (level === 'improves') return t('analytics.teraLevelImproves')
  if (level === 'unassigned') return t('analytics.teraLevelUnassigned')
  return t('analytics.teraLevelAutonomous')
}

function teraLevelClass(level: TeraDependencyLevel): string {
  if (level === 'critical') return 'border-rose-500/35 bg-rose-500/10 text-rose-200'
  if (level === 'improves') return 'border-amber-500/35 bg-amber-500/10 text-amber-200'
  if (level === 'unassigned') return 'border-gray-600 bg-gray-700/15 text-gray-300'
  return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
}

function teraReasonLabel(reason: TeraDependencyReason): string {
  if (reason === 'missing-tera') return t('analytics.teraReasonMissingTera')
  if (reason === 'defense-critical') return t('analytics.teraReasonDefenseCritical')
  if (reason === 'defense-patch') return t('analytics.teraReasonDefensePatch')
  if (reason === 'offense-spike') return t('analytics.teraReasonOffenseSpike')
  if (reason === 'mixed') return t('analytics.teraReasonMixed')
  return t('analytics.teraReasonNone')
}

function typeName(type: string): string {
  if (!type) return '-'
  if (!(type in TYPE_META)) return type
  return locale.value === 'es'
    ? TYPE_META[type as keyof typeof TYPE_META].es
    : TYPE_META[type as keyof typeof TYPE_META].en
}

function pokemonIconUrl(pokemonId: string): string {
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

function onPokemonIconError(event: Event) {
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

function factorLabel(factor: number): string {
  if (factor === 0) return 'x0'
  if (factor === 0.25) return 'x0.25'
  if (factor === 0.5) return 'x0.5'
  if (factor === 2) return 'x2'
  if (factor === 4) return 'x4'
  return `x${factor}`
}

function pressureBandLabel(band: PressureBand): string {
  if (band === 'high') return t('analytics.pressureBandHigh')
  if (band === 'medium') return t('analytics.pressureBandMedium')
  if (band === 'low') return t('analytics.pressureBandLow')
  if (band === 'na') return t('analytics.pressureBandNA')
  return t('analytics.pressureBandNone')
}

function pressureBandClass(band: PressureBand): string {
  if (band === 'high') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
  if (band === 'medium') return 'border-amber-500/35 bg-amber-500/10 text-amber-200'
  if (band === 'low') return 'border-orange-500/35 bg-orange-500/10 text-orange-200'
  if (band === 'na') return 'border-gray-600 bg-gray-700/15 text-gray-300'
  return 'border-rose-500/35 bg-rose-500/10 text-rose-200'
}

function contributionLabel(key: string): string {
  if (key === 'damageCoreVgc2') return t('analytics.offensePressureContributionDamageCoreVgc2')
  if (key === 'damageCoreVgc1') return t('analytics.offensePressureContributionDamageCoreVgc1')
  if (key === 'damageCoreVgc0') return t('analytics.offensePressureContributionDamageCoreVgc0')
  if (key === 'damageCoreSingles3') return t('analytics.offensePressureContributionDamageCoreSingles3')
  if (key === 'damageCoreSingles2setup') return t('analytics.offensePressureContributionDamageCoreSingles2Setup')
  if (key === 'damageCoreSinglesLow') return t('analytics.offensePressureContributionDamageCoreSinglesLow')
  if (key === 'powerHi2') return t('analytics.offensePressureContributionPowerHi2')
  if (key === 'powerHi1') return t('analytics.offensePressureContributionPowerHi1')
  if (key === 'powerSpreadVgc') return t('analytics.offensePressureContributionPowerSpreadVgc')
  if (key === 'powerStab') return t('analytics.offensePressureContributionPowerStab')
  if (key === 'turnFastVgc') return t('analytics.offensePressureContributionTurnFastVgc')
  if (key === 'turnNearTailwindVgc') return t('analytics.offensePressureContributionTurnNearTailwindVgc')
  if (key === 'turnPriority') return t('analytics.offensePressureContributionTurnPriority')
  if (key === 'turnTRCleaner') return t('analytics.offensePressureContributionTurnTrCleaner')
  if (key === 'turnSlowNoTR') return t('analytics.offensePressureContributionTurnSlowNoTr')
  if (key === 'turnFastSingles') return t('analytics.offensePressureContributionTurnFastSingles')
  if (key === 'turnScarfSingles') return t('analytics.offensePressureContributionTurnScarfSingles')
  if (key === 'setupMajor') return t('analytics.offensePressureContributionSetupMajor')
  if (key === 'setupMinor') return t('analytics.offensePressureContributionSetupMinor')
  if (key === 'setupBodyPress') return t('analytics.offensePressureContributionSetupBodyPress')
  if (key === 'boostImmediate') return t('analytics.offensePressureContributionBoostImmediate')
  if (key === 'consistencyProtectVgc') return t('analytics.offensePressureContributionConsistencyProtectVgc')
  if (key === 'consistencyRecoverySingles') return t('analytics.offensePressureContributionConsistencyRecoverySingles')
  if (key === 'utilityBloatPenalty') return t('analytics.offensePressureContributionUtilityBloatPenalty')
  if (key === 'planSetup') return t('analytics.offensePressureContributionPlanSetup')
  if (key === 'planConsistency') return t('analytics.offensePressureContributionPlanConsistency')
  if (key === 'planEnable') return t('analytics.offensePressureContributionPlanEnable')
  if (key === 'planTerrainWeather') return t('analytics.offensePressureContributionPlanTerrainWeather')
  if (key === 'closeTurnOrderVgc') return t('analytics.offensePressureContributionCloseTurnOrderVgc')
  if (key === 'closeTurnOrderSingles')
    return t('analytics.offensePressureContributionCloseTurnOrderSingles')
  if (key === 'closeHi2') return t('analytics.offensePressureContributionCloseHi2')
  if (key === 'closeSimpleButton') return t('analytics.offensePressureContributionCloseSimpleButton')
  if (key === 'closeProtectVgc') return t('analytics.offensePressureContributionCloseProtectVgc')
  if (key === 'frictionSetupNoEnable')
    return t('analytics.offensePressureContributionFrictionSetupNoEnable')
  if (key === 'frictionUtilityLowAtk')
    return t('analytics.offensePressureContributionFrictionUtilityLowAtk')
  if (key === 'frictionChoiceLock') return t('analytics.offensePressureContributionFrictionChoiceLock')
  if (key === 'frictionAccuracyRisk')
    return t('analytics.offensePressureContributionFrictionAccuracyRisk')
  if (key === 'frictionRecoilRisk') return t('analytics.offensePressureContributionFrictionRecoilRisk')
  if (key === 'frictionSelfDropRisk')
    return t('analytics.offensePressureContributionFrictionSelfDropRisk')
  if (key === 'frictionOneButton') return t('analytics.offensePressureContributionFrictionOneButton')
  return t('analytics.offensePressureContributionUnknown', { key })
}

function contributionClass(value: number): string {
  if (value > 0) return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
  if (value < 0) return 'border-rose-500/35 bg-rose-500/10 text-rose-200'
  return 'border-gray-600 bg-gray-700/15 text-gray-300'
}

function contributionValue(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
}

function pillarMapButtonClass(key: 'plan' | 'tempo' | 'matchups' | 'resources'): string {
  return activeTeamMap.value === key
    ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
    : 'border-gray-700 bg-off-black/70 text-gray-300 hover:border-sky-500/50'
}
</script>

<template>
  <section class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
    <h2 class="mb-4 text-lg font-semibold text-sky-300">{{ t('analytics.title') }}</h2>

    <TeamSlotPicker
      class="mb-4"
      :mode="mode"
      :members="team.members"
      :selected-slot="selectedSlot"
      :title="t('builder.teamPreview')"
      :show-count="true"
      @update:selected-slot="selectedSlot = $event"
    />

    <div class="grid gap-4 xl:grid-cols-2">
      <article class="rounded-xl border border-gray-700 bg-st-black/50 p-3">
        <h3 class="text-sm font-semibold text-gray-200">{{ t('analytics.individual') }}</h3>
        <p class="mt-1 text-sm text-gray-400">{{ memberPokemon?.name || t('analytics.emptySlot') }}</p>

        <template v-if="memberAnalytics">
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <div class="rounded-lg border border-fuchsia-500/35 bg-fuchsia-500/10 p-2">
              <p class="text-[11px] text-gray-300">{{ t('analytics.individualThreat') }}</p>
              <p class="text-xl font-semibold text-fuchsia-200">
                {{ (memberAnalytics.threatScore ?? 0).toFixed(1) }}
              </p>
              <p class="text-[10px] text-gray-400">{{ t('analytics.individualThreatHint') }}</p>
            </div>
            <div class="rounded-lg border border-cyan-500/35 bg-cyan-500/10 p-2">
              <p class="text-[11px] text-gray-300">{{ t('analytics.individualCloser') }}</p>
              <p class="text-xl font-semibold text-cyan-200">
                {{ (memberAnalytics.closerScore ?? 0).toFixed(1) }}
              </p>
              <p class="text-[10px] text-gray-400">{{ t('analytics.individualCloserHint') }}</p>
            </div>
            <div class="rounded-lg border border-sky-500/35 bg-sky-500/10 p-2">
              <p class="text-[11px] text-gray-300">{{ t('analytics.individualDefenseSplit') }}</p>
              <div class="mt-1 flex items-center gap-2 text-sm">
                <span class="rounded border border-gray-600 px-1.5 py-0.5 text-sky-100">
                  {{ t('analytics.defenseBaseShort') }} {{ memberAnalytics.defenseBaseScore ?? 0 }}
                </span>
                <span class="rounded border border-gray-600 px-1.5 py-0.5 text-sky-100">
                  {{ t('analytics.defenseTeraShort') }} {{ memberAnalytics.defenseTeraScore ?? 0 }}
                </span>
              </div>
              <p class="text-[10px] text-gray-400">{{ t('analytics.individualDefenseHint') }}</p>
            </div>
            <div class="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2">
              <p class="text-[11px] text-gray-300">{{ t('analytics.individualRoleFit') }}</p>
              <p class="text-xl font-semibold text-emerald-200">
                {{ memberAnalytics.roleFitScore ?? memberAnalytics.score }}
              </p>
              <p class="text-[10px] text-gray-400">{{ t('analytics.individualRoleFitHint') }}</p>
            </div>
          </div>

          <div class="mt-3 rounded-lg border border-gray-700 bg-off-black/40 p-2">
            <p class="text-xs font-semibold text-gray-200">{{ t('analytics.individualWhy') }}</p>
            <div class="mt-2 grid gap-2 lg:grid-cols-3">
              <div>
                <p class="text-[11px] text-emerald-200">{{ t('analytics.individualStrengths') }}</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="entry in memberAnalytics.strengths ?? []"
                    :key="`strength-${entry}`"
                    class="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-100"
                  >
                    {{ entry }}
                  </span>
                  <span
                    v-if="(memberAnalytics.strengths ?? []).length === 0"
                    class="text-[10px] text-gray-500"
                  >
                    {{ t('common.none') }}
                  </span>
                </div>
              </div>
              <div>
                <p class="text-[11px] text-amber-200">{{ t('analytics.individualRisks') }}</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="entry in memberAnalytics.risks ?? []"
                    :key="`risk-${entry}`"
                    class="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-100"
                  >
                    {{ entry }}
                  </span>
                  <span v-if="(memberAnalytics.risks ?? []).length === 0" class="text-[10px] text-gray-500">
                    {{ t('common.none') }}
                  </span>
                </div>
              </div>
              <div>
                <p class="text-[11px] text-sky-200">{{ t('analytics.individualActions') }}</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="entry in memberAnalytics.actions ?? []"
                    :key="`action-${entry}`"
                    class="rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-100"
                  >
                    {{ entry }}
                  </span>
                  <span v-if="(memberAnalytics.actions ?? []).length === 0" class="text-[10px] text-gray-500">
                    {{ t('common.none') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </article>

      <article class="rounded-xl border border-gray-700 bg-st-black/50 p-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-200">{{ t('analytics.team') }}</h3>
            <p class="mt-1 text-[11px] text-gray-400">{{ t('analytics.teamPillarsHint') }}</p>
          </div>
          <div class="rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-right">
            <p class="text-[10px] text-gray-300">{{ t('common.score') }}</p>
            <p class="text-lg font-semibold text-sky-200">{{ teamAnalytics.totalScore }}</p>
          </div>
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div
            v-for="pillar in teamPillars"
            :key="pillar.key"
            class="rounded-lg border border-gray-700 bg-off-black/55 p-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-semibold text-gray-100">{{ pillar.label }}</p>
              <span class="text-sm font-semibold text-sky-200">{{ pillar.score }}</span>
            </div>
            <p class="mt-1 text-[10px] text-gray-400">{{ pillar.diagnostic }}</p>
            <button
              type="button"
              class="mt-2 rounded-md border px-2 py-1 text-[10px]"
              :class="pillarMapButtonClass(pillar.key)"
              @click="selectTeamMap(pillar.key)"
            >
              {{ t('analytics.viewMap') }}
            </button>
          </div>
        </div>

        <div class="mt-3 rounded-lg border border-gray-700 bg-off-black/45 p-2">
          <template v-if="activeTeamMap === 'plan'">
            <p class="text-xs font-semibold text-gray-200">{{ t('analytics.pillarPlanMapTitle') }}</p>
            <div class="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                <span class="text-gray-300">{{ t('analytics.offensePressureWincons') }}:</span>
                <span class="ml-1 text-fuchsia-200">{{ offensivePressure.winconCount }}</span>
              </div>
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                <span class="text-gray-300">{{ t('analytics.offensePressureClosers') }}:</span>
                <span class="ml-1 text-cyan-200">{{ offensivePressure.closerCount }}</span>
              </div>
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                <span class="text-gray-300">{{ t('analytics.pillarPlanMapBreakers') }}:</span>
                <span class="ml-1 text-amber-200">{{ breakerCount }}</span>
              </div>
            </div>
          </template>

          <template v-else-if="activeTeamMap === 'tempo'">
            <p class="text-xs font-semibold text-gray-200">{{ t('analytics.pillarTempoMapTitle') }}</p>
            <p class="mt-1 text-[11px] text-cyan-200">{{ speedMapProfileText }}</p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.pillarTempoMapTailwind') }}: {{ speedMap.hasTailwind ? t('analytics.pillarYes') : t('analytics.pillarNo') }}
              </div>
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.pillarTempoMapTrickRoom') }}: {{ speedMap.hasTrickRoom ? t('analytics.pillarYes') : t('analytics.pillarNo') }}
              </div>
            </div>
          </template>

          <template v-else-if="activeTeamMap === 'matchups'">
            <p class="text-xs font-semibold text-gray-200">{{ t('analytics.pillarMatchupsMapTitle') }}</p>
            <div class="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.pillarMatchupsOffense') }}: {{ teamAnalytics.matchupOffenseScore ?? teamAnalytics.offenseCoverage }}
              </div>
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.defenseBaseShort') }}: {{ teamAnalytics.matchupDefenseBaseScore ?? 0 }}
              </div>
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.defenseTeraShort') }}: {{ teamAnalytics.matchupDefenseTeraScore ?? teamAnalytics.defenseCoverage }}
              </div>
            </div>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <div class="rounded border border-red-500/30 bg-red-500/5 p-2">
                <p class="text-[11px] text-red-200">{{ t('analytics.weaknesses') }}</p>
                <div class="mt-1 space-y-1">
                  <div
                    v-for="entry in teamMapRows.weaknesses"
                    :key="`map-weak-${entry.type}`"
                    class="flex items-center justify-between text-[10px] text-gray-200"
                  >
                    <span>{{ entry.label }}</span>
                    <span>{{ t('analytics.defenseBaseShort') }} {{ entry.base }} / {{ t('analytics.defenseTeraShort') }} {{ entry.tera }}</span>
                  </div>
                </div>
              </div>
              <div class="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                <p class="text-[11px] text-emerald-200">{{ t('analytics.resistances') }}</p>
                <div class="mt-1 space-y-1">
                  <div
                    v-for="entry in teamMapRows.resistances"
                    :key="`map-res-${entry.type}`"
                    class="flex items-center justify-between text-[10px] text-gray-200"
                  >
                    <span>{{ entry.label }}</span>
                    <span>{{ t('analytics.defenseBaseShort') }} {{ entry.base }} / {{ t('analytics.defenseTeraShort') }} {{ entry.tera }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="text-xs font-semibold text-gray-200">{{ t('analytics.pillarResourcesMapTitle') }}</p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.teraLevelCritical') }}: {{ teraDependency.criticalCount }}
              </div>
              <div class="rounded border border-gray-700 bg-st-black/60 px-2 py-1">
                {{ t('analytics.teraLevelUnassigned') }}: {{ teraDependency.unassignedCount }}
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="entry in teraDependency.criticalMembers"
                :key="`resource-critical-${entry.slot}-${entry.pokemonId}`"
                class="rounded border border-rose-500/35 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-100"
              >
                S{{ entry.slot }} {{ entry.pokemonName }}
              </span>
            </div>
          </template>
        </div>

        <div class="mt-3 rounded-lg border border-gray-700 p-3">
          <h4 class="text-xs font-semibold text-gray-300">{{ t('analytics.weights') }}</h4>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="preset in weightPresets"
              :key="preset.key"
              type="button"
              class="rounded-md border border-gray-700 bg-off-black/70 px-2 py-1 text-[11px] text-gray-200 hover:border-sky-500/60"
              @click="applyPreset(preset.key)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="mt-2 space-y-2 text-xs">
            <label class="block">
              <div class="mb-1 flex justify-between">
                <span>{{ t('analytics.pillarMatchups') }}</span>
                <span>{{ analyticsStore.weights.offenseCoverage }}</span>
              </div>
              <input
                class="w-full"
                type="range"
                min="0"
                max="100"
                :value="analyticsStore.weights.offenseCoverage"
                @input="setWeight('offenseCoverage', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between">
                <span>{{ t('analytics.pillarResources') }}</span>
                <span>{{ analyticsStore.weights.defenseCoverage }}</span>
              </div>
              <input
                class="w-full"
                type="range"
                min="0"
                max="100"
                :value="analyticsStore.weights.defenseCoverage"
                @input="setWeight('defenseCoverage', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between">
                <span>{{ t('analytics.pillarPlan') }}</span>
                <span>{{ analyticsStore.weights.roleBalance }}</span>
              </div>
              <input
                class="w-full"
                type="range"
                min="0"
                max="100"
                :value="analyticsStore.weights.roleBalance"
                @input="setWeight('roleBalance', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between">
                <span>{{ t('analytics.pillarTempo') }}</span>
                <span>{{ analyticsStore.weights.speedControl }}</span>
              </div>
              <input
                class="w-full"
                type="range"
                min="0"
                max="100"
                :value="analyticsStore.weights.speedControl"
                @input="setWeight('speedControl', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
          </div>
        </div>
      </article>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-3">
      <article class="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
        <h3 class="text-sm font-semibold text-rose-200">{{ t('analytics.teamWeaknessWidgetTitle') }}</h3>
        <p class="mt-1 text-[11px] text-gray-400">{{ t('analytics.teamWeaknessWidgetHint') }}</p>
        <p v-if="teamDefenseTypeRows.weaknesses.length > 0" class="mt-1 text-[11px] text-rose-100">
          {{ t('analytics.teamWeaknessCount', { covered: teamDefenseTypeRows.weaknesses.length, total: 18 }) }}
        </p>
        <ul
          v-if="teamDefenseTypeRows.weaknesses.length > 0"
          class="mt-2 space-y-1.5 pr-1"
          :class="showAllWeaknessTypes ? 'max-h-72 overflow-y-auto' : ''"
        >
          <li
            v-for="row in visibleWeaknessTypes"
            :key="`team-weak-${row.type}`"
            class="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-gray-700 bg-off-black/60 px-2 py-1.5 text-xs"
          >
            <div class="flex min-w-0 items-center gap-1.5">
              <img :src="TYPE_META[row.type].icon" :alt="row.label" class="h-4 w-4 shrink-0" />
              <span class="truncate text-gray-100">{{ row.label }}</span>
            </div>
            <span class="rounded border border-rose-500/35 bg-rose-500/10 px-1.5 py-0.5 text-rose-100">
              {{ row.weakCount }}
            </span>
            <div class="relative group">
              <button class="rounded border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
                {{ t('analytics.teamTypeViewPop') }}
              </button>
              <div
                class="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-56 rounded-md border border-gray-600 bg-off-black/95 p-2 text-[10px] text-gray-200 shadow-lg group-hover:block"
              >
                <p class="mb-1 font-semibold text-rose-200">{{ t('analytics.teamTypeWeakSlots') }}</p>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="entry in row.weakMembers"
                    :key="`weak-pop-${row.type}-${entry.slot}-${entry.pokemonId}`"
                    class="inline-flex items-center gap-1 rounded border border-rose-500/35 bg-rose-500/10 px-1 py-0.5"
                  >
                    <img
                      :src="pokemonIconUrl(entry.pokemonId)"
                      :alt="entry.pokemonName"
                      class="h-3.5 w-3.5"
                      @error="onPokemonIconError"
                    />
                    <span>S{{ entry.slot }} {{ entry.pokemonName }}</span>
                    <span class="text-rose-200">{{ factorLabel(entry.factor) }}</span>
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ul>
        <button
          v-if="teamDefenseTypeRows.weaknesses.length > defaultTeamTypeLimit"
          type="button"
          class="mt-2 rounded border border-gray-600 bg-off-black/70 px-2 py-1 text-[11px] text-gray-200 hover:border-sky-500/60"
          @click="showAllWeaknessTypes = !showAllWeaknessTypes"
        >
          {{ showAllWeaknessTypes ? t('analytics.teamTypeShowLess') : t('analytics.teamTypeShowAll') }}
        </button>
        <p v-else class="mt-2 text-xs text-gray-500">{{ t('common.none') }}</p>
      </article>

      <article class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <h3 class="text-sm font-semibold text-emerald-200">{{ t('analytics.teamResistanceWidgetTitle') }}</h3>
        <p class="mt-1 text-[11px] text-gray-400">{{ t('analytics.teamResistanceWidgetHint') }}</p>
        <p v-if="teamDefenseTypeRows.resistances.length > 0" class="mt-1 text-[11px] text-emerald-100">
          {{ t('analytics.teamResistanceCount', { covered: teamDefenseTypeRows.resistances.length, total: 18 }) }}
        </p>
        <ul
          v-if="teamDefenseTypeRows.resistances.length > 0"
          class="mt-2 space-y-1.5 pr-1"
          :class="showAllResistanceTypes ? 'max-h-72 overflow-y-auto' : ''"
        >
          <li
            v-for="row in visibleResistanceTypes"
            :key="`team-res-${row.type}`"
            class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded border border-gray-700 bg-off-black/60 px-2 py-1.5 text-xs"
          >
            <div class="flex min-w-0 items-center gap-1.5">
              <img :src="TYPE_META[row.type].icon" :alt="row.label" class="h-4 w-4 shrink-0" />
              <span class="truncate text-gray-100">{{ row.label }}</span>
            </div>
            <span class="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-100">
              {{ row.resistCount }}
            </span>
            <span class="rounded border border-cyan-500/35 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-100">
              {{ row.immuneCount }} {{ t('analytics.teamTypeImmuneShort') }}
            </span>
            <div class="relative group">
              <button class="rounded border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
                {{ t('analytics.teamTypeViewPop') }}
              </button>
              <div
                class="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-56 rounded-md border border-gray-600 bg-off-black/95 p-2 text-[10px] text-gray-200 shadow-lg group-hover:block"
              >
                <p class="mb-1 font-semibold text-emerald-200">{{ t('analytics.teamTypeResistSlots') }}</p>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="entry in row.resistMembers"
                    :key="`res-pop-${row.type}-${entry.slot}-${entry.pokemonId}`"
                    class="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/10 px-1 py-0.5"
                  >
                    <img
                      :src="pokemonIconUrl(entry.pokemonId)"
                      :alt="entry.pokemonName"
                      class="h-3.5 w-3.5"
                      @error="onPokemonIconError"
                    />
                    <span>S{{ entry.slot }} {{ entry.pokemonName }}</span>
                    <span class="text-emerald-200">{{ factorLabel(entry.factor) }}</span>
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ul>
        <button
          v-if="teamDefenseTypeRows.resistances.length > defaultTeamTypeLimit"
          type="button"
          class="mt-2 rounded border border-gray-600 bg-off-black/70 px-2 py-1 text-[11px] text-gray-200 hover:border-sky-500/60"
          @click="showAllResistanceTypes = !showAllResistanceTypes"
        >
          {{ showAllResistanceTypes ? t('analytics.teamTypeShowLess') : t('analytics.teamTypeShowAll') }}
        </button>
        <p v-else class="mt-2 text-xs text-gray-500">{{ t('common.none') }}</p>
      </article>

      <article class="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
        <h3 class="text-sm font-semibold text-sky-200">{{ t('analytics.teamCoverageWidgetTitle') }}</h3>
        <p class="mt-1 text-[11px] text-gray-400">{{ t('analytics.teamCoverageWidgetHint') }}</p>
        <p v-if="teamOffenseCoverageRows.length > 0" class="mt-1 text-[11px] text-sky-100">
          {{ t('analytics.teamCoverageCount', { covered: teamOffenseCoverageRows.length, total: 18 }) }}
        </p>
        <ul
          v-if="teamOffenseCoverageRows.length > 0"
          class="mt-2 space-y-1.5 pr-1"
          :class="showAllCoveredTypes ? 'max-h-72 overflow-y-auto' : ''"
        >
          <li
            v-for="row in visibleCoveredTypes"
            :key="`team-cover-${row.type}`"
            class="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-gray-700 bg-off-black/60 px-2 py-1.5 text-xs"
          >
            <div class="flex min-w-0 items-center gap-1.5">
              <img :src="TYPE_META[row.type].icon" :alt="row.label" class="h-4 w-4 shrink-0" />
              <span class="truncate text-gray-100">{{ row.label }}</span>
            </div>
            <span class="rounded border border-sky-500/35 bg-sky-500/10 px-1.5 py-0.5 text-sky-100">
              {{ row.coverageCount }} {{ t('analytics.teamCoverageHittersShort') }}
            </span>
            <div class="relative group">
              <button class="rounded border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
                x{{ row.bestMultiplier }}
              </button>
              <div
                class="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-56 rounded-md border border-gray-600 bg-off-black/95 p-2 text-[10px] text-gray-200 shadow-lg group-hover:block"
              >
                <p class="mb-1 font-semibold text-sky-200">{{ t('analytics.teamCoverageSlots') }}</p>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="entry in row.hitters"
                    :key="`cover-pop-${row.type}-${entry.slot}-${entry.pokemonId}`"
                    class="inline-flex items-center gap-1 rounded border border-sky-500/35 bg-sky-500/10 px-1 py-0.5"
                  >
                    <img
                      :src="pokemonIconUrl(entry.pokemonId)"
                      :alt="entry.pokemonName"
                      class="h-3.5 w-3.5"
                      @error="onPokemonIconError"
                    />
                    <span>S{{ entry.slot }} {{ entry.pokemonName }}</span>
                    <span class="text-sky-200">{{ factorLabel(entry.factor) }}</span>
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ul>
        <button
          v-if="teamOffenseCoverageRows.length > defaultTeamTypeLimit"
          type="button"
          class="mt-2 rounded border border-gray-600 bg-off-black/70 px-2 py-1 text-[11px] text-gray-200 hover:border-sky-500/60"
          @click="showAllCoveredTypes = !showAllCoveredTypes"
        >
          {{ showAllCoveredTypes ? t('analytics.teamTypeShowLess') : t('analytics.teamTypeShowAll') }}
        </button>
        <p v-else class="mt-2 text-xs text-gray-500">{{ t('common.none') }}</p>
      </article>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-2">
      <article class="rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/5 p-3 xl:col-span-2">
        <h3 class="text-sm font-semibold text-fuchsia-200">{{ t('analytics.offensePressureTitle') }}</h3>
        <p class="mt-1 text-xs text-gray-300">{{ t('analytics.offensePressureHint') }}</p>

        <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.offensePressureWincons') }}</p>
            <p class="text-xl font-semibold text-fuchsia-200">{{ offensivePressure.winconCount }}</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.offensePressureClosers') }}</p>
            <p class="text-xl font-semibold text-sky-200">{{ offensivePressure.closerCount }}</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.offensePressureSpread') }}</p>
            <span class="mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs" :class="pressureBandClass(offensivePressure.spreadPressure)">
              {{ pressureBandLabel(offensivePressure.spreadPressure) }}
            </span>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.offensePressurePivoting') }}</p>
            <span class="mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs" :class="pressureBandClass(offensivePressure.pivoting)">
              {{ pressureBandLabel(offensivePressure.pivoting) }}
            </span>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.offensePressureRedirection') }}</p>
            <span class="mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs" :class="pressureBandClass(offensivePressure.redirection)">
              {{ pressureBandLabel(offensivePressure.redirection) }}
            </span>
          </div>
        </div>

        <div v-if="offensivePressure.winconMembers.length > 0" class="mt-3">
          <p class="text-xs text-gray-300">{{ t('analytics.offensePressureWinconList') }}</p>
          <div class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="entry in offensivePressure.winconMembers"
              :key="`wincon-${entry.slot}-${entry.pokemonId}`"
              class="inline-flex items-center gap-1 rounded border border-fuchsia-500/35 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] text-fuchsia-100"
            >
              <span>S{{ entry.slot }}</span>
              <span>{{ entry.pokemonName }}</span>
            </span>
          </div>
        </div>

        <div v-if="offensivePressure.members.length > 0" class="mt-3 rounded-lg border border-gray-700 bg-off-black/40 p-2">
          <div class="mb-1 flex items-center justify-between">
            <p class="text-xs font-semibold text-gray-200">{{ t('analytics.offensePressureSlotBreakdown') }}</p>
            <span class="text-[10px] text-gray-400">{{ t('analytics.offensePressureThresholds') }}</span>
          </div>
          <p class="mb-2 text-[10px] text-gray-400">{{ t('analytics.offensePressureSlotBreakdownHint') }}</p>
          <div class="space-y-2">
            <details
              v-for="entry in offensivePressure.members"
              :key="`offense-slot-${entry.slot}-${entry.pokemonId}`"
              class="rounded-md border border-gray-700 bg-st-black/55 p-1.5"
            >
              <summary class="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
                <span class="min-w-0 truncate text-gray-100">S{{ entry.slot }} - {{ entry.pokemonName }}</span>
                <div class="flex items-center gap-1">
                  <span
                    class="rounded border border-gray-600 px-1.5 py-0.5 text-[10px] text-sky-200"
                    :title="t('analytics.offensePressureScoreThreat')"
                  >
                    T {{ entry.threatScore.toFixed(1) }}
                  </span>
                  <span
                    class="rounded border border-fuchsia-500/40 px-1.5 py-0.5 text-[10px] text-fuchsia-200"
                    :title="t('analytics.offensePressureScoreWincon')"
                  >
                    W {{ entry.winconScore.toFixed(1) }}
                  </span>
                  <span
                    class="rounded border border-cyan-500/40 px-1.5 py-0.5 text-[10px] text-cyan-200"
                    :title="t('analytics.offensePressureScoreCloser')"
                  >
                    C {{ entry.closerScore.toFixed(1) }}
                  </span>
                  <span v-if="entry.isWincon" class="rounded border border-fuchsia-500/40 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
                    Wincon
                  </span>
                  <span v-if="entry.isCloser" class="rounded border border-cyan-500/40 px-1.5 py-0.5 text-[10px] text-cyan-200">
                    Closer
                  </span>
                </div>
              </summary>

              <div class="mt-2 space-y-2 border-t border-gray-800/80 pt-2">
                <div class="grid gap-1 text-[10px] text-gray-300 sm:grid-cols-2 lg:grid-cols-4">
                  <div class="rounded border border-gray-700 px-1.5 py-1">
                    {{ t('analytics.offensePressureDetailSpeed') }}: {{ entry.speedValue }} / {{ entry.speedBenchmark }}
                  </div>
                  <div class="rounded border border-gray-700 px-1.5 py-1">
                    {{ t('analytics.offensePressureDetailDamageMoves') }}: {{ entry.damagingMoves }}
                  </div>
                  <div class="rounded border border-gray-700 px-1.5 py-1">
                    {{ t('analytics.offensePressureDetailHighPower') }}: {{ entry.highPowerMoves }}
                  </div>
                  <div class="rounded border border-gray-700 px-1.5 py-1">
                    {{ t('analytics.offensePressureDetailUtility') }}: {{ entry.utilityStatusCount }}
                  </div>
                </div>

                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="contribution in entry.contributions"
                    :key="`${entry.slot}-${entry.pokemonId}-${contribution.key}`"
                    class="rounded border px-1.5 py-0.5 text-[10px]"
                    :class="contributionClass(contribution.value)"
                  >
                    {{ contributionValue(contribution.value) }} {{ contributionLabel(contribution.key) }}
                  </span>
                </div>

                <div class="grid gap-1 text-[10px] text-gray-400 sm:grid-cols-2">
                  <p>{{ offenseThresholdWinconText }}</p>
                  <p>{{ offenseThresholdCloserText }}</p>
                </div>
              </div>
            </details>
          </div>
        </div>
      </article>

      <article class="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 xl:col-span-2">
        <h3 class="text-sm font-semibold text-amber-200">{{ t('analytics.teraDependencyTitle') }}</h3>
        <p class="mt-1 text-xs text-gray-300">{{ t('analytics.teraDependencyHint') }}</p>

        <div class="mt-3 grid gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.teraLevelUnassigned') }}</p>
            <p class="text-xl font-semibold text-gray-200">{{ teraDependency.unassignedCount }}</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.teraLevelAutonomous') }}</p>
            <p class="text-xl font-semibold text-emerald-200">{{ teraDependency.autonomousCount }}</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.teraLevelImproves') }}</p>
            <p class="text-xl font-semibold text-amber-200">{{ teraDependency.improvesCount }}</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.teraLevelCritical') }}</p>
            <p class="text-xl font-semibold text-rose-200">{{ teraDependency.criticalCount }}</p>
          </div>
        </div>

        <div class="mt-3 overflow-x-auto rounded-lg border border-gray-700">
          <table class="min-w-full text-left text-xs">
            <thead class="bg-off-black/80 text-gray-300">
              <tr>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.teraColumnSlot') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.teraColumnPokemon') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('builder.teraType') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.threatColumnStatus') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.teraDependencyReason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in teraDependency.members"
                :key="`tera-dep-${entry.slot}-${entry.pokemonId}`"
                class="border-t border-gray-800/70 bg-st-black/50"
              >
                <td class="px-2 py-2 text-gray-200">S{{ entry.slot }}</td>
                <td class="px-2 py-2 text-gray-100">{{ entry.pokemonName }}</td>
                <td class="px-2 py-2 text-gray-200">{{ entry.teraType ? typeName(entry.teraType) : '-' }}</td>
                <td class="px-2 py-2">
                  <span class="inline-flex items-center rounded-md border px-2 py-0.5" :class="teraLevelClass(entry.level)">
                    {{ teraLevelLabel(entry.level) }}
                  </span>
                </td>
                <td class="px-2 py-2 text-gray-300">{{ teraReasonLabel(entry.reason) }}</td>
              </tr>
              <tr v-if="teraDependency.members.length === 0">
                <td colspan="5" class="px-2 py-3 text-center text-gray-500">
                  {{ t('analytics.teraDependencyEmpty') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="rounded-xl border border-sky-500/35 bg-sky-500/5 p-3 xl:col-span-2">
        <h3 class="text-sm font-semibold text-sky-200">{{ t('analytics.speedMapTitle') }}</h3>
        <p class="mt-1 text-xs text-gray-300">{{ t('analytics.speedMapHint', { level: speedMap.level }) }}</p>
        <p class="mt-1 text-xs text-cyan-200">{{ speedMapProfileText }}</p>

        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div
            v-for="bucket in speedBucketOrder"
            :key="`speed-bucket-${bucket}`"
            class="rounded-lg border border-gray-700 bg-st-black/50 p-2"
          >
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="text-gray-200">{{ speedBucketLabel(bucket) }}</span>
              <span class="text-sky-200">{{ speedMap.buckets[bucket].count }}/{{ speedMap.total }}</span>
            </div>
            <div class="h-2 rounded-full bg-gray-800">
              <div
                class="h-full rounded-full"
                :class="speedBucketClass(bucket)"
                :style="{ width: speedBucketWidth(bucket) }"
              />
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="entry in speedMap.buckets[bucket].members"
                :key="`speed-slot-${bucket}-${entry.slot}`"
                class="inline-flex items-center gap-1 rounded border border-gray-600 bg-off-black/70 px-1.5 py-0.5 text-[10px] text-gray-200"
              >
                <span>S{{ entry.slot }}</span>
                <span>{{ entry.pokemonName }}</span>
                <span class="text-sky-200">({{ entry.finalSpeed }})</span>
              </span>
            </div>
          </div>
        </div>
      </article>

      <article class="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 xl:col-span-2">
        <h3 class="text-sm font-semibold text-cyan-200">{{ t('analytics.threatResponsesTitle') }}</h3>
        <p class="mt-1 text-xs text-gray-300">{{ t('analytics.threatResponsesHint') }}</p>

        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.threatSummaryGood') }}</p>
            <p class="text-xl font-semibold text-emerald-200">{{ threatSummary.goodPercent }}%</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.threatSummaryCriticalCount') }}</p>
            <p class="text-xl font-semibold text-rose-200">{{ threatSummary.dangerCount }}</p>
          </div>
          <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
            <p class="text-[11px] text-gray-400">{{ t('analytics.threatSummaryTotal') }}</p>
            <p class="text-xl font-semibold text-sky-200">{{ threatSummary.total }}</p>
          </div>
        </div>

        <div class="mt-3 overflow-x-auto rounded-lg border border-gray-700">
          <table class="min-w-full text-left text-xs">
            <thead class="bg-off-black/80 text-gray-300">
              <tr>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.threatColumnThreat') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.threatColumnSolid') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.threatColumnSoft') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.threatColumnStatus') }}</th>
                <th class="px-2 py-2 font-semibold">{{ t('analytics.threatColumnResponders') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in threatRows"
                :key="row.threatId"
                class="border-t border-gray-800/70 bg-st-black/50"
              >
                <td class="px-2 py-2 text-gray-100">{{ row.name }}</td>
                <td class="px-2 py-2 text-emerald-200">{{ row.solidCount }}</td>
                <td class="px-2 py-2 text-amber-200">{{ row.softCount }}</td>
                <td class="px-2 py-2">
                  <span
                    class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5"
                    :class="threatStatusClass(row.status)"
                  >
                    <span>{{ threatStatusIcon(row.status) }}</span>
                    <span>{{ threatStatusLabel(row.status) }}</span>
                  </span>
                </td>
                <td class="px-2 py-2">
                  <div v-if="row.topResponders.length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="responder in row.topResponders"
                      :key="`${row.threatId}-${responder.slot}-${responder.pokemonId}`"
                      class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5"
                      :class="responderLevelClass(responder.level)"
                    >
                      <span class="text-[10px]">S{{ responder.slot }}</span>
                      <span>{{ responder.pokemonName }}</span>
                    </span>
                  </div>
                  <span v-else class="text-gray-500">{{ t('common.none') }}</span>
                </td>
              </tr>
              <tr v-if="threatRows.length === 0">
                <td colspan="5" class="px-2 py-3 text-center text-gray-500">
                  {{ t('analytics.threatNoRows') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

    </div>
  </section>
</template>

