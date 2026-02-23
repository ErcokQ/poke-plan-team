<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
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
const dexSource = String(import.meta.env.VITE_DEX_SOURCE ?? 'api').toLowerCase()

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function localeCode(): 'es' | 'en' {
  return locale.value === 'en' ? 'en' : 'es'
}

function ensureDexHydration() {
  if (dexSource === 'mock') return
  void dexStore.ensureHydrated({
    locale: localeCode(),
    pokemonLimit: numberFromEnv(import.meta.env.VITE_DEX_POKEMON_LIMIT, 1025),
    movesLimit: numberFromEnv(import.meta.env.VITE_DEX_MOVES_LIMIT, 700),
    itemsLimit: numberFromEnv(import.meta.env.VITE_DEX_ITEMS_LIMIT, 0),
    concurrency: numberFromEnv(import.meta.env.VITE_DEX_CONCURRENCY, 12),
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

onMounted(() => {
  void nextTick(() => {
    recalculateLayoutMetrics()
  })
  ensureDexHydration()
  window.addEventListener('resize', recalculateLayoutMetrics)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', recalculateLayoutMetrics)
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
</script>

<template>
  <main class="mx-auto flex min-h-screen w-[90vw] max-w-[90vw] flex-col gap-4 p-4 md:p-6">
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
  </main>
</template>
