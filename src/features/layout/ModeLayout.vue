<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'
import type { BattleMode, MobileTab } from '@/models/domain'
import { useDexStore } from '@/stores/dex'
import { useUiStore } from '@/stores/ui'
import TopBar from '@/components/ui-components/topbar/TopBar.vue'
import ModeSubnav from './components/ModeSubnav.vue'
import TeamListPanel from './components/TeamListPanel.vue'
import TeamInsightsPanel from './components/TeamInsightsPanel.vue'
import RightSidebarPanel from './components/RightSidebarPanel.vue'

const route = useRoute()
const { t, locale } = useI18n()
const dexStore = useDexStore()
const uiStore = useUiStore()
const topBarRef = ref<HTMLElement | null>(null)
const subnavRef = ref<HTMLElement | null>(null)
const rightColumnRef = ref<HTMLElement | null>(null)
const stickyTop = ref(72)
const rightColumnTop = ref(72)
const rightColumnLeft = ref(0)
const rightColumnWidth = ref(360)
const hasCompletedInitialHydration = ref(false)
const bootPhase = ref<'catalog' | 'dex' | 'cache'>('catalog')
let bootPhaseTimerA: ReturnType<typeof setTimeout> | null = null
let bootPhaseTimerB: ReturnType<typeof setTimeout> | null = null

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const isWideCanvasRoute = computed(() => {
  const name = String(route.name ?? '')
  return name === 'damage-calc' || name === 'about'
})
const rightSidebarPreset = computed<'builder' | 'analytics' | 'strategy' | 'dex'>(() => {
  const name = String(route.name ?? 'builder')
  if (name === 'analytics') return 'analytics'
  if (name === 'strategy') return 'strategy'
  if (name === 'dex') return 'dex'
  return 'builder'
})
const insightsPreset = computed<'builder' | 'analytics' | 'strategy' | 'dex'>(() => {
  const name = String(route.name ?? 'builder')
  if (name === 'analytics') return 'analytics'
  if (name === 'strategy') return 'strategy'
  if (name === 'dex') return 'dex'
  return 'builder'
})
const dexSource = String(import.meta.env.VITE_DEX_SOURCE ?? 'snapshot').toLowerCase()
const showInitialAppLoader = computed(
  () => !hasCompletedInitialHydration.value && dexStore.hydrationStatus !== 'ready',
)
const appLoaderTitle = computed(() => t('app.bootTitle'))
const appLoaderBody = computed(() =>
  dexSource === 'api' ? t('app.bootBodyApi') : t('app.bootBodySnapshot'),
)
const appLoaderMudkipSprite = computed(() =>
  dexSource === 'api'
    ? 'https://play.pokemonshowdown.com/sprites/ani/mudkip.gif'
    : 'https://play.pokemonshowdown.com/sprites/ani-shiny/mudkip.gif',
)
const appLoaderStatus = computed(() => {
  if (bootPhase.value === 'catalog') return t('app.bootStatusCatalog')
  if (bootPhase.value === 'dex') return t('app.bootStatusDex')
  return t('app.bootStatusCache')
})
const appLoaderHint = computed(() => t('app.bootHint'))

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function localeCode(): 'es' | 'en' {
  return locale.value === 'en' ? 'en' : 'es'
}

function ensureDexHydration() {
  void dexStore.ensureCatalogLoaded({
    locale: localeCode(),
    pokemonLimit: numberFromEnv(import.meta.env.VITE_DEX_POKEMON_LIMIT, 1025),
    movesLimit: numberFromEnv(import.meta.env.VITE_DEX_MOVES_LIMIT, 700),
    itemsLimit: numberFromEnv(import.meta.env.VITE_DEX_ITEMS_LIMIT, 0),
    concurrency: dexSource === 'api' ? numberFromEnv(import.meta.env.VITE_DEX_CONCURRENCY, 12) : 0,
  })
}
const desktopLeftStyle = computed(() => ({
  top: `${stickyTop.value}px`,
}))

const desktopRightStyle = computed(() => ({
  top: `${rightColumnTop.value}px`,
  left: `${rightColumnLeft.value}px`,
  width: `${rightColumnWidth.value}px`,
  height: `calc(100vh - ${rightColumnTop.value + 16}px)`,
  maxHeight: `calc(100vh - ${rightColumnTop.value + 16}px)`,
}))

const desktopRightPlaceholderStyle = computed(() => ({
  height: `calc(100vh - ${rightColumnTop.value + 16}px)`,
}))

