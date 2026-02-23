import type { DamageBattleType, DamageGeneration } from '@/models/damage-calc'

export interface DamageRules {
  generation: DamageGeneration
  criticalMultiplier: number
  burnPhysicalMultiplier: number
  terrainOffenseMultiplier: number
  spreadMoveMultiplier: number
  randomRolls: number[]
  screenMultiplierSingles: number
  screenMultiplierDoubles: number
  protectMultiplier: number
}

function buildRolls(): number[] {
  const rolls: number[] = []
  for (let value = 85; value <= 100; value += 1) rolls.push(value / 100)
  return rolls
}

const BASE_ROLLS = buildRolls()

export const DAMAGE_RULES_BY_GEN: Record<DamageGeneration, DamageRules> = {
  gen1: {
    generation: 'gen1',
    criticalMultiplier: 2,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1,
    spreadMoveMultiplier: 1,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 0.5,
    protectMultiplier: 0.25,
  },
  gen2: {
    generation: 'gen2',
    criticalMultiplier: 2,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1,
    spreadMoveMultiplier: 1,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 0.5,
    protectMultiplier: 0.25,
  },
  gen3: {
    generation: 'gen3',
    criticalMultiplier: 2,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1,
    spreadMoveMultiplier: 1,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
  gen4: {
    generation: 'gen4',
    criticalMultiplier: 2,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1,
    spreadMoveMultiplier: 0.75,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
  gen5: {
    generation: 'gen5',
    criticalMultiplier: 2,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1,
    spreadMoveMultiplier: 0.75,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
  gen6: {
    generation: 'gen6',
    criticalMultiplier: 1.5,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1.5,
    spreadMoveMultiplier: 0.75,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
  gen7: {
    generation: 'gen7',
    criticalMultiplier: 1.5,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1.5,
    spreadMoveMultiplier: 0.75,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
  gen8: {
    generation: 'gen8',
    criticalMultiplier: 1.5,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1.3,
    spreadMoveMultiplier: 0.75,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
  gen9: {
    generation: 'gen9',
    criticalMultiplier: 1.5,
    burnPhysicalMultiplier: 0.5,
    terrainOffenseMultiplier: 1.3,
    spreadMoveMultiplier: 0.75,
    randomRolls: BASE_ROLLS,
    screenMultiplierSingles: 0.5,
    screenMultiplierDoubles: 2 / 3,
    protectMultiplier: 0.25,
  },
}

export function getDamageRules(generation: DamageGeneration): DamageRules {
  return DAMAGE_RULES_BY_GEN[generation] ?? DAMAGE_RULES_BY_GEN.gen9
}

export function screenMultiplierForBattleType(rules: DamageRules, battleType: DamageBattleType): number {
  return battleType === 'doubles' ? rules.screenMultiplierDoubles : rules.screenMultiplierSingles
}

