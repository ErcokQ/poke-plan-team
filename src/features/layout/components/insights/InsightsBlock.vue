<script setup lang="ts">
type InsightsBlockProps = {
  title: string
  defaultOpen?: boolean
  tone?: 'neutral' | 'sky' | 'cyan' | 'amber' | 'gray'
}

withDefaults(defineProps<InsightsBlockProps>(), {
  defaultOpen: true,
  tone: 'neutral',
})

const toneClassByKey: Record<NonNullable<InsightsBlockProps['tone']>, string> = {
  neutral: 'border-gray-700 bg-st-black/50',
  sky: 'border-sky-500/30 bg-sky-500/5',
  cyan: 'border-cyan-500/30 bg-cyan-500/5',
  amber: 'border-amber-500/30 bg-amber-500/5',
  gray: 'border-gray-700 bg-st-black/50',
}
</script>

<template>
  <details :open="defaultOpen" class="rounded-lg border p-2" :class="toneClassByKey[tone]">
    <summary class="cursor-pointer list-none text-xs font-semibold text-gray-200">
      {{ title }}
    </summary>
    <div class="mt-2">
      <slot />
    </div>
  </details>
</template>