function recalculateStickyTop() {
  const topBarHeight = topBarRef.value?.offsetHeight ?? 0
  const subnavHeight = subnavRef.value?.offsetHeight ?? 0
  stickyTop.value = Math.max(16, topBarHeight + subnavHeight + 24)
}

function recalculateRightColumnMetrics() {
  const rect = rightColumnRef.value?.getBoundingClientRect()
  if (!rect) return
  const topInDocument = rect.top + window.scrollY
  rightColumnTop.value = Math.max(16, Math.round(topInDocument))
  rightColumnLeft.value = rect.left
  rightColumnWidth.value = rect.width
}

function recalculateLayoutMetrics() {
  recalculateStickyTop()
  recalculateRightColumnMetrics()
}

function setTab(tab: MobileTab) {
  uiStore.setMobileTab(tab)
}

function onBootLoaderSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  if (target.src !== mudkipSprite) {
    target.src = mudkipSprite
  }
}

function clearBootPhaseTimers() {
  if (bootPhaseTimerA) {
    clearTimeout(bootPhaseTimerA)
    bootPhaseTimerA = null
  }
  if (bootPhaseTimerB) {
    clearTimeout(bootPhaseTimerB)
    bootPhaseTimerB = null
  }
}

function startBootPhaseSequence() {
  clearBootPhaseTimers()
  bootPhase.value = 'catalog'
  bootPhaseTimerA = setTimeout(() => {
    bootPhase.value = 'dex'
  }, 900)
  bootPhaseTimerB = setTimeout(() => {
    bootPhase.value = 'cache'
  }, 1900)
}

onMounted(() => {
  void nextTick(() => {
    recalculateLayoutMetrics()
  })
  ensureDexHydration()
  window.addEventListener('resize', recalculateLayoutMetrics)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', recalculateLayoutMetrics)
  clearBootPhaseTimers()
})

watch(
  () => route.fullPath,
  () => {
    ensureDexHydration()
    void nextTick(() => {
      recalculateLayoutMetrics()
    })
  },
)

watch([mode, () => locale.value], () => {
  ensureDexHydration()
})

watch(
  () => dexStore.hydrationStatus,
  (status) => {
    if (!hasCompletedInitialHydration.value && status === 'loading') {
      startBootPhaseSequence()
    }
    if (status === 'ready') {
      clearBootPhaseTimers()
      hasCompletedInitialHydration.value = true
    }
    if (status === 'error') {
      clearBootPhaseTimers()
    }
  },
  { immediate: true },
)
</script>

