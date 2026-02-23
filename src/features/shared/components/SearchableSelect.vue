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

interface SearchOption {
  value: string
  label: string
  meta?: any
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
const queryDebounced = useDebounce(queryRaw, 160)
const buttonRef = ref<InstanceType<typeof ComboboxButton> | null>(null)

const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue))

watch(
  () => [props.modelValue, props.options] as const,
  () => {
    queryRaw.value = selectedOption.value?.label ?? ''
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
  if (!needle) {
    if (props.maxVisible > 0) return props.options.slice(0, props.maxVisible)
    if (props.options.length > props.largeListThreshold) {
      return props.options.slice(0, props.largeListPreview)
    }
    return props.options
  }

  const filtered = props.options.filter((option) => {
    const labelNorm = normalize(option.label)
    if (labelNorm.includes(needle)) return true
    const valueNorm = normalize(option.value)
    return valueNorm.includes(needle)
  })

  if (props.maxVisible > 0) return filtered.slice(0, props.maxVisible)
  return filtered
})

const selectedValue = computed<SearchOption | null>(() => {
  return props.options.find((option) => option.value === props.modelValue) ?? null
})

function onSelect(option: SearchOption | null) {
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
}

function onFocus() {
  if (props.disabled) return
  const button = (buttonRef.value?.$el as HTMLButtonElement | undefined) ?? null
  if (button && button.getAttribute('aria-expanded') !== 'true') {
    button.click()
  }
}

function onBlur() {
  setTimeout(() => {
    queryRaw.value = selectedOption.value?.label ?? ''
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
