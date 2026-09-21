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
      statusByMode.value[mode] = 'error'
      errorByMode.value[mode] = error instanceof Error ? error.message : String(error)
      console.warn(`[MetaUsage] Falling back to local-only mode for ${mode}`, error)
    }
  }

  function pokemonMetaLookupIds(pokemonId: string): string[] {
    const normalized = pokemonId.trim()
    if (!normalized) return []

    const ids = [normalized]
    const baseFromMega = normalized.replace(/-mega(?:-[xy])?$/, '')
    if (baseFromMega && baseFromMega !== normalized) ids.push(baseFromMega)
    return ids
  }

  function getPokemonMeta(mode: BattleMode, pokemonId: string): PokemonMetaUsage | undefined {
    if (!pokemonId) return undefined
    const format = MODE_META_MAP[mode]
    if (!format) return undefined
    const usage = usageByFormat.value[format]
    if (!usage) return undefined

    for (const lookupId of pokemonMetaLookupIds(pokemonId)) {
      const meta = usage[lookupId]
      if (meta) return meta
    }
    return undefined
  }

  function getExactPokemonMeta(mode: BattleMode, pokemonId: string): PokemonMetaUsage | undefined {
    const format = MODE_META_MAP[mode]
    return format ? usageByFormat.value[format]?.[pokemonId] : undefined
  }

  function getModeStatus(mode: BattleMode): MetaLoadStatus {
    return statusByMode.value[mode]
  }

  return {
    statusByMode,
    errorByMode,
    ensureModeLoaded,
    getPokemonMeta,
    getExactPokemonMeta,
    getModeStatus,
  }
})
