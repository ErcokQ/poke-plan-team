<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/features/shared/components/SearchableSelect.vue'
import type { DamagePairComputation, DamageStatus } from '@/models/damage-calc'
import type { PokemonTypeKey } from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
import type { DamageRollProfile } from '@/utils/damage-sequence'
import { simulateTwoHitSequence } from '@/utils/damage-sequence'
import movePhysicalSeal from '@/assets/pokesprite/misc/seals/home/move-physical.png'
import moveSpecialSeal from '@/assets/pokesprite/misc/seals/home/move-special.png'
import moveStatusSeal from '@/assets/pokesprite/misc/seals/home/move-status.png'
import { moveTypeGradientStyle } from '@/utils/move-type-style'

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

const props = defineProps<{
  pair: DamagePairComputation
  moveOptions?: SearchOption[]
  editableMoves?: [string, string, string, string]
  attackerName?: string
  defenderName?: string
  canSyncMovesToBuilder?: boolean
  defenderCurrentHp?: number
  defenderMaxHp?: number
  defenderItemId?: string
  defenderItemName?: string
  defenderAbilityId?: string
  defenderAbilityName?: string
  defenderStatus?: DamageStatus
  defenderTypes?: PokemonTypeKey[]
}>()

const emit = defineEmits<{
  (event: 'update-move', payload: { moveIndex: number; moveId: string }): void
  (event: 'sync-moves-to-builder'): void
}>()

const { t, locale } = useI18n()
const sequenceRollProfile = ref<DamageRollProfile>('mid')

const rankedResults = computed(() =>
  [...props.pair.resultsByMove].sort((a, b) => b.maxPercent - a.maxPercent || b.minPercent - a.minPercent),
)
const topResults = computed(() => rankedResults.value.slice(0, 2))
const extraResults = computed(() => rankedResults.value.slice(2))

function typeLabel(typeValue: PokemonTypeKey | undefined): string {
  if (!typeValue) return '-'
  return locale.value === 'es' ? TYPE_META[typeValue].es : TYPE_META[typeValue].en
}

function normalizeMoveType(typeValue: unknown): PokemonTypeKey | null {
  if (typeof typeValue !== 'string') return null
  const normalized = typeValue as PokemonTypeKey
  return normalized in TYPE_META ? normalized : null
}

function moveOptionSurfaceStyle(typeValue: unknown) {
  return moveTypeGradientStyle(normalizeMoveType(typeValue))
}

function moveTypeIcon(typeValue: unknown): string | null {
  const type = normalizeMoveType(typeValue)
  return type ? TYPE_META[type].icon : null
}

