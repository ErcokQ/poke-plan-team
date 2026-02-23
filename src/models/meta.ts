import type { BattleMode, PokemonTypeKey, StatKey } from './domain'

export type MetaFormatKey = 'gen9ou' | 'gen9vgc2026'
export type MetaLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface RankedUsage {
  id: string
  weight: number
}

export interface PokemonMetaUsage {
  usage: number
  items: RankedUsage[]
  moves: RankedUsage[]
  teammates: RankedUsage[]
}

export type PokemonMetaUsageMap = Record<string, PokemonMetaUsage>
export type ModeMetaMap = Record<BattleMode, MetaFormatKey>

export interface MetaTemplateSet {
  abilityId: string
  itemId: string
  natureId: string
  teraType?: PokemonTypeKey
  moves: [string, string, string, string]
  evs: Record<StatKey, number>
  ivs: Record<StatKey, number>
  level: number
}

export interface MetaTemplateMember extends MetaTemplateSet {
  slot: 1 | 2 | 3 | 4 | 5 | 6
  pokemonId: string
}

export interface MetaTeamTemplate {
  id: string
  name: string
  members: MetaTemplateMember[]
}

export interface MetaBenchmarkTemplate {
  id: string
  pokemonId: string
  set: MetaTemplateSet
}

export interface MetaTemplateDataset {
  teams: MetaTeamTemplate[]
  benchmarks: MetaBenchmarkTemplate[]
}

export const MODE_META_MAP: ModeMetaMap = {
  singles: 'gen9ou',
  vgc: 'gen9vgc2026',
}
