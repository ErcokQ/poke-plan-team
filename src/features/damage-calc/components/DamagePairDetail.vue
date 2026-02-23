<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchableSelect from '@/features/shared/components/SearchableSelect.vue'
import type { DamagePairComputation } from '@/models/damage-calc'

interface SearchOption {
  value: string
  label: string
}

const props = defineProps<{
  pair: DamagePairComputation
  moveOptions?: SearchOption[]
  editableMoves?: [string, string, string, string]
  attackerName?: string
  defenderName?: string
}>()

const emit = defineEmits<{
  (event: 'update-move', payload: { moveIndex: number; moveId: string }): void
}>()

const { t } = useI18n()

const rankedResults = computed(() =>
  [...props.pair.resultsByMove].sort((a, b) => b.maxPercent - a.maxPercent || b.minPercent - a.minPercent),
)
const topResults = computed(() => rankedResults.value.slice(0, 2))
const extraResults = computed(() => rankedResults.value.slice(2))
</script>

<template>
  <article class="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-cyan-200">{{ t('damageCalc.pairDetailTitle') }}</h3>
      <p class="text-xs text-gray-300">
        {{ t('damageCalc.pairHeaderNames', { attacker: props.attackerName || '-', defender: props.defenderName || '-' }) }}
      </p>
    </div>

    <div v-if="props.editableMoves && props.moveOptions" class="mb-2 grid gap-2 md:grid-cols-2">
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
        />
      </label>
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
          <p class="text-gray-300">{{ result.minPercent.toFixed(1) }}% - {{ result.maxPercent.toFixed(1) }}%</p>
        </div>
        <p class="mt-1 text-[11px] text-gray-300">{{ result.koText }}</p>
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
              <p class="text-gray-300">{{ result.minPercent.toFixed(1) }}% - {{ result.maxPercent.toFixed(1) }}%</p>
            </div>
            <p class="mt-1 text-[11px] text-gray-300">{{ result.koText }}</p>
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
</style>
