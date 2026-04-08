import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { BattleMode } from '@/models/domain'
import { MODE_META_MAP, type MetaFormatKey, type MetaLoadStatus, type PokemonMetaUsage } from '@/models/meta'
import { metaUsageService } from '@/services/meta-usage-service'

type ModeStatusMap = Record<BattleMode, MetaLoadStatus>
type ModeErrorMap = Record<BattleMode, string | null>

export const useMetaUsageStore = defineStore('meta-usage', () => {
  const statusByMode = ref<ModeStatusMap>({
    singles: 'idle',
    vgc: 'idle',
  })
  const errorByMode = ref<ModeErrorMap>({
    singles: null,
    vgc: null,
  })
  const usageByFormat = ref<Partial<Record<MetaFormatKey, Record<string, PokemonMetaUsage>>>>({})
  const pendingByFormat = new Map<MetaFormatKey, Promise<void>>()

  async function ensureFormatLoaded(format: MetaFormatKey) {
    if (usageByFormat.value[format]) return
    if (pendingByFormat.has(format)) {
      await pendingByFormat.get(format)
      return
    }

    const task = metaUsageService.loadFormat(format).then((payload) => {
      usageByFormat.value = {
        ...usageByFormat.value,
        [format]: payload,
      }
    })

    pendingByFormat.set(format, task)
    try {
      await task
    } finally {
      pendingByFormat.delete(format)
    }
  }

  async function ensureModeLoaded(mode: BattleMode) {
    const format = MODE_META_MAP[mode]
    if (!format) return
    if (statusByMode.value[mode] === 'ready') return

    statusByMode.value[mode] = 'loading'
    errorByMode.value[mode] = null

    try {
      await ensureFormatLoaded(format)
      statusByMode.value[mode] = 'ready'
    } catch (error) {
      usageByFormat.value = {
        ...usageByFormat.value,
        [format]: usageByFormat.value[format] ?? {},
      }
      statusByMode.value[mode] = 'ready'
      errorByMode.value[mode] = null
      console.warn(`[MetaUsage] Falling back to local-only mode for ${mode}`, error)
    }
  }

  function getPokemonMeta(mode: BattleMode, pokemonId: string): PokemonMetaUsage | undefined {
    if (!pokemonId) return undefined
    const format = MODE_META_MAP[mode]
    if (!format) return undefined
    return usageByFormat.value[format]?.[pokemonId]
  }

  function getModeStatus(mode: BattleMode): MetaLoadStatus {
    return statusByMode.value[mode]
  }

  return {
    statusByMode,
    errorByMode,
    ensureModeLoaded,
    getPokemonMeta,
    getModeStatus,
  }
})
