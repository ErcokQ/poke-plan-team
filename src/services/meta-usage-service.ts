import type { MetaFormatKey, PokemonMetaUsageMap, RankedUsage } from '@/models/meta'
import { resolvePublicAssetPath } from '@/utils/base-path'

interface RawUsageRatio {
  raw?: number
  real?: number
  weighted?: number
}

interface RawPokemonMetaEntry {
  usage?: RawUsageRatio
  items?: Record<string, number>
  moves?: Record<string, number>
  teammates?: Record<string, number>
}

interface RawFormatPayload {
  pokemon?: Record<string, RawPokemonMetaEntry>
}

const LOCAL_META_FORMAT_PATHS: Partial<Record<MetaFormatKey, string>> = {
  'champions-vgc-reg-mc': 'meta-snapshots/champions/vgc-reg-mc.json',
}

const META_ID_ALIASES: Record<string, string> = {
  aegislash: 'aegislash-shield',
  basculegion: 'basculegion-male',
  maushold: 'maushold-family-of-four',
}

export interface MetaUsageProvider {
  loadFormat(format: MetaFormatKey): Promise<PokemonMetaUsageMap>
}

export function normalizeMetaId(raw: string): string {
  const id = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return META_ID_ALIASES[id] ?? id
}

function usageWeight(entry: RawPokemonMetaEntry): number {
  const usage = entry.usage
  if (!usage) return 0
  if (typeof usage.weighted === 'number') return usage.weighted
  if (typeof usage.real === 'number') return usage.real
  if (typeof usage.raw === 'number') return usage.raw
  return 0
}

function toRankedUsage(
  values: Record<string, number> | undefined,
  normalizer: (value: string) => string = normalizeMetaId,
): RankedUsage[] {
  if (!values) return []

  return Object.entries(values)
    .map(([id, weight]) => ({
      id: normalizer(id),
      weight: Number.isFinite(weight) ? weight : 0,
    }))
    .filter((entry) => entry.id.length > 0 && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
}

export class PkmnCcUsageProvider implements MetaUsageProvider {
  constructor(private readonly baseUrl = 'https://data.pkmn.cc/stats') {}

  async loadFormat(format: MetaFormatKey): Promise<PokemonMetaUsageMap> {
    const response = await fetch(`${this.baseUrl}/${format}.json`)
    if (!response.ok) {
      throw new Error(`MetaUsage request failed (${response.status}) for ${format}`)
    }

    const payload = (await response.json()) as RawFormatPayload
    const pokemonData = payload.pokemon ?? {}
    const map: PokemonMetaUsageMap = {}

    for (const [name, entry] of Object.entries(pokemonData)) {
      const pokemonId = normalizeMetaId(name)
      if (!pokemonId) continue

      map[pokemonId] = {
        usage: usageWeight(entry),
        items: toRankedUsage(entry.items),
        moves: toRankedUsage(entry.moves),
        teammates: toRankedUsage(entry.teammates),
      }
    }

    return map
  }
}

export class LocalSnapshotUsageProvider implements MetaUsageProvider {
  async loadFormat(format: MetaFormatKey): Promise<PokemonMetaUsageMap> {
    const path = LOCAL_META_FORMAT_PATHS[format]
    if (!path) {
      throw new Error(`No local meta snapshot configured for ${format}`)
    }

    const response = await fetch(resolvePublicAssetPath(path), {
      cache: import.meta.env.DEV ? 'no-store' : 'force-cache',
    })
    if (!response.ok) {
      throw new Error(`Local meta snapshot request failed (${response.status}) for ${format}`)
    }

    const payload = (await response.json()) as RawFormatPayload
    const pokemonData = payload.pokemon ?? {}
    const map: PokemonMetaUsageMap = {}

    for (const [id, entry] of Object.entries(pokemonData)) {
      const pokemonId = normalizeMetaId(id)
      if (!pokemonId) continue

      map[pokemonId] = {
        usage: usageWeight(entry),
        items: toRankedUsage(entry.items),
        moves: toRankedUsage(entry.moves),
        teammates: toRankedUsage(entry.teammates),
      }
    }

    return map
  }
}

export class HybridMetaUsageProvider implements MetaUsageProvider {
  constructor(
    private readonly localProvider: MetaUsageProvider = new LocalSnapshotUsageProvider(),
    private readonly remoteProvider: MetaUsageProvider = new PkmnCcUsageProvider(),
  ) {}

  loadFormat(format: MetaFormatKey): Promise<PokemonMetaUsageMap> {
    return LOCAL_META_FORMAT_PATHS[format]
      ? this.localProvider.loadFormat(format)
      : this.remoteProvider.loadFormat(format)
  }
}

export class MetaUsageService {
  private readonly cache = new Map<MetaFormatKey, Promise<PokemonMetaUsageMap>>()

  constructor(private readonly provider: MetaUsageProvider = new HybridMetaUsageProvider()) {}

  async loadFormat(format: MetaFormatKey): Promise<PokemonMetaUsageMap> {
    if (!this.cache.has(format)) {
      this.cache.set(format, this.provider.loadFormat(format))
    }
    return this.cache.get(format)!
  }

  resetCache() {
    this.cache.clear()
  }
}

export const metaUsageService = new MetaUsageService()
