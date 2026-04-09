<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/features/shared/components/SearchableSelect.vue'
import type { DamagePairComputation } from '@/models/damage-calc'
import type { PokemonTypeKey } from '@/models/domain'
import { TYPE_META } from '@/models/type-meta'
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
}>()

const emit = defineEmits<{
  (event: 'update-move', payload: { moveIndex: number; moveId: string }): void
  (event: 'sync-moves-to-builder'): void
}>()

const { t, locale } = useI18n()

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
</script>

<template>
  <article class="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-cyan-200">{{ t('damageCalc.pairDetailTitle') }}</h3>
      <p class="text-xs text-gray-300">
        {{ t('damageCalc.pairHeaderNames', { attacker: props.attackerName || '-', defender: props.defenderName || '-' }) }}
      </p>
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
