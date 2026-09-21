<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BuilderCatalogPanel from './BuilderCatalogPanel.vue'
import RightSidebarBlock from './right-sidebar/RightSidebarBlock.vue'
import AnalyticsQuickWidgets from './right-sidebar/AnalyticsQuickWidgets.vue'
import StrategyRadarPanel from './right-sidebar/StrategyRadarPanel.vue'

type RightSidebarPreset = 'builder' | 'analytics' | 'strategy' | 'dex'

const props = withDefaults(
  defineProps<{
    preset?: RightSidebarPreset
  }>(),
  {
    preset: 'builder',
  },
)

const { t } = useI18n()

const presetTitle = computed(() => {
  if (props.preset === 'analytics') return t('common.rightPanelAnalytics')
  if (props.preset === 'strategy') return t('common.rightPanelStrategy')
  if (props.preset === 'dex') return t('common.rightPanelDex')
  return t('common.rightPanelBuilder')
})
</script>

<template>
  <BuilderCatalogPanel v-if="props.preset === 'builder'" />

  <section
    v-else
    class="flex h-full min-h-0 flex-col rounded-2xl border border-sky-500/25 bg-off-black/70 p-3"
  >
    <div class="shrink-0">
      <h2 class="text-sm font-semibold text-sky-300">{{ t('common.rightPanelTitle') }}</h2>
      <p class="mt-1 text-[11px] text-gray-400">{{ presetTitle }}</p>
    </div>

    <div class="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      <AnalyticsQuickWidgets v-if="props.preset === 'analytics'" />
      <StrategyRadarPanel v-else-if="props.preset === 'strategy'" />

      <RightSidebarBlock v-else :title="t('common.rightPanelPlaceholderTitle')">
        <p class="text-xs text-gray-400">{{ t('common.rightPanelPlaceholderBody') }}</p>
      </RightSidebarBlock>
    </div>
  </section>
</template>
