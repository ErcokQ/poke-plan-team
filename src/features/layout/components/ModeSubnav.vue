<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode } from '@/models/domain'

const route = useRoute()
const { t } = useI18n()

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))

const links = computed(() => [
  { name: 'builder' as const, label: t('nav.builder') },
  { name: 'analytics' as const, label: t('nav.analytics') },
  { name: 'damage-calc' as const, label: t('nav.damageCalc') },
  { name: 'strategy' as const, label: t('nav.strategy') },
  { name: 'dex' as const, label: t('nav.dex') },
  { name: 'about' as const, label: t('nav.about') },
])
</script>

<template>
  <nav class="rounded-xl border border-sky-500/20 bg-off-black/70 p-2">
    <ul class="flex flex-wrap gap-2">
      <li v-for="link in links" :key="link.name">
        <RouterLink
          class="inline-flex rounded-lg border px-3 py-1.5 text-sm transition"
          :class="
            route.name === link.name
              ? 'border-sky-400 bg-sky-500/20 text-sky-200'
              : 'border-gray-700 text-gray-300 hover:border-sky-500/40'
          "
          :to="{ name: link.name, params: { mode } }"
        >
          {{ link.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
