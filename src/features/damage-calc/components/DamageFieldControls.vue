<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DamageCalcScenario, DamageSideFieldState, DamageSideId, DamageSlotNumber } from '@/models/damage-calc'

type SideBooleanFlagKey = Exclude<keyof DamageSideFieldState, 'hazards' | 'protectBySlot'>

const props = withDefaults(
  defineProps<{
    scenario: DamageCalcScenario
    isVgc?: boolean
    protectLabelsA?: Record<string, string>
    protectLabelsB?: Record<string, string>
  }>(),
  {
    isVgc: false,
    protectLabelsA: () => ({}),
    protectLabelsB: () => ({}),
  },
)

const emit = defineEmits<{
  (event: 'update-weather', weather: DamageCalcScenario['field']['weather']): void
  (event: 'update-terrain', terrain: DamageCalcScenario['field']['terrain']): void
  (
    event: 'update-side-flag',
    payload: { side: DamageSideId; key: keyof DamageCalcScenario['field']['sideA']; value: boolean | number },
  ): void
  (
    event: 'update-global-flag',
    payload: { key: keyof DamageCalcScenario['field']['globalFlags']; value: boolean },
  ): void
  (
    event: 'update-protect',
    payload: { side: DamageSideId; slot: DamageSlotNumber; value: boolean },
  ): void
  (
    event: 'update-advanced-flag',
    payload: { key: string; value: boolean },
  ): void
  (
    event: 'update-side-hazards',
    payload: {
      side: DamageSideId
      patch: Partial<DamageCalcScenario['field']['sideA']['hazards']>
    },
  ): void
}>()

const { t } = useI18n()

const weatherOptions = computed<Array<{ value: DamageCalcScenario['field']['weather']; label: string }>>(() => [
  { value: 'none', label: t('damageCalc.weather.none') },
  { value: 'sun', label: t('damageCalc.weather.sun') },
  { value: 'rain', label: t('damageCalc.weather.rain') },
  { value: 'sand', label: t('damageCalc.weather.sand') },
  { value: 'snow', label: t('damageCalc.weather.snow') },
  { value: 'harsh-sunshine', label: t('damageCalc.weather.harshSunshine') },
  { value: 'heavy-rain', label: t('damageCalc.weather.heavyRain') },
  { value: 'strong-winds', label: t('damageCalc.weather.strongWinds') },
])

const terrainOptions = computed<Array<{ value: DamageCalcScenario['field']['terrain']; label: string }>>(() => [
  { value: 'none', label: t('damageCalc.terrain.none') },
  { value: 'electric', label: t('damageCalc.terrain.electric') },
  { value: 'grassy', label: t('damageCalc.terrain.grassy') },
  { value: 'misty', label: t('damageCalc.terrain.misty') },
  { value: 'psychic', label: t('damageCalc.terrain.psychic') },
])

const sideFlags = computed<Array<{ key: SideBooleanFlagKey; label: string }>>(() => [
  { key: 'reflect', label: t('damageCalc.flags.reflect') },
  { key: 'lightScreen', label: t('damageCalc.flags.lightScreen') },
  { key: 'auroraVeil', label: t('damageCalc.flags.auroraVeil') },
  { key: 'friendGuard', label: t('damageCalc.flags.friendGuard') },
  { key: 'helpingHand', label: t('damageCalc.flags.helpingHand') },
  { key: 'battery', label: t('damageCalc.flags.battery') },
  { key: 'powerSpot', label: t('damageCalc.flags.powerSpot') },
])

const protectLeadSlotsA = computed(() =>
  props.isVgc ? (props.scenario.sideA.activeSlotIds.slice(0, 2) as DamageSlotNumber[]) : [],
)

const protectLeadSlotsB = computed(() =>
  props.isVgc ? (props.scenario.sideB.activeSlotIds.slice(0, 2) as DamageSlotNumber[]) : [],
)
</script>

