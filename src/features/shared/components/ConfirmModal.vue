<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    destructive: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()

function close() {
  emit('update:modelValue', false)
  emit('cancel')
}

function confirm() {
  emit('confirm')
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
        <p class="mt-2 text-sm text-gray-300">{{ props.message }}</p>

        <div class="mt-4 flex justify-end gap-2 text-xs">
          <button class="rounded-md border border-gray-700 px-3 py-1.5" @click="close">
            {{ props.cancelLabel }}
          </button>
          <button
            class="rounded-md border px-3 py-1.5"
            :class="
              props.destructive
                ? 'border-red-500/60 bg-red-500/15 text-red-100'
                : 'border-sky-500/60 bg-sky-500/15 text-sky-100'
            "
            @click="confirm"
          >
            {{ props.confirmLabel }}
          </button>
        </div>
      </article>
    </div>
  </Teleport>
</template>
