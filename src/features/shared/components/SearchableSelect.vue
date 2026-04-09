<script setup lang="ts">
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/vue'
import { computed, ref, watch } from 'vue'
import { useDebounce } from '@vueuse/core'

interface SearchOptionMeta {
  effect?: string
  type?: string
  category?: string
  power?: number | null
  accuracy?: number | null
  pp?: number | null
  [key: string]: unknown
}

interface SearchOption {
  value: string
  label: string
  meta?: SearchOptionMeta
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SearchOption[]
    placeholder?: string
    disabled?: boolean
    clearable?: boolean
    maxVisible?: number
    noResultsLabel?: string
    largeListThreshold?: number
    largeListPreview?: number
  }>(),
  {
    placeholder: '',
    disabled: false,
    clearable: true,
    maxVisible: 0,
    noResultsLabel: 'No results',
    largeListThreshold: 300,
    largeListPreview: 180,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const queryRaw = ref('')
const isFiltering = ref(false)
const queryDebounced = useDebounce(queryRaw, 160)
const buttonRef = ref<InstanceType<typeof ComboboxButton> | null>(null)

const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue))

const preparedOptions = computed(() =>
  props.options.map((option) => ({
    option,
    labelNorm: normalize(option.label),
    valueNorm: normalize(option.value),
  })),
)

watch(
  () => [props.modelValue, props.options] as const,
  () => {
    queryRaw.value = selectedOption.value?.label ?? ''
    isFiltering.value = false
  },
  { immediate: true },
)

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

const filteredOptions = computed(() => {
  const needle = normalize(queryDebounced.value)
  const boundedSlice = (
    options: Array<{ option: SearchOption; labelNorm: string; valueNorm: string }>,
  ) => {
    if (props.maxVisible > 0) return options.slice(0, props.maxVisible)
    if (options.length > props.largeListThreshold) {
      return options.slice(0, props.largeListPreview)
    }
    return options
  }

  if (!isFiltering.value || !needle) {
    return boundedSlice(preparedOptions.value).map((entry) => entry.option)
  }

  const filtered = preparedOptions.value.filter(
    (entry) => entry.labelNorm.includes(needle) || entry.valueNorm.includes(needle),
  )

  return boundedSlice(filtered).map((entry) => entry.option)
})

const selectedValue = computed<SearchOption | null>(() => {
  return props.options.find((option) => option.value === props.modelValue) ?? null
})

function onSelect(option: SearchOption | null) {
  isFiltering.value = false
  if (!option) {
    if (props.clearable) emit('update:modelValue', '')
    queryRaw.value = ''
    return
  }
  emit('update:modelValue', option.value)
  queryRaw.value = option.label
}

function onInput(event: Event) {
  queryRaw.value = (event.target as HTMLInputElement).value
  isFiltering.value = true
}

function onFocus(event: FocusEvent) {
  if (props.disabled) return
  const button = (buttonRef.value?.$el as HTMLButtonElement | undefined) ?? null
  if (button && button.getAttribute('aria-expanded') !== 'true') {
    button.click()
  }
  const input = event.target as HTMLInputElement | null
  if (input) {
    requestAnimationFrame(() => input.select())
  }
}

function onBlur() {
  setTimeout(() => {
    queryRaw.value = selectedOption.value?.label ?? ''
    isFiltering.value = false
  }, 0)
}
</script>

<template>
  <Combobox
    v-slot="{ open }"
    :model-value="selectedValue"
    :disabled="disabled"
    nullable
    @update:model-value="onSelect"
  >
    <div class="relative">
      <ComboboxInput
        class="w-full rounded-md border border-gray-700 bg-st-black p-2 pr-8 text-sm outline-none transition focus:border-sky-400/70"
        :placeholder="placeholder"
        :display-value="() => queryRaw"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
      />

      <ComboboxButton
        ref="buttonRef"
        class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-gray-400 transition hover:bg-white/10 hover:text-gray-200"
      >
        &#9662;
      </ComboboxButton>

      <ComboboxOptions
        v-if="open"
        class="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-700 bg-off-black/95 p-1 shadow-lg empty:invisible"
      >
        <ComboboxOption
          v-for="option in filteredOptions"
          :key="option.value"
          :value="option"
          as="template"
          v-slot="{ active, selected }"
        >
          <li
            class="cursor-pointer rounded px-2 py-1.5 text-left text-sm text-gray-100 transition"
            :class="[
              active ? 'bg-sky-500/20' : '',
              selected ? 'font-semibold text-sky-200' : '',
            ]"
          >
            <slot name="option" :option="option" :active="active" :selected="selected">
              {{ option.label }}
            </slot>
          </li>
        </ComboboxOption>
        <li v-if="filteredOptions.length === 0" class="px-2 py-1.5 text-xs text-gray-500">
          {{ noResultsLabel }}
        </li>
      </ComboboxOptions>
    </div>
  </Combobox>
</template>