<template>
  <article class="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
    <div class="mb-2 flex flex-wrap items-end gap-2">
      <label class="text-xs">
        <span class="mb-1 block text-gray-300">{{ t('damageCalc.weatherLabel') }}</span>
        <select
          class="rounded-md border border-gray-700 bg-off-black/80 px-2 py-1 text-xs text-gray-100"
          :value="props.scenario.field.weather"
          @change="emit('update-weather', ($event.target as HTMLSelectElement).value as DamageCalcScenario['field']['weather'])"
        >
          <option v-for="option in weatherOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="text-xs">
        <span class="mb-1 block text-gray-300">{{ t('damageCalc.terrainLabel') }}</span>
        <select
          class="rounded-md border border-gray-700 bg-off-black/80 px-2 py-1 text-xs text-gray-100"
          :value="props.scenario.field.terrain"
          @change="emit('update-terrain', ($event.target as HTMLSelectElement).value as DamageCalcScenario['field']['terrain'])"
        >
          <option v-for="option in terrainOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="inline-flex items-center gap-1 text-xs text-gray-300">
        <input
          class="accent-sky-400"
          type="checkbox"
          :checked="props.scenario.field.globalFlags.gravity"
          @change="emit('update-global-flag', { key: 'gravity', value: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('damageCalc.flags.gravity') }}
      </label>
      <label class="inline-flex items-center gap-1 text-xs text-gray-300">
        <input
          class="accent-sky-400"
          type="checkbox"
          :checked="props.scenario.field.globalFlags.magicRoom"
          @change="emit('update-global-flag', { key: 'magicRoom', value: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('damageCalc.flags.magicRoom') }}
      </label>
      <label class="inline-flex items-center gap-1 text-xs text-gray-300">
        <input
          class="accent-sky-400"
          type="checkbox"
          :checked="props.scenario.field.globalFlags.wonderRoom"
          @change="emit('update-global-flag', { key: 'wonderRoom', value: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('damageCalc.flags.wonderRoom') }}
      </label>
    </div>

    <div class="mb-2 flex flex-wrap items-center gap-3 rounded border border-gray-700 bg-st-black/40 p-2 text-[11px] text-gray-300">
      <label class="inline-flex items-center gap-1">
        <input
          class="accent-sky-400"
          type="checkbox"
          :checked="Boolean(props.scenario.field.advancedFlags.expectedDamageMode)"
          @change="emit('update-advanced-flag', { key: 'expectedDamageMode', value: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('damageCalc.expectedDamageMode') }}
      </label>
      <label v-if="props.scenario.battleType === 'doubles'" class="inline-flex items-center gap-1">
        <input
          class="accent-sky-400"
          type="checkbox"
          :checked="Boolean(props.scenario.field.advancedFlags.assumeSpreadHitsMultipleTargets)"
          @change="emit('update-advanced-flag', { key: 'assumeSpreadHitsMultipleTargets', value: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('damageCalc.assumeSpreadMultiTarget') }}
      </label>
      <span class="text-[10px] text-gray-400">{{ t('damageCalc.expectedModeHelp') }}</span>
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
        <p class="mb-1 text-xs font-semibold text-sky-200">{{ t('damageCalc.sideA') }}</p>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="flag in sideFlags"
            :key="`A-${flag.key}`"
            class="inline-flex items-center gap-1 text-[11px] text-gray-300"
          >
            <input
              class="accent-sky-400"
              type="checkbox"
              :checked="Boolean(props.scenario.field.sideA[flag.key])"
              @change="emit('update-side-flag', { side: 'A', key: flag.key, value: ($event.target as HTMLInputElement).checked })"
            />
            {{ flag.label }}
          </label>
        </div>
        <div v-if="props.isVgc" class="mt-2 flex flex-wrap gap-2">
          <label
            v-for="slot in protectLeadSlotsA"
            :key="`A-protect-${slot}`"
            class="inline-flex items-center gap-1 text-[11px] text-gray-300"
          >
            <input
              class="accent-sky-400"
              type="checkbox"
              :checked="Boolean(props.scenario.field.sideA.protectBySlot[String(slot)])"
              @change="emit('update-protect', { side: 'A', slot: slot as DamageSlotNumber, value: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('damageCalc.protectNamed', { pokemon: props.protectLabelsA[String(slot)] || `S${slot}` }) }}
          </label>
        </div>
        <div class="mt-2 border-t border-gray-700/70 pt-2">
          <p class="mb-1 text-[11px] font-semibold text-gray-300">{{ t('damageCalc.hazardsTitle') }}</p>
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
            <label class="inline-flex items-center gap-1">
              <input
                class="accent-sky-400"
                type="checkbox"
                :checked="props.scenario.field.sideA.hazards.stealthRock"
                @change="emit('update-side-hazards', { side: 'A', patch: { stealthRock: ($event.target as HTMLInputElement).checked } })"
              />
              {{ t('damageCalc.hazardStealthRock') }}
            </label>
            <label class="inline-flex items-center gap-1">
              <input
                class="accent-sky-400"
                type="checkbox"
                :checked="props.scenario.field.sideA.hazards.stickyWeb"
                @change="emit('update-side-hazards', { side: 'A', patch: { stickyWeb: ($event.target as HTMLInputElement).checked } })"
              />
              {{ t('damageCalc.hazardStickyWeb') }}
            </label>
            <label class="inline-flex items-center gap-1">
              <span>{{ t('damageCalc.hazardSpikes') }}</span>
              <select
                class="rounded border border-gray-700 bg-off-black/80 px-1 py-0.5 text-[11px] text-gray-100"
                :value="props.scenario.field.sideA.hazards.spikesLayers"
                @change="emit('update-side-hazards', { side: 'A', patch: { spikesLayers: Number(($event.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3 } })"
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <label class="inline-flex items-center gap-1">
              <span>{{ t('damageCalc.hazardToxicSpikes') }}</span>
              <select
                class="rounded border border-gray-700 bg-off-black/80 px-1 py-0.5 text-[11px] text-gray-100"
                :value="props.scenario.field.sideA.hazards.toxicSpikesLayers"
                @change="emit('update-side-hazards', { side: 'A', patch: { toxicSpikesLayers: Number(($event.target as HTMLSelectElement).value) as 0 | 1 | 2 } })"
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-700 bg-off-black/60 p-2">
        <p class="mb-1 text-xs font-semibold text-rose-200">{{ t('damageCalc.sideB') }}</p>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="flag in sideFlags"
            :key="`B-${flag.key}`"
            class="inline-flex items-center gap-1 text-[11px] text-gray-300"
          >
            <input
              class="accent-sky-400"
              type="checkbox"
              :checked="Boolean(props.scenario.field.sideB[flag.key])"
              @change="emit('update-side-flag', { side: 'B', key: flag.key, value: ($event.target as HTMLInputElement).checked })"
            />
            {{ flag.label }}
          </label>
        </div>
        <div v-if="props.isVgc" class="mt-2 flex flex-wrap gap-2">
          <label
            v-for="slot in protectLeadSlotsB"
            :key="`B-protect-${slot}`"
            class="inline-flex items-center gap-1 text-[11px] text-gray-300"
          >
            <input
              class="accent-sky-400"
              type="checkbox"
              :checked="Boolean(props.scenario.field.sideB.protectBySlot[String(slot)])"
              @change="emit('update-protect', { side: 'B', slot: slot as DamageSlotNumber, value: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('damageCalc.protectNamed', { pokemon: props.protectLabelsB[String(slot)] || `S${slot}` }) }}
          </label>
        </div>
        <div class="mt-2 border-t border-gray-700/70 pt-2">
          <p class="mb-1 text-[11px] font-semibold text-gray-300">{{ t('damageCalc.hazardsTitle') }}</p>
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
            <label class="inline-flex items-center gap-1">
              <input
                class="accent-sky-400"
                type="checkbox"
                :checked="props.scenario.field.sideB.hazards.stealthRock"
                @change="emit('update-side-hazards', { side: 'B', patch: { stealthRock: ($event.target as HTMLInputElement).checked } })"
              />
              {{ t('damageCalc.hazardStealthRock') }}
            </label>
            <label class="inline-flex items-center gap-1">
              <input
                class="accent-sky-400"
                type="checkbox"
                :checked="props.scenario.field.sideB.hazards.stickyWeb"
                @change="emit('update-side-hazards', { side: 'B', patch: { stickyWeb: ($event.target as HTMLInputElement).checked } })"
              />
              {{ t('damageCalc.hazardStickyWeb') }}
            </label>
            <label class="inline-flex items-center gap-1">
              <span>{{ t('damageCalc.hazardSpikes') }}</span>
              <select
                class="rounded border border-gray-700 bg-off-black/80 px-1 py-0.5 text-[11px] text-gray-100"
                :value="props.scenario.field.sideB.hazards.spikesLayers"
                @change="emit('update-side-hazards', { side: 'B', patch: { spikesLayers: Number(($event.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3 } })"
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <label class="inline-flex items-center gap-1">
              <span>{{ t('damageCalc.hazardToxicSpikes') }}</span>
              <select
                class="rounded border border-gray-700 bg-off-black/80 px-1 py-0.5 text-[11px] text-gray-100"
                :value="props.scenario.field.sideB.hazards.toxicSpikesLayers"
                @change="emit('update-side-hazards', { side: 'B', patch: { toxicSpikesLayers: Number(($event.target as HTMLSelectElement).value) as 0 | 1 | 2 } })"
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </div>
        </div>
      </div>
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