<template>
  <main
    class="relative mx-auto flex min-h-screen w-[90vw] max-w-[90vw] flex-col gap-4 p-4 md:p-6"
    :aria-busy="showInitialAppLoader"
  >
    <div :class="showInitialAppLoader ? 'pointer-events-none select-none opacity-35 blur-[2px]' : ''">
      <div ref="topBarRef">
        <TopBar />
      </div>
      <div ref="subnavRef">
        <ModeSubnav />
      </div>

      <section v-if="isWideCanvasRoute" class="overflow-visible">
        <router-view :key="`${mode}-${String(route.name ?? '')}`" />
      </section>

      <section v-else class="grid gap-4 overflow-visible lg:grid-cols-[280px_minmax(0,1fr)_360px] lg:items-start">
        <div
          class="hidden lg:flex lg:flex-col lg:gap-4 lg:sticky lg:self-start"
          :style="desktopLeftStyle"
        >
          <TeamListPanel />
          <TeamInsightsPanel :preset="insightsPreset" />
        </div>

        <div class="space-y-4">
          <div class="rounded-xl border border-sky-500/25 bg-off-black/70 p-2 lg:hidden">
            <div class="grid grid-cols-3 gap-2">
              <button
                class="rounded-md border px-2 py-1 text-sm"
                :class="uiStore.mobileTab === 'team' ? 'border-sky-500 bg-sky-500/15' : 'border-gray-700'"
                @click="setTab('team')"
              >
                {{ t('common.team') }}
              </button>
              <button
                class="rounded-md border px-2 py-1 text-sm"
                :class="uiStore.mobileTab === 'editor' ? 'border-sky-500 bg-sky-500/15' : 'border-gray-700'"
                @click="setTab('editor')"
              >
                {{ t('common.editor') }}
              </button>
              <button
                class="rounded-md border px-2 py-1 text-sm"
                :class="uiStore.mobileTab === 'insights' ? 'border-sky-500 bg-sky-500/15' : 'border-gray-700'"
                @click="setTab('insights')"
              >
                {{ t('common.insights') }}
              </button>
            </div>
          </div>

          <div v-if="uiStore.mobileTab === 'team'" class="lg:hidden">
            <TeamListPanel />
          </div>

          <div :class="uiStore.mobileTab === 'editor' ? 'block' : 'hidden lg:block'" class="min-w-0">
            <router-view :key="`${mode}-${String(route.name ?? '')}`" />
          </div>

          <div v-if="uiStore.mobileTab === 'insights'" class="lg:hidden">
            <TeamInsightsPanel :preset="insightsPreset" />
          </div>
        </div>

        <div
          ref="rightColumnRef"
          class="hidden lg:block lg:min-h-0"
          :style="desktopRightPlaceholderStyle"
        >
          <div
            class="lg:fixed lg:z-20 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden"
            :style="desktopRightStyle"
          >
            <RightSidebarPanel :preset="rightSidebarPreset" />
          </div>
        </div>
      </section>
    </div>

    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showInitialAppLoader"
        class="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(2,6,23,0.98))] px-4"
      >
        <article class="relative w-full max-w-md overflow-hidden rounded-3xl border border-sky-400/25 bg-off-black/85 p-6 text-center shadow-2xl backdrop-blur">
          <div class="pointer-events-none absolute inset-x-8 top-0 h-24 bg-[radial-gradient(circle,rgba(103,232,249,0.16),transparent_68%)] blur-2xl" />
          <div class="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10">
            <span class="absolute inset-0 rounded-full border border-cyan-300/25 animate-ping" />
            <span class="absolute -left-3 top-5 h-2.5 w-2.5 rounded-full bg-cyan-200/80 shadow-[0_0_18px_rgba(103,232,249,0.55)] animate-bounce" style="animation-duration: 1.9s;" />
            <span class="absolute -right-2 top-8 h-3 w-3 rounded-full bg-sky-300/70 shadow-[0_0_18px_rgba(56,189,248,0.5)] animate-bounce" style="animation-delay: 220ms; animation-duration: 2.2s;" />
            <span class="absolute left-2 bottom-3 h-2 w-2 rounded-full bg-cyan-100/75 shadow-[0_0_14px_rgba(186,230,253,0.45)] animate-bounce" style="animation-delay: 480ms; animation-duration: 1.7s;" />
            <span class="absolute right-3 bottom-1 h-1.5 w-1.5 rounded-full bg-sky-200/70 shadow-[0_0_12px_rgba(125,211,252,0.45)] animate-bounce" style="animation-delay: 760ms; animation-duration: 2.1s;" />
            <img
              :src="appLoaderMudkipSprite"
              alt="Mudkip"
              class="relative z-10 h-[4.5rem] w-[4.5rem] object-contain drop-shadow-[0_0_20px_rgba(56,189,248,0.4)]"
              @error="onBootLoaderSpriteError"
            />
          </div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-300/80">
            {{ t('app.title') }}
          </p>
          <h2 class="mt-3 text-xl font-semibold text-sky-100">
            {{ appLoaderTitle }}
          </h2>
          <p class="mt-2 text-sm leading-6 text-gray-300">
            {{ appLoaderBody }}
          </p>

          <div class="mt-5 overflow-hidden rounded-full border border-sky-500/20 bg-black/35 p-1">
            <div class="h-2 rounded-full bg-[linear-gradient(90deg,rgba(56,189,248,0.85),rgba(103,232,249,1),rgba(59,130,246,0.85),rgba(56,189,248,0.85))] bg-[length:200%_100%] animate-[loader-wave_1.6s_linear_infinite]" />
          </div>

          <p class="mt-3 text-xs font-medium tracking-wide text-cyan-200">
            {{ appLoaderStatus }}
          </p>

          <div class="mt-4 grid grid-cols-3 gap-2 text-[11px] text-gray-400">
            <div class="rounded-xl border border-gray-800 bg-black/30 px-2 py-2">{{ t('nav.builder') }}</div>
            <div class="rounded-xl border border-gray-800 bg-black/30 px-2 py-2">{{ t('nav.analytics') }}</div>
            <div class="rounded-xl border border-gray-800 bg-black/30 px-2 py-2">{{ t('nav.dex') }}</div>
          </div>

          <p class="mt-4 text-xs text-gray-400">
            {{ appLoaderHint }}
          </p>
        </article>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
@keyframes loader-wave {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: 200% 50%;
  }
}
</style>
