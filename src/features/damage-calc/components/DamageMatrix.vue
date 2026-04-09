<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DamageMatrixCell, DamageSelectedPair, DamageSideId, DamageSlotNumber } from '@/models/damage-calc'
import { onPokemonSpriteError } from '@/utils/pokemon-sprite'

interface MatrixEntry {
  slot: DamageSlotNumber
  pokemonId: string
  name: string
  sprite: string
}

const props = defineProps<{
  attackerSide: DamageSideId
  attackerEntries: MatrixEntry[]
  defenderEntries: MatrixEntry[]
  cells: DamageMatrixCell[]
  minPercent?: number
  selectedPair: DamageSelectedPair
}>()

const emit = defineEmits<{
  (event: 'select-pair', payload: { attackerSlot: DamageSlotNumber; defenderSlot: DamageSlotNumber }): void
}>()

const { t } = useI18n()

function findCell(attackerSlot: DamageSlotNumber, defenderSlot: DamageSlotNumber): DamageMatrixCell | undefined {
  return cellIndex.value.get(`${attackerSlot}-${defenderSlot}`)
}

function onSpriteError(event: Event) {
  onPokemonSpriteError(event)
}

function cellClass(cell: DamageMatrixCell | undefined): string {
  if (!cell) return 'border-gray-700 bg-off-black/50 text-gray-500'
  if ((props.minPercent ?? 0) > 0 && cell.maxPercent < (props.minPercent ?? 0)) {
    return 'border-gray-700 bg-off-black/35 text-gray-500'
  }
  if (cell.maxPercent >= 100) return 'border-rose-500/45 bg-rose-500/15 text-rose-100'
  if (cell.maxPercent >= 75) return 'border-amber-500/45 bg-amber-500/15 text-amber-100'
  if (cell.maxPercent >= 40) return 'border-sky-500/45 bg-sky-500/15 text-sky-100'
  return 'border-gray-700 bg-off-black/50 text-gray-200'
}

function isFilteredOut(cell: DamageMatrixCell | undefined): boolean {
  if (!cell) return false
  const min = props.minPercent ?? 0
  return min > 0 && cell.maxPercent < min
}

function isSelected(attackerSlot: DamageSlotNumber, defenderSlot: DamageSlotNumber): boolean {
  return (
    props.selectedPair.attackerSide === props.attackerSide &&
    props.selectedPair.attackerSlot === attackerSlot &&
    props.selectedPair.defenderSlot === defenderSlot
  )
}

function formatKoText(cell: DamageMatrixCell | undefined): string {
  if (!cell) return '-'

  const baseText = t(`damageCalc.ko.${cell.koText}`)
  if (!cell.koResidualText) return baseText

  return t('damageCalc.ko.withResidual', {
    base: baseText,
    residual: t(`damageCalc.ko.${cell.koResidualText}`),
  })
}

const orderedAttackerEntries = computed(() => props.attackerEntries)
const orderedDefenderEntries = computed(() => props.defenderEntries)
const cellIndex = computed(() => {
  const map = new Map<string, DamageMatrixCell>()
  for (const entry of props.cells) {
    map.set(`${entry.attackerSlot}-${entry.defenderSlot}`, entry)
  }
  return map
})
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-sky-500/25 bg-off-black/60 p-3">
    <table class="min-w-full border-separate border-spacing-1 text-xs">
      <thead>
        <tr>
          <th class="px-2 py-1 text-left text-gray-400">{{ t('damageCalc.matrixHeader') }}</th>
          <th
            v-for="defender in orderedDefenderEntries"
            :key="`def-slot-${defender.slot}`"
            class="px-2 py-1 text-center font-semibold text-sky-200"
          >
            <div class="flex min-w-[120px] items-center justify-center gap-2">
              <img
                :src="defender.sprite"
                :alt="defender.name"
                :data-sprite-id="defender.pokemonId"
                :data-sprite-fallback-index="0"
                class="h-5 w-5 rounded bg-black/20 object-contain"
                @error="onSpriteError"
              />
              <span class="truncate text-xs">{{ defender.name }}</span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="attacker in orderedAttackerEntries" :key="`atk-row-${attacker.slot}`">
          <th class="px-2 py-1 text-left font-semibold text-cyan-200">
            <div class="flex min-w-[120px] items-center gap-2">
              <img
                :src="attacker.sprite"
                :alt="attacker.name"
                :data-sprite-id="attacker.pokemonId"
                :data-sprite-fallback-index="0"
                class="h-5 w-5 rounded bg-black/20 object-contain"
                @error="onSpriteError"
              />
              <span class="truncate text-xs">{{ attacker.name }}</span>
            </div>
          </th>
          <td
            v-for="defender in orderedDefenderEntries"
            :key="`cell-${attacker.slot}-${defender.slot}`"
            class="rounded border px-2 py-1 align-top transition"
            :class="[
              cellClass(findCell(attacker.slot, defender.slot)),
              isSelected(attacker.slot, defender.slot) ? 'ring-2 ring-sky-400/60' : '',
            ]"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded px-1 py-0.5 text-left transition hover:bg-white/5"
              :title="t('damageCalc.matrixCellClickable')"
              @click="emit('select-pair', { attackerSlot: attacker.slot, defenderSlot: defender.slot })"
            >
              <template v-if="findCell(attacker.slot, defender.slot) && !isFilteredOut(findCell(attacker.slot, defender.slot))">
                <span class="font-semibold">
                  {{
                    t('damageCalc.matrixDamageRange', {
                      min: findCell(attacker.slot, defender.slot)?.minPercent.toFixed(1) ?? '0.0',
                      max: findCell(attacker.slot, defender.slot)?.maxPercent.toFixed(1) ?? '0.0',
                    })
                  }}
                </span>
                <span class="text-[10px] opacity-80">
                  {{ findCell(attacker.slot, defender.slot)?.bestMoveName ?? '-' }}
                </span>
                <span class="text-[10px] opacity-70">
                  {{ formatKoText(findCell(attacker.slot, defender.slot)) }}
                </span>
              </template>
              <template v-else-if="isFilteredOut(findCell(attacker.slot, defender.slot))">
                <span class="font-semibold">--</span>
                <span class="text-[10px] opacity-80">{{ t('damageCalc.filteredOut') }}</span>
              </template>
              <template v-else>
                <span class="font-semibold">--</span>
                <span class="text-[10px] opacity-80">{{ t('damageCalc.notEvaluated') }}</span>
              </template>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
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
