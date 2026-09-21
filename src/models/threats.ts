import type { BattleMode, PokemonTypeKey, TeamMember } from './domain'

export type ThreatKind = 'pokemon' | 'archetype'
export type ThreatResponseLevel = 'solid' | 'soft' | 'none'
export type ThreatResponseStatus = 'good' | 'warning' | 'danger'

export interface ThreatProfile {
  id: string
  name: string
  kind: ThreatKind
  pokemonId?: string
  defensiveTypes: PokemonTypeKey[]
  threatMoveTypes: PokemonTypeKey[]
  expectedSpeed: number
  utilityCountersAny: string[]
  priority: number
}

export interface MemberThreatCheckSignals {
  defensiveAnswer: boolean
  speedAnswer: boolean
  pressureAnswer: boolean
  utilityAnswer: boolean
}

export interface MemberThreatCheck {
  slot: TeamMember['slot']
  pokemonId: string
  pokemonName: string
  level: ThreatResponseLevel
  score: number
  signals: MemberThreatCheckSignals
}

export interface ThreatResponder {
  slot: TeamMember['slot']
  pokemonId: string
  pokemonName: string
  level: ThreatResponseLevel
}

export interface ThreatResponseRow {
  threatId: string
  name: string
  kind: ThreatKind
  pokemonId?: string
  solidCount: number
  softCount: number
  status: ThreatResponseStatus
  priority: number
  usage: number
  topResponders: ThreatResponder[]
}

export interface ThreatResponseSummary {
  total: number
  goodCount: number
  warningCount: number
  dangerCount: number
  goodPercent: number
  criticalThreats: ThreatResponseRow[]
}

export interface EvaluateThreatContext {
  mode: BattleMode
  getThreatUsage?: (pokemonId: string) => number
}
