<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'

const { t } = useI18n()
</script>

<template>
  <section class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
    <div class="mx-auto flex max-w-xl flex-col items-center rounded-xl border border-gray-700 bg-st-black/55 p-6 text-center">
      <img
        :src="mudkipSprite"
        alt="Mudkip"
        class="mb-4 h-24 w-24 rounded bg-black/20 object-contain"
        loading="lazy"
      />
      <h2 class="text-xl font-semibold text-sky-300">{{ t('strategy.comingSoonTitle') }}</h2>
      <p class="mt-2 text-sm text-gray-300">{{ t('strategy.comingSoonBody') }}</p>
    </div>
  </section>
</template>
