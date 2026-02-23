<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode, PokemonTypeKey, TeamMember } from '@/models/domain'
import { TYPE_KEYS } from '@/models/domain'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { TYPE_META } from '@/models/type-meta'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDexStore } from '@/stores/dex'
import { useTeamStore } from '@/stores/team'
import RightSidebarBlock from './RightSidebarBlock.vue'

interface SharedWeaknessRow {
  type: PokemonTypeKey
  weak: number
  res: number
  imm: number
  quad: number
  affectedMembers: Array<{
    slot: TeamMember['slot']
    pokemonId: string
    pokemonName: string
    factor: number
  }>
  severity: number
}

const route = useRoute()
const { t, locale } = useI18n()
const analyticsStore = useAnalyticsStore()
const teamStore = useTeamStore()
const dexStore = useDexStore()

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const team = computed(() => teamStore.getActiveTeam(mode.value))
const teamAnalytics = computed(() => analyticsStore.getTeamAnalytics(mode.value))
const teraDependency = computed(() => analyticsStore.getTeamTeraDependency(mode.value))
const selectedWeaknessType = ref<PokemonTypeKey | null>(null)

const teamMembers = computed(() =>
  team.value.members.filter((member) => Boolean(member.pokemonId)),
)

const protectCount = computed(
  () => teamMembers.value.filter((member) => member.moves.includes('protect')).length,
)

const sharedWeaknessRows = computed<SharedWeaknessRow[]>(() => {
  const rows: SharedWeaknessRow[] = []
  for (const attackType of TYPE_KEYS) {
    let weak = 0
    let res = 0
    let imm = 0
    let quad = 0
    const affectedMembers: SharedWeaknessRow['affectedMembers'] = []

    for (const member of teamMembers.value) {
      const pokemon = dexStore.getPokemon(mode.value, member.pokemonId)
      if (!pokemon) continue
      // Defensive shared-weakness map must stay on base typing (no Tera projection).
      const typeA = pokemon.types[0] ?? 'normal'
      const typeB = pokemon.types[1]
      const factor = effectivenessAgainstDual(attackType, typeA, typeB)
      if (factor >= 4) {
        weak += 1
        quad += 1
        affectedMembers.push({
          slot: member.slot,
          pokemonId: member.pokemonId,
          pokemonName: pokemon.name,
          factor,
        })
      } else if (factor > 1) {
        weak += 1
        affectedMembers.push({
          slot: member.slot,
          pokemonId: member.pokemonId,
          pokemonName: pokemon.name,
          factor,
        })
      } else if (factor === 0) {
        imm += 1
      } else if (factor < 1) {
        res += 1
      }
    }

    if (weak === 0) continue
    const severity = 1.0 * weak + 1.8 * quad - 0.5 * res - 1.0 * imm
    rows.push({
      type: attackType,
      weak,
      res,
      imm,
      quad,
      affectedMembers,
      severity,
    })
  }

  return rows
    .sort((a, b) => b.severity - a.severity || b.weak - a.weak)
    .slice(0, 5)
})

const primaryWeakness = computed(() => sharedWeaknessRows.value[0] ?? null)

const selectedWeaknessRow = computed(() => {
  if (!selectedWeaknessType.value) return null
  return (
    sharedWeaknessRows.value.find((entry) => entry.type === selectedWeaknessType.value) ??
    null
  )
})

