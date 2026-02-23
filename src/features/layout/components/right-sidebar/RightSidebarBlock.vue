<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string
    defaultOpen?: boolean
  }>(),
  {
    defaultOpen: true,
  },
)
</script>

<template>
  <details :open="defaultOpen" class="rounded-lg border border-gray-700 bg-st-black/55 p-2">
    <summary class="cursor-pointer list-none text-xs font-semibold text-gray-200">
      {{ props.title }}
    </summary>
    <div class="mt-2">
      <slot />
    </div>
  </details>
</template>
