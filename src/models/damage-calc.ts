import type { BattleMode, PokemonTypeKey, StatKey, TeamMember } from '@/models/domain'
import type { DexAvailabilityFilterKey } from './dex'

export type DamageGeneration =
  | 'gen1'
  | 'gen2'
  | 'gen3'
  | 'gen4'
  | 'gen5'
  | 'gen6'
  | 'gen7'
  | 'gen8'
  | 'gen9'

export type DamageBattleType = 'singles' | 'doubles'
export type DamageSideId = 'A' | 'B'
export type DamageStatus = 'healthy' | 'burn' | 'poison' | 'toxic' | 'paralyze' | 'sleep' | 'freeze'
export type DamageMoveOrderHint = 'auto' | 'before-target' | 'after-target'

export type DamageSlotNumber = TeamMember['slot']

export interface DamageCombatContext {
  wasHitThisTurn: boolean
  tookDamageThisTurn: boolean
  statsLoweredThisTurn: boolean
  previousMoveFailed: boolean
  moveOrderHint: DamageMoveOrderHint
  consecutiveMoveUses: number
  timesHitThisBattle: number
  alliesFaintedCount: number
  stockpileCount: number
  friendship: number
}

export interface DamageSlotSet {
  slot: DamageSlotNumber
  pokemonId: string
  abilityId: string
  itemId: string
  natureId: string
  evs: Record<StatKey, number>
  ivs: Record<StatKey, number>
  teraType?: PokemonTypeKey
  isTeraActive: boolean
  moves: [string, string, string, string]
  level: number
  currentHpPercent: number
  status: DamageStatus
  stages: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>
  combatContext: DamageCombatContext
}

export interface DamageSideState {
  slots: DamageSlotSet[]
  activeSlotIds: DamageSlotNumber[]
  targetByAttacker: Record<string, DamageSlotNumber>
}

export interface DamageHazardsState {
  stealthRock: boolean
  spikesLayers: 0 | 1 | 2 | 3
  toxicSpikesLayers: 0 | 1 | 2
  stickyWeb: boolean
}

export interface DamageSideFieldState {
  reflect: boolean
  lightScreen: boolean
  auroraVeil: boolean
  friendGuard: boolean
  helpingHand: boolean
  battery: boolean
  powerSpot: boolean
  hazards: DamageHazardsState
  protectBySlot: Record<string, boolean>
}

export interface DamageFieldState {
  weather: 'none' | 'sun' | 'rain' | 'sand' | 'snow' | 'harsh-sunshine' | 'heavy-rain' | 'strong-winds'
  terrain: 'none' | 'electric' | 'grassy' | 'misty' | 'psychic'
  sideA: DamageSideFieldState
  sideB: DamageSideFieldState
  globalFlags: {
    gravity: boolean
    magicRoom: boolean
    wonderRoom: boolean
  }
  advancedFlags: Record<string, boolean>
}

export interface DamageSelectedPair {
  attackerSide: DamageSideId
  attackerSlot: DamageSlotNumber
  defenderSlot: DamageSlotNumber
}

export interface DamageCalcScenario {
  mode: BattleMode
  generation: DamageGeneration
  battleType: DamageBattleType
  sideA: DamageSideState
  sideB: DamageSideState
  field: DamageFieldState
  selectedPair: DamageSelectedPair
}

export interface DamageRollResult {
  min: number
  max: number
  rolls: number[]
  sequenceRolls?: {
    fresh: number[]
    chipped: number[]
    hitsPerUse: number
  }
  minPercent: number
  maxPercent: number
  koText: string
  koResidualText?: string
  moveId: string
  moveName: string
}

export interface DamageMatrixCell {
  attackerSide: DamageSideId
  attackerSlot: DamageSlotNumber
  defenderSlot: DamageSlotNumber
  bestMoveId: string
  bestMoveName: string
  minPercent: number
  maxPercent: number
  koText: string
  koResidualText?: string
}

export interface DamagePairComputation {
  attackerSide: DamageSideId
  attackerSlot: DamageSlotNumber
  defenderSlot: DamageSlotNumber
  resultsByMove: DamageRollResult[]
  best: DamageRollResult | null
}

export type DamageLineThreatFocus = 'leads' | 'line'

export interface DamageLineThreatEntry {
  id: string
  name: string
  pokedexNumber: number
  types: PokemonTypeKey[]
  availability: DexAvailabilityFilterKey[]
  baseSpeed: number
  usage: number
  abilityName: string
  offenseBias: 'physical' | 'special' | 'mixed'
  reasons: string[]
  leadPressure: number
  linePressure: number
  tempoScore: number
  score: number
}
