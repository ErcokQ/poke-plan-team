import type { MetaFormatKey, PokemonMetaUsageMap, RankedUsage } from '@/models/meta'

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

export interface MetaUsageProvider {
  loadFormat(format: MetaFormatKey): Promise<PokemonMetaUsageMap>
}

export function normalizeMetaId(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

export class MetaUsageService {
  private readonly cache = new Map<MetaFormatKey, Promise<PokemonMetaUsageMap>>()

  constructor(private readonly provider: MetaUsageProvider = new PkmnCcUsageProvider()) {}

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
