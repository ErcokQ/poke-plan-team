export type BattleMode = 'vgc' | 'singles'
export type LocaleCode = 'es' | 'en'

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'

export type TeamRole = 'sweeper' | 'support' | 'pivot' | 'wall' | 'speed-control'

export interface StatBlock {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export interface PokemonEntry {
  id: string
  name: string
  pokedexNumber: number
  types: PokemonTypeKey[]
  evolutionChain: string[]
  preEvolutionChain?: string[]
  abilities: string[]
  requiredItemId?: string
  suggestedItems: string[]
  suggestedMoves: string[]
  learnsetMoves?: string[]
  championsLearnsetMoves?: string[]
  defaultNature: string
  baseStats: StatBlock
  heightMeters?: number
  weightKg?: number
  roleTags: TeamRole[]
}

export interface MoveEntry {
  id: string
  name: string
  type: PokemonTypeKey
  category: 'physical' | 'special' | 'status'
  power: number
  accuracy?: number | null
  pp?: number | null
  priority?: number
  tags: string[]
  description?: string
  effect?: string
}

export interface ItemEntry {
  id: string
  championsAvailable?: boolean
  name: string
  tags: string[]
  description?: string
  effect?: string
  icon?: string | null
  category?: string
  flingPower?: number | null
}

export interface ArchetypeEntry {
  id: string
  name: string
  summary: string
  threats: string[]
}

export interface TeamMember {
  slot: 1 | 2 | 3 | 4 | 5 | 6
  pokemonId: string
  teraType?: PokemonTypeKey
  abilityId: string
  itemId?: string
  natureId: string
  evs: Record<StatKey, number>
  ivs: Record<StatKey, number>
  moves: [string, string, string, string]
  roleTags: TeamRole[]
}

export interface Team {
  id: string
  name: string
  mode: BattleMode
  members: TeamMember[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ScoreWeights {
  offenseCoverage: number
  defenseCoverage: number
  roleBalance: number
  speedControl: number
}

export interface TeamAnalytics {
  totalScore: number
  offenseCoverage: number
  defenseCoverage: number
  roleBalance: number
  speedControl: number
  weaknesses: Record<PokemonTypeKey, number>
  resistances: Record<PokemonTypeKey, number>
  keyAlerts: string[]
  matchupScore?: number
  matchupOffenseScore?: number
  matchupDefenseBaseScore?: number
  matchupDefenseTeraScore?: number
  planScore?: number
  tempoScore?: number
  resourcesScore?: number
  resourcesRisk?: number
  baseWeaknesses?: Record<PokemonTypeKey, number>
  baseResistances?: Record<PokemonTypeKey, number>
  pillarDiagnostics?: {
    plan: string
    tempo: string
    matchups: string
    resources: string
  }
}

export interface StrategySection {
  title: string
  bullets: string[]
}

export type StrategyThreatSeenTag = 'common' | 'danger' | 'prep' | 'solved'

export interface StrategyThreatSetProfile {
  commonMoves: string[]
  commonItems: string[]
  commonAbilities: string[]
  commonTeraTypes: PokemonTypeKey[]
  commonPartners: string[]
}

export interface StrategyQuickAction {
  id: 'open-damage-calc' | 'load-quick-rival'
}

export interface StrategyViewState {
  selectedThreatPokemonId: string | null
}

export interface StrategyThreatNote extends StrategyThreatSetProfile {
  pokemonId: string
  timesSeen: number
  lastSeenAt: string
  tags: StrategyThreatSeenTag[]
  notes: string
  responsePlan: string
  lastEditedAt: string
}

export interface StrategyDraft {
  mode: BattleMode
  teamId: string
  autoSections: StrategySection[]
  userEdits: string
  threatNotes: StrategyThreatNote[]
  selectedThreatPokemonId: string | null
  updatedAt: string
}

export interface ImportPayload {
  version: 'v1'
  team: Team
}

export interface CompactImportPayload {
  version: 'v1-share'
  team: Pick<Team, 'name' | 'mode' | 'members' | 'notes'>
}

export type MobileTab = 'team' | 'editor' | 'insights' | 'tools'

export const STATS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

export const TEAM_ROLES: TeamRole[] = ['sweeper', 'support', 'pivot', 'wall', 'speed-control']

export const DEFAULT_WEIGHTS: ScoreWeights = {
  offenseCoverage: 25,
  defenseCoverage: 25,
  roleBalance: 25,
  speedControl: 25,
}

export const MAX_EVS = 66
export const MAX_EV_PER_STAT = 32
export const MAX_IV_PER_STAT = 31

export type PokemonTypeKey =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy'

export const TYPE_KEYS: PokemonTypeKey[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]