function moveTypeDisplayLabel(typeValue: unknown): string {
  return typeLabel(normalizeMoveType(typeValue) ?? undefined)
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

function formatKoText(result: DamagePairComputation['resultsByMove'][number]): string {
  const baseText = t(`damageCalc.ko.${result.koText}`)
  if (!result.koResidualText) return baseText

  return t('damageCalc.ko.withResidual', {
    base: baseText,
    residual: t(`damageCalc.ko.${result.koResidualText}`),
  })
}

function hpBarStyle(value: number, max: number) {
  const ratio = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return { width: `${ratio}%` }
}

function sequenceFor(result: DamagePairComputation['resultsByMove'][number]) {
  if (!props.defenderCurrentHp || !props.defenderMaxHp) return null
  return simulateTwoHitSequence(result, {
    profile: sequenceRollProfile.value,
    currentHp: props.defenderCurrentHp,
    maxHp: props.defenderMaxHp,
    defenderItemId: props.defenderItemId,
    defenderAbilityId: props.defenderAbilityId,
    defenderStatus: props.defenderStatus,
    defenderTypes: props.defenderTypes,
  })
}

function formatHpStep(value: number, max: number): string {
  const percent = max <= 0 ? 0 : Math.round((value / max) * 1000) / 10
  return `${value}/${max} · ${percent.toFixed(1)}%`
}

function formatDamageStep(value: number, max: number): string {
  const percent = max <= 0 ? 0 : Math.round((value / max) * 1000) / 10
  return `${value} (${percent.toFixed(1)}%)`
}

function sequenceSummary(result: DamagePairComputation['resultsByMove'][number]) {
  const simulation = sequenceFor(result)
  if (!simulation) return ''

  if (simulation.afterFirstHitHp <= 0) {
    return t('damageCalc.sequenceSummaryOhko')
  }

  if (simulation.recovery.triggered && simulation.twoHitKoAfterRecovery) {
    return t('damageCalc.sequenceSummaryKoAfterRecovery', {
      item: props.defenderItemName || props.defenderItemId || t('damageCalc.sequenceReactiveItem'),
    })
  }
  if (simulation.recovery.triggered && simulation.twoHitKoWithoutRecovery && !simulation.twoHitKoAfterRecovery) {
    return t('damageCalc.sequenceSummaryRecoveryBreaksKo', {
      item: props.defenderItemName || props.defenderItemId || t('damageCalc.sequenceReactiveItem'),
    })
  }
  if (!simulation.recovery.triggered && simulation.twoHitKoAfterRecovery) {
    return t('damageCalc.sequenceSummaryKoNoRecovery')
  }
  return t('damageCalc.sequenceSummaryNoKo')
}

function endTurnEffectLabel(effect: { label: string; kind: 'heal' | 'damage' }) {
  if (effect.label === 'leftovers') return t('damageCalc.sequenceEffectLeftovers')
  if (effect.label === 'black-sludge') return t('damageCalc.sequenceEffectBlackSludge')
  if (effect.label === 'burn') return t('damageCalc.sequenceEffectBurn')
  if (effect.label === 'poison') return t('damageCalc.sequenceEffectPoison')
  if (effect.label === 'toxic') return t('damageCalc.sequenceEffectToxic')
  return effect.label
}

const defenderAbilityNote = computed(() => {
  const abilityId = props.defenderAbilityId?.trim().toLowerCase() ?? ''
  if (!abilityId) return null
  const isFullHp = (props.defenderCurrentHp ?? 0) >= (props.defenderMaxHp ?? 0) && (props.defenderMaxHp ?? 0) > 0

  if (abilityId === 'multiscale' || abilityId === 'shadow-shield') {
    return {
      active: isFullHp,
      text: isFullHp
        ? t('damageCalc.defenderAbilityMitigationActive', {
            ability: props.defenderAbilityName || abilityId,
          })
        : t('damageCalc.defenderAbilityMitigationInactive', {
            ability: props.defenderAbilityName || abilityId,
          }),
    }
  }

  return null
})
</script>

<template>
  <article class="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-cyan-200">{{ t('damageCalc.pairDetailTitle') }}</h3>
      <p class="text-xs text-gray-300">
        {{ t('damageCalc.pairHeaderNames', { attacker: props.attackerName || '-', defender: props.defenderName || '-' }) }}
      </p>
    </div>

    <div
      v-if="defenderAbilityNote"
      class="mb-2 rounded-lg border px-2 py-1.5 text-[11px]"
      :class="
        defenderAbilityNote.active
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
      "
    >
      {{ defenderAbilityNote.text }}
    </div>

    <div v-if="props.editableMoves && props.moveOptions" class="mb-2 space-y-2">
      <label
        v-for="(moveId, moveIndex) in props.editableMoves"
        :key="`pair-edit-move-${pair.attackerSlot}-${moveIndex}`"
        class="text-xs"
      >
        <span class="mb-1 block text-gray-300">{{ t('damageCalc.moveLabel', { index: moveIndex + 1 }) }}</span>
        <SearchableSelect
          :model-value="moveId"
          :options="props.moveOptions"
          :placeholder="t('damageCalc.movePlaceholder')"
          @update:model-value="emit('update-move', { moveIndex, moveId: $event })"
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
                      <img :src="moveTypeIcon(option.meta?.type) || ''" :alt="moveTypeDisplayLabel(option.meta?.type)" class="h-3 w-3" />
                      {{ moveTypeDisplayLabel(option.meta?.type) }}
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
      <div v-if="props.canSyncMovesToBuilder" class="flex justify-end">
        <button
          type="button"
          class="rounded-md border border-emerald-500/45 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/20"
          @click="emit('sync-moves-to-builder')"
        >
          {{ t('damageCalc.pairSyncMovesToBuilder') }}
        </button>
      </div>
    </div>

    <div v-if="pair.resultsByMove.length === 0" class="text-xs text-gray-400">
      {{ t('damageCalc.pairNoMoves') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-if="props.defenderCurrentHp && props.defenderMaxHp"
        class="rounded-lg border border-violet-500/25 bg-violet-500/5 p-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-xs font-semibold text-violet-100">{{ t('damageCalc.sequenceTitle') }}</p>
            <p class="text-[10px] text-gray-400">{{ t('damageCalc.sequenceHelp') }}</p>
          </div>
          <div class="inline-flex rounded-md border border-gray-700 bg-off-black/70 p-1 text-[10px]">
            <button
              type="button"
              class="rounded px-2 py-1 transition"
              :class="sequenceRollProfile === 'low' ? 'bg-violet-500/20 text-violet-100' : 'text-gray-300'"
              @click="sequenceRollProfile = 'low'"
            >
              {{ t('damageCalc.sequenceRollLow') }}
            </button>
            <button
              type="button"
              class="rounded px-2 py-1 transition"
              :class="sequenceRollProfile === 'mid' ? 'bg-violet-500/20 text-violet-100' : 'text-gray-300'"
              @click="sequenceRollProfile = 'mid'"
            >
              {{ t('damageCalc.sequenceRollMid') }}
            </button>
            <button
              type="button"
              class="rounded px-2 py-1 transition"
              :class="sequenceRollProfile === 'high' ? 'bg-violet-500/20 text-violet-100' : 'text-gray-300'"
              @click="sequenceRollProfile = 'high'"
            >
              {{ t('damageCalc.sequenceRollHigh') }}
            </button>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-gray-400">
        {{ t('damageCalc.rollsHelp') }}
      </p>
      <div
        v-for="result in topResults"
        :key="`${pair.attackerSlot}-${pair.defenderSlot}-${result.moveId}`"
        class="rounded-lg border border-gray-700 bg-off-black/60 p-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-1 text-xs">
          <p class="font-semibold text-sky-100">{{ result.moveName }}</p>
          <p class="text-gray-300">
            {{ t('damageCalc.matrixDamageRange', { min: result.minPercent.toFixed(1), max: result.maxPercent.toFixed(1) }) }}
          </p>
        </div>
        <p class="mt-1 text-[11px] text-gray-300">{{ formatKoText(result) }}</p>
        <p class="mt-1 break-words text-[10px] text-gray-500">
          {{ t('damageCalc.rollsLabel') }}:
          <span class="text-gray-400">{{ result.rolls.join(', ') }}</span>
        </p>
        <div
          v-if="sequenceFor(result)"
          class="mt-2 rounded-md border border-violet-500/25 bg-violet-500/5 p-2"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-[11px] font-semibold text-violet-100">{{ t('damageCalc.sequenceTitle') }}</p>
            <p class="text-[10px] text-gray-300">
              {{
                t('damageCalc.sequenceSelectedDamage', {
                  first: formatDamageStep(sequenceFor(result)?.firstHitDamage ?? 0, props.defenderMaxHp ?? 1),
                  second: formatDamageStep(sequenceFor(result)?.secondHitDamage ?? 0, props.defenderMaxHp ?? 1),
                })
              }}
            </p>
          </div>
          <div class="mt-2 space-y-2">
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[10px] text-gray-300">
                <span>{{ t('damageCalc.sequenceStepInitial') }}</span>
                <span>{{ formatHpStep(sequenceFor(result)?.initialHp ?? 0, props.defenderMaxHp ?? 1) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-gray-800">
                <div class="h-full rounded bg-gray-500/70" :style="hpBarStyle(sequenceFor(result)?.initialHp ?? 0, props.defenderMaxHp ?? 1)" />
              </div>
            </div>
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[10px] text-gray-300">
                <span>{{ t('damageCalc.sequenceStepAfterFirstHit') }}</span>
                <span>{{ formatHpStep(sequenceFor(result)?.afterFirstHitHp ?? 0, props.defenderMaxHp ?? 1) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-gray-800">
                <div class="h-full rounded bg-rose-500/75" :style="hpBarStyle(sequenceFor(result)?.afterFirstHitHp ?? 0, props.defenderMaxHp ?? 1)" />
              </div>
            </div>
            <div
              v-if="sequenceFor(result)?.recovery.triggered"
              class="space-y-1"
            >
              <div class="flex items-center justify-between text-[10px] text-gray-300">
                <span>{{ t('damageCalc.sequenceStepAfterRecovery', { item: props.defenderItemName || props.defenderItemId || t('damageCalc.sequenceReactiveItem') }) }}</span>
                <span>
                  {{
                    t('damageCalc.sequenceRecoveryAmount', {
                      hp: sequenceFor(result)?.recovery.healAmount ?? 0,
                      total: formatHpStep(sequenceFor(result)?.afterRecoveryHp ?? 0, props.defenderMaxHp ?? 1),
                    })
                  }}
                </span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-gray-800">
                <div class="h-full rounded bg-emerald-500/80" :style="hpBarStyle(sequenceFor(result)?.afterRecoveryHp ?? 0, props.defenderMaxHp ?? 1)" />
              </div>
            </div>
            <div v-else class="rounded border border-gray-700 bg-off-black/50 px-2 py-1 text-[10px] text-gray-400">
              {{ t('damageCalc.sequenceNoReactiveRecovery') }}
            </div>
            <div
              v-if="(sequenceFor(result)?.endTurnEffects.length ?? 0) > 0"
              class="space-y-1"
            >
              <div class="flex items-center justify-between text-[10px] text-gray-300">
                <span>{{ t('damageCalc.sequenceStepEndTurn') }}</span>
                <span>{{ formatHpStep(sequenceFor(result)?.afterTurnOneHp ?? 0, props.defenderMaxHp ?? 1) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-gray-800">
                <div class="h-full rounded bg-amber-400/80" :style="hpBarStyle(sequenceFor(result)?.afterTurnOneHp ?? 0, props.defenderMaxHp ?? 1)" />
              </div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="effect in sequenceFor(result)?.endTurnEffects ?? []"
                  :key="`${result.moveId}-${effect.label}-${effect.kind}`"
                  class="rounded border px-1.5 py-0.5 text-[10px]"
                  :class="effect.kind === 'heal' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/35 bg-amber-500/10 text-amber-100'"
                >
                  {{
                    t('damageCalc.sequenceEffectAmount', {
                      effect: endTurnEffectLabel(effect),
                      value: effect.hpDelta,
                    })
                  }}
                </span>
              </div>
            </div>
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[10px] text-gray-300">
                <span>{{ t('damageCalc.sequenceStepAfterSecondHit') }}</span>
                <span>{{ formatHpStep(sequenceFor(result)?.afterSecondHitHp ?? 0, props.defenderMaxHp ?? 1) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-gray-800">
                <div class="h-full rounded bg-fuchsia-500/80" :style="hpBarStyle(sequenceFor(result)?.afterSecondHitHp ?? 0, props.defenderMaxHp ?? 1)" />
              </div>
            </div>
          </div>
          <p class="mt-2 text-[10px] text-violet-100">{{ sequenceSummary(result) }}</p>
        </div>
      </div>
      <details v-if="extraResults.length > 0" class="rounded-lg border border-gray-700 bg-off-black/50 p-2">
        <summary class="cursor-pointer text-xs text-gray-300">{{ t('damageCalc.otherMovesDetail') }}</summary>
        <div class="mt-2 space-y-2">
          <div
            v-for="result in extraResults"
            :key="`${pair.attackerSlot}-${pair.defenderSlot}-${result.moveId}-extra`"
            class="rounded-lg border border-gray-700 bg-off-black/60 p-2"
          >
            <div class="flex flex-wrap items-center justify-between gap-1 text-xs">
              <p class="font-semibold text-sky-100">{{ result.moveName }}</p>
              <p class="text-gray-300">
                {{ t('damageCalc.matrixDamageRange', { min: result.minPercent.toFixed(1), max: result.maxPercent.toFixed(1) }) }}
              </p>
            </div>
            <p class="mt-1 text-[11px] text-gray-300">{{ formatKoText(result) }}</p>
          </div>
        </div>
      </details>
    </div>
  </article>
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
