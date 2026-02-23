<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'
import type { BattleMode, LocaleCode } from '@/models/domain'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const currentMode = computed<BattleMode>(() => {
  return route.params.mode === 'singles' ? 'singles' : 'vgc'
})
const mudkipHeaderGif = 'https://play.pokemonshowdown.com/sprites/ani/mudkip.gif'

watch(
  () => route.params.mode,
  () => {
    uiStore.setLastMode(currentMode.value)
  },
  { immediate: true },
)

watch(
  () => uiStore.locale,
  (nextLocale) => {
    locale.value = nextLocale
  },
  { immediate: true },
)

function goMode(mode: BattleMode) {
  router.push({ name: 'builder', params: { mode } })
}

function changeLocale(nextLocale: LocaleCode) {
  uiStore.setLocale(nextLocale)
}

function onMudkipHeaderError(event: Event) {
  const target = event.target as HTMLImageElement
  if (target.src !== mudkipSprite) {
    target.src = mudkipSprite
  }
}
</script>

<template>
  <header class="rounded-2xl border border-sky-500/25 bg-st-black/85 p-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="flex items-center gap-3">
        <img
          :src="mudkipHeaderGif"
          alt="Mudkip"
          class="h-11 w-11 rounded-full border border-sky-400/60 bg-black/35 object-contain p-1"
          loading="lazy"
          @error="onMudkipHeaderError"
        />
        <div>
          <h1 class="text-xl font-bold text-sky-300">{{ t('app.title') }}</h1>
          <p class="text-sm text-gray-300">{{ t('app.subtitle') }}</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          class="rounded-lg border px-3 py-1.5 text-sm transition"
          :class="currentMode === 'vgc' ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-gray-700 text-gray-300 hover:border-sky-500/40'"
          @click="goMode('vgc')"
        >
          {{ t('nav.vgc') }}
        </button>
        <button
          class="rounded-lg border px-3 py-1.5 text-sm transition"
          :class="currentMode === 'singles' ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-gray-700 text-gray-300 hover:border-sky-500/40'"
          @click="goMode('singles')"
        >
          {{ t('nav.singles') }}
        </button>

        <div class="ml-0 flex items-center gap-2 md:ml-4">
          <label class="text-xs text-gray-300">{{ t('common.language') }}</label>
          <select
            class="rounded-md border border-gray-700 bg-st-black px-2 py-1 text-sm"
            :value="locale"
            @change="changeLocale(($event.target as HTMLSelectElement).value as LocaleCode)"
          >
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
        </div>
      </div>
    </div>
  </header>
</template>
