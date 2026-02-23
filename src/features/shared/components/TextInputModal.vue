<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    message?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    initialValue?: string
    allowEmpty?: boolean
  }>(),
  {
    message: '',
    placeholder: '',
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    initialValue: '',
    allowEmpty: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'confirm', value: string): void
  (event: 'cancel'): void
}>()

const draftValue = ref('')

watch(
  () => [props.modelValue, props.initialValue] as const,
  () => {
    if (props.modelValue) {
      draftValue.value = props.initialValue ?? ''
    }
  },
  { immediate: true },
)

function close() {
  emit('update:modelValue', false)
  emit('cancel')
}

function submit() {
  const value = draftValue.value.trim()
  if (!props.allowEmpty && !value) return
  emit('confirm', value)
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <article class="w-full max-w-sm rounded-xl border border-sky-500/30 bg-off-black p-4 shadow-xl">
        <h3 class="text-sm font-semibold text-sky-200">{{ props.title }}</h3>
        <p v-if="props.message" class="mt-2 text-sm text-gray-300">{{ props.message }}</p>

        <input
          v-model="draftValue"
          class="mt-3 w-full rounded-md border border-gray-700 bg-st-black p-2 text-sm outline-none focus:border-sky-400/70"
          :placeholder="props.placeholder"
          type="text"
          @keydown.enter.prevent="submit"
        />

        <div class="mt-4 flex justify-end gap-2 text-xs">
          <button class="rounded-md border border-gray-700 px-3 py-1.5" @click="close">
            {{ props.cancelLabel }}
          </button>
          <button
            class="rounded-md border border-sky-500/60 bg-sky-500/15 px-3 py-1.5 text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!props.allowEmpty && !draftValue.trim()"
            @click="submit"
          >
            {{ props.confirmLabel }}
          </button>
        </div>
      </article>
    </div>
  </Teleport>
</template>