const actionableFindings = computed(() => {
  const findings: string[] = []
  const topWeak = primaryWeakness.value

  if (topWeak) {
    findings.push(
      t('analytics.quickFindingRisk', {
        type: typeLabel(topWeak.type),
        weak: topWeak.weak,
        resist: topWeak.res,
        immune: topWeak.imm,
      }),
    )
  } else {
    findings.push(t('analytics.quickFindingRiskNone'))
  }

  if (mode.value === 'vgc') {
    findings.push(
      t('analytics.quickFindingGapTempoVgc', {
        count: protectCount.value,
        total: Math.max(1, teamMembers.value.length),
      }),
    )
  } else {
    findings.push(
      t('analytics.quickFindingGapTempoSingles', {
        score: teamAnalytics.value.tempoScore ?? teamAnalytics.value.speedControl,
      }),
    )
  }

  if (mode.value === 'vgc' && protectCount.value < 4) {
    const missing = Math.max(1, 4 - protectCount.value)
    findings.push(
      t('analytics.quickFindingFixProtect', {
        slots: missing,
        delta: Math.min(18, missing * 6),
      }),
    )
  } else if (teraDependency.value.criticalCount >= 2) {
    findings.push(
      t('analytics.quickFindingFixTeraContention', {
        count: teraDependency.value.criticalCount,
      }),
    )
  } else if (topWeak) {
    findings.push(
      t('analytics.quickFindingFixCoverage', {
        type: typeLabel(topWeak.type),
      }),
    )
  } else {
    findings.push(t('analytics.quickFindingFixGeneral'))
  }

  return findings.slice(0, 3)
})

function typeLabel(type: PokemonTypeKey): string {
  return locale.value === 'es' ? TYPE_META[type].es : TYPE_META[type].en
}

function severityClass(row: SharedWeaknessRow): string {
  if (row.quad > 0 || row.weak >= 4) return 'border-rose-500/40 text-rose-200'
  if (row.weak >= 3) return 'border-amber-500/40 text-amber-200'
  return 'border-gray-600 text-gray-300'
}

function selectWeaknessType(type: PokemonTypeKey) {
  selectedWeaknessType.value = selectedWeaknessType.value === type ? null : type
}

function pokemonIconUrl(pokemonId: string): string {
  if (!pokemonId) return 'https://img.pokemondb.net/sprites/home/normal/mudkip.png'
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

  if (target.src !== 'https://img.pokemondb.net/sprites/home/normal/mudkip.png') {
    target.src = 'https://img.pokemondb.net/sprites/home/normal/mudkip.png'
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
</script>

<template>
  <div class="space-y-2">
    <RightSidebarBlock :title="t('analytics.quickFindingsTitle')">
      <ul class="space-y-1 text-xs text-gray-200">
        <li class="rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1">
          🔥 {{ actionableFindings[0] ?? t('common.none') }}
        </li>
        <li class="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1">
          🧠 {{ actionableFindings[1] ?? t('common.none') }}
        </li>
        <li class="rounded border border-sky-500/30 bg-sky-500/5 px-2 py-1">
          🛠️ {{ actionableFindings[2] ?? t('common.none') }}
        </li>
      </ul>
    </RightSidebarBlock>

    <RightSidebarBlock :title="t('analytics.quickSharedWeaknessTitle')">
      <div v-if="sharedWeaknessRows.length > 0" class="space-y-1">
        <button
          v-for="row in sharedWeaknessRows"
          :key="`weak-mini-${row.type}`"
          type="button"
          class="w-full rounded border bg-off-black/65 px-2 py-1 text-left text-xs transition-colors hover:border-sky-500/60"
          :class="severityClass(row)"
          @click="selectWeaknessType(row.type)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold">{{ typeLabel(row.type) }}</span>
            <span class="text-[10px] text-gray-400">x4: {{ row.quad }}</span>
          </div>
          <p class="mt-0.5 text-[11px] text-gray-200">
            {{ row.weak }} {{ t('analytics.quickWeakWeak') }} / {{ row.res }}
            {{ t('analytics.quickWeakResist') }} / {{ row.imm }} {{ t('analytics.quickWeakImmune') }}
          </p>
        </button>

        <div
          v-if="selectedWeaknessRow"
          class="rounded border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100"
        >
          <p class="font-semibold">
            {{ t('analytics.quickWeakAffectedSlots') }} {{ typeLabel(selectedWeaknessRow.type) }}:
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="entry in selectedWeaknessRow.affectedMembers"
              :key="`weak-slot-${selectedWeaknessRow.type}-${entry.slot}-${entry.pokemonId}`"
              class="inline-flex items-center gap-1 rounded border border-sky-400/40 bg-off-black/70 px-1.5 py-0.5 text-[10px]"
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
      <p v-else class="text-xs text-gray-400">{{ t('analytics.quickWeakNone') }}</p>
    </RightSidebarBlock>
  </div>
</template>
