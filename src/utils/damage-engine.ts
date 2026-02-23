import type { MoveEntry, PokemonEntry } from '@/models/domain'
import type {
  DamageCalcScenario,
  DamageMatrixCell,
  DamagePairComputation,
  DamageRollResult,
  DamageSideId,
  DamageSlotNumber,
  DamageSlotSet,
} from '@/models/damage-calc'
import { effectivenessAgainstDual } from '@/models/type-chart'
import { calculateBattleStats } from '@/utils/stat-calc'
import { getDamageRules, screenMultiplierForBattleType } from '@/utils/damage-rules'

interface DamageDexResolver {
  getPokemon: (mode: DamageCalcScenario['mode'], pokemonId: string) => PokemonEntry | undefined
  getMove: (moveId: string) => MoveEntry | undefined
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function stageMultiplier(stage: number): number {
  const normalized = Math.max(-6, Math.min(6, Math.floor(stage)))
  if (normalized >= 0) return (2 + normalized) / 2
  return 2 / (2 - normalized)
}

function hasTag(move: MoveEntry, value: string): boolean {
  return move.tags.some((tag) => tag === value)
}

function isSpreadMove(move: MoveEntry): boolean {
  const targets = ['all-opponents', 'all-adjacent-foes', 'all-other-pokemon', 'all-pokemon']
  return targets.some((target) => hasTag(move, target))
}

function isPhysicalMove(move: MoveEntry): boolean {
  return move.category === 'physical'
}

function isSpecialMove(move: MoveEntry): boolean {
  return move.category === 'special'
}

function getOpposingSideId(side: DamageSideId): DamageSideId {
  return side === 'A' ? 'B' : 'A'
}

function sideById(scenario: DamageCalcScenario, sideId: DamageSideId) {
  return sideId === 'A' ? scenario.sideA : scenario.sideB
}

function sideFieldById(scenario: DamageCalcScenario, sideId: DamageSideId) {
  return sideId === 'A' ? scenario.field.sideA : scenario.field.sideB
}

function lookupSlot(slots: DamageSlotSet[], slot: DamageSlotNumber): DamageSlotSet | undefined {
  return slots.find((entry) => entry.slot === slot)
}

function calcCurrentHp(maxHp: number, currentHpPercent: number): number {
  const safePercent = clamp(currentHpPercent, 1, 100)
  return Math.max(1, Math.floor((maxHp * safePercent) / 100))
}

function abilityIs(abilityId: string, target: string): boolean {
  return abilityId.trim().toLowerCase() === target
}

function isRockType(types: string[]): boolean {
  return types.includes('rock')
}

function isIceType(types: string[]): boolean {
  return types.includes('ice')
}

function moveTypeEffectiveness(
  moveType: MoveEntry['type'],
  defenderTypes: [MoveEntry['type'], MoveEntry['type'] | undefined],
): number {
  return effectivenessAgainstDual(moveType, defenderTypes[0], defenderTypes[1])
}

function stabMultiplier(
  move: MoveEntry,
  attackerBaseTypes: string[],
  attacker: DamageSlotSet,
): number {
  const baseHasType = attackerBaseTypes.includes(move.type)
  let stab = baseHasType ? 1.5 : 1

  if (attacker.isTeraActive && attacker.teraType) {
    if (move.type === attacker.teraType) {
      stab = baseHasType ? 2 : 1.5
    }
  }

  if (abilityIs(attacker.abilityId, 'adaptability') && stab > 1) {
    return stab >= 2 ? 2.25 : 2
  }

  return stab
}

function weatherMultiplier(weather: DamageCalcScenario['field']['weather'], move: MoveEntry): number {
  if (weather === 'heavy-rain' && move.type === 'fire') return 0
  if (weather === 'harsh-sunshine' && move.type === 'water') return 0

  if (weather === 'sun' || weather === 'harsh-sunshine') {
    if (move.type === 'fire') return 1.5
    if (move.type === 'water') return 0.5
  }
  if (weather === 'rain' || weather === 'heavy-rain') {
    if (move.type === 'water') return 1.5
    if (move.type === 'fire') return 0.5
  }
  return 1
}

function terrainMultiplier(
  terrain: DamageCalcScenario['field']['terrain'],
  move: MoveEntry,
  terrainOffenseMultiplier: number,
): number {
  if (terrain === 'electric' && move.type === 'electric') return terrainOffenseMultiplier
  if (terrain === 'grassy' && move.type === 'grass') return terrainOffenseMultiplier
  if (terrain === 'psychic' && move.type === 'psychic') return terrainOffenseMultiplier
  if (terrain === 'misty' && move.type === 'dragon') return 0.5
  return 1
}

function friendlyModifier(itemId: string, move: MoveEntry): number {
  const item = itemId.trim().toLowerCase()
  if (item === 'life-orb') return 1.3
  if (item === 'muscle-band' && isPhysicalMove(move)) return 1.1
  if (item === 'wise-glasses' && isSpecialMove(move)) return 1.1
  if (item === 'expert-belt') return 1
  return 1
}

function applyAttackItemMultiplier(itemId: string, move: MoveEntry): number {
  const item = itemId.trim().toLowerCase()
  if (item === 'choice-band' && isPhysicalMove(move)) return 1.5
  if (item === 'choice-specs' && isSpecialMove(move)) return 1.5
  if (item === 'booster-energy') return 1.3
  return 1
}

function applyDefenseItemMultiplier(itemId: string, move: MoveEntry): number {
  const item = itemId.trim().toLowerCase()
  if (item === 'assault-vest' && isSpecialMove(move)) return 1.5
  return 1
}

function abilityDamageMultiplierOnAttack(abilityId: string, move: MoveEntry): number {
  if (abilityIs(abilityId, 'tinted-lens')) return 1
  if (abilityIs(abilityId, 'solar-power') && isSpecialMove(move)) return 1.5
  return 1
}

function abilityAttackStatMultiplier(abilityId: string, move: MoveEntry, status: DamageSlotSet['status']): number {
  if ((abilityIs(abilityId, 'huge-power') || abilityIs(abilityId, 'pure-power')) && isPhysicalMove(move)) return 2
  if (abilityIs(abilityId, 'guts') && isPhysicalMove(move) && status !== 'healthy') return 1.5
  return 1
}

function defenderAbilityModifier(
  abilityId: string,
  move: MoveEntry,
  typeEffectiveness: number,
  defenderAtFullHp: boolean,
): number {
  let modifier = 1

  if (abilityIs(abilityId, 'thick-fat') && (move.type === 'fire' || move.type === 'ice')) modifier *= 0.5
  if (
    (abilityIs(abilityId, 'filter') || abilityIs(abilityId, 'solid-rock') || abilityIs(abilityId, 'prism-armor')) &&
    typeEffectiveness > 1
  ) {
    modifier *= 0.75
  }
  if ((abilityIs(abilityId, 'multiscale') || abilityIs(abilityId, 'shadow-shield')) && defenderAtFullHp) modifier *= 0.5

  return modifier
}

function finalDefenderTypes(baseTypes: string[], defender: DamageSlotSet): [MoveEntry['type'], MoveEntry['type'] | undefined] {
  if (defender.isTeraActive && defender.teraType) return [defender.teraType, undefined]
  return [baseTypes[0] as MoveEntry['type'], baseTypes[1] as MoveEntry['type'] | undefined]
}

function moveEffectivePower(move: MoveEntry): number {
  if (move.power > 0) return move.power
  return 0
}

function koTextFromRolls(rolls: number[], currentHp: number): string {
  if (rolls.length === 0 || currentHp <= 0) return 'Estimated no damage'

  const minRoll = Math.min(...rolls)
  const maxRoll = Math.max(...rolls)

  if (minRoll >= currentHp) return 'Estimated guaranteed OHKO'
  if (maxRoll >= currentHp) return 'Estimated possible OHKO'
  if (minRoll * 2 >= currentHp) return 'Estimated guaranteed 2HKO'
  if (maxRoll * 2 >= currentHp) return 'Estimated possible 2HKO'
  if (minRoll * 3 >= currentHp) return 'Estimated guaranteed 3HKO'
  if (maxRoll * 3 >= currentHp) return 'Estimated possible 3HKO'
  if (maxRoll * 4 >= currentHp) return 'Estimated possible 4HKO'
  return 'Estimated 5+ hits to KO'
}

function statusActionMultiplier(scenario: DamageCalcScenario, attacker: DamageSlotSet, move: MoveEntry): number {
  const useExpected = Boolean(scenario.field.advancedFlags.expectedDamageMode)
  if (!useExpected) return 1

  // Expected value approximation for statuses that can skip turns.
  if (attacker.status === 'paralyze') return 0.75
  if (attacker.status === 'sleep') {
    const sleepUsableMoves = new Set(['sleep-talk', 'snore'])
    return sleepUsableMoves.has(move.id) ? 1 : 0.33
  }
  if (attacker.status === 'freeze') {
    // Approximate chance to act this turn after thaw checks.
    return 0.2
  }
  return 1
}

function residualFractionByStatus(status: DamageSlotSet['status'], generation: DamageCalcScenario['generation']): number {
  if (status === 'burn') {
    return generation === 'gen7' || generation === 'gen8' || generation === 'gen9' ? 1 / 16 : 1 / 8
  }
  if (status === 'poison') return 1 / 8
  if (status === 'toxic') return 1 / 16
  return 0
}

function computeMoveDamage(
  scenario: DamageCalcScenario,
  resolver: DamageDexResolver,
  attackerSide: DamageSideId,
  attackerSlot: DamageSlotNumber,
  defenderSlot: DamageSlotNumber,
  move: MoveEntry,
  options: { forceCritical?: boolean } = {},
): DamageRollResult | null {
  const rules = getDamageRules(scenario.generation)
  const defenderSide = getOpposingSideId(attackerSide)
  const attackerSideState = sideById(scenario, attackerSide)
  const defenderSideState = sideById(scenario, defenderSide)
  const attackerField = sideFieldById(scenario, attackerSide)
  const defenderField = sideFieldById(scenario, defenderSide)

  const attacker = lookupSlot(attackerSideState.slots, attackerSlot)
  const defender = lookupSlot(defenderSideState.slots, defenderSlot)
  if (!attacker || !defender || !attacker.pokemonId || !defender.pokemonId) return null

  const attackerDex = resolver.getPokemon(scenario.mode, attacker.pokemonId)
  const defenderDex = resolver.getPokemon(scenario.mode, defender.pokemonId)
  if (!attackerDex || !defenderDex) return null

  if (move.category === 'status' || move.power <= 0) {
    return {
      min: 0,
      max: 0,
      rolls: Array.from({ length: 16 }, () => 0),
      minPercent: 0,
      maxPercent: 0,
      koText: 'Status move',
      moveId: move.id,
      moveName: move.name,
    }
  }

  const attackerStats = calculateBattleStats(
    attackerDex.baseStats,
    attacker.ivs,
    attacker.evs,
    attacker.level,
    attacker.natureId,
  )
  const defenderStats = calculateBattleStats(
    defenderDex.baseStats,
    defender.ivs,
    defender.evs,
    defender.level,
    defender.natureId,
  )

  const critical = Boolean(options.forceCritical)
  const attackStage =
    move.category === 'physical' ? attacker.stages.atk ?? 0 : attacker.stages.spa ?? 0
  const defenseStage =
    move.category === 'physical' ? defender.stages.def ?? 0 : defender.stages.spd ?? 0

  const attackerBaseTypes = attackerDex.types.length > 0 ? attackerDex.types : ['normal']
  const defenderBaseTypes = defenderDex.types.length > 0 ? defenderDex.types : ['normal']
  const defenderTypes = finalDefenderTypes(defenderBaseTypes, defender)
  const typeMult = moveTypeEffectiveness(move.type, defenderTypes)
  if (typeMult === 0) {
    return {
      min: 0,
      max: 0,
      rolls: Array.from({ length: 16 }, () => 0),
      minPercent: 0,
      maxPercent: 0,
      koText: 'No effect',
      moveId: move.id,
      moveName: move.name,
    }
  }

  const magicRoomActive = scenario.field.globalFlags.magicRoom
  let atkValue = move.category === 'physical' ? attackerStats.atk : attackerStats.spa
  let defValue = move.category === 'physical' ? defenderStats.def : defenderStats.spd
  if (scenario.field.globalFlags.wonderRoom) {
    defValue = move.category === 'physical' ? defenderStats.spd : defenderStats.def
  }

  atkValue = Math.floor(atkValue * stageMultiplier(attackStage))
  defValue = Math.floor(defValue * stageMultiplier(defenseStage))
  atkValue = Math.floor(atkValue * abilityAttackStatMultiplier(attacker.abilityId, move, attacker.status))
  atkValue = Math.floor(atkValue * (magicRoomActive ? 1 : applyAttackItemMultiplier(attacker.itemId, move)))
  if (isSpecialMove(move) && scenario.field.weather === 'sand' && isRockType(defenderTypes.filter(Boolean) as string[])) {
    defValue = Math.floor(defValue * 1.5)
  }
  if (isPhysicalMove(move) && scenario.field.weather === 'snow' && rules.generation === 'gen9' && isIceType(defenderTypes.filter(Boolean) as string[])) {
    defValue = Math.floor(defValue * 1.5)
  }
  defValue = Math.floor(defValue * (magicRoomActive ? 1 : applyDefenseItemMultiplier(defender.itemId, move)))

  const level = clamp(attacker.level, 1, 100)
  const power = moveEffectivePower(move)
  const raw = Math.floor(Math.floor(((Math.floor((2 * level) / 5) + 2) * power * Math.max(1, atkValue)) / Math.max(1, defValue)) / 50) + 2

  let modifier = 1
  modifier *= weatherMultiplier(scenario.field.weather, move)
  modifier *= terrainMultiplier(scenario.field.terrain, move, rules.terrainOffenseMultiplier)
  modifier *= typeMult
  modifier *= stabMultiplier(move, attackerBaseTypes, attacker)
  modifier *= friendlyModifier(attacker.itemId, move)
  modifier *= abilityDamageMultiplierOnAttack(attacker.abilityId, move)

  if (abilityIs(attacker.abilityId, 'tinted-lens') && typeMult > 0 && typeMult < 1) modifier *= 2
  if (attacker.itemId === 'expert-belt' && typeMult > 1) modifier *= 1.2

  if (critical) {
    modifier *= rules.criticalMultiplier
    if (abilityIs(attacker.abilityId, 'sniper')) modifier *= 1.5
  } else {
    const screenMult = screenMultiplierForBattleType(rules, scenario.battleType)
    if (defenderField.auroraVeil) modifier *= screenMult
    if (isPhysicalMove(move) && defenderField.reflect) modifier *= screenMult
    if (isSpecialMove(move) && defenderField.lightScreen) modifier *= screenMult
  }

  if (attacker.status === 'burn' && isPhysicalMove(move) && !abilityIs(attacker.abilityId, 'guts')) {
    modifier *= rules.burnPhysicalMultiplier
  }
  if (attacker.status !== 'healthy' && move.id === 'facade') modifier *= 2
  modifier *= statusActionMultiplier(scenario, attacker, move)

  const assumeSpreadHitsMultipleTargets =
    scenario.field.advancedFlags.assumeSpreadHitsMultipleTargets === undefined
      ? defenderSideState.activeSlotIds.length > 1
      : Boolean(scenario.field.advancedFlags.assumeSpreadHitsMultipleTargets)

  if (scenario.battleType === 'doubles' && isSpreadMove(move) && assumeSpreadHitsMultipleTargets) {
    modifier *= rules.spreadMoveMultiplier
  }

  if (defenderField.protectBySlot[String(defenderSlot)]) modifier *= rules.protectMultiplier
  if (attackerField.helpingHand) modifier *= 1.5
  if (attackerField.powerSpot) modifier *= 1.3
  if (attackerField.battery && isSpecialMove(move)) modifier *= 1.3
  if (defenderField.friendGuard) modifier *= 0.75

  const defenderCurrentHp = calcCurrentHp(defenderStats.hp, defender.currentHpPercent)
  const defenderAtFullHp = defender.currentHpPercent >= 100
  modifier *= defenderAbilityModifier(defender.abilityId, move, typeMult, defenderAtFullHp)

  const residualFraction = residualFractionByStatus(defender.status, rules.generation)
  const residualDamage =
    residualFraction > 0 ? Math.max(1, Math.floor(defenderStats.hp * residualFraction)) : 0
  const defenderHpAfterResidual = residualDamage > 0 ? Math.max(1, defenderCurrentHp - residualDamage) : defenderCurrentHp

  const rolls = rules.randomRolls.map((random) => {
    const value = Math.floor(raw * modifier * random)
    return Math.max(1, value)
  })

  const min = Math.min(...rolls)
  const max = Math.max(...rolls)
  const minPercent = Math.round((min / defenderCurrentHp) * 1000) / 10
  const maxPercent = Math.round((max / defenderCurrentHp) * 1000) / 10
  const baseKoText = koTextFromRolls(rolls, defenderCurrentHp)
  const residualKoText =
    residualDamage > 0 ? koTextFromRolls(rolls, defenderHpAfterResidual) : baseKoText

  return {
    min,
    max,
    rolls,
    minPercent,
    maxPercent,
    koText: residualDamage > 0 ? `${baseKoText} (estimated with residual: ${residualKoText})` : baseKoText,
    moveId: move.id,
    moveName: move.name,
  }
}

export function computePairDamage(
  scenario: DamageCalcScenario,
  resolver: DamageDexResolver,
  attackerSide: DamageSideId,
  attackerSlot: DamageSlotNumber,
  defenderSlot: DamageSlotNumber,
  moveIndex?: number,
): DamagePairComputation {
  const side = sideById(scenario, attackerSide)
  const attacker = lookupSlot(side.slots, attackerSlot)

  if (!attacker) {
    return {
      attackerSide,
      attackerSlot,
      defenderSlot,
      resultsByMove: [],
      best: null,
    }
  }

  const moveIndexes = typeof moveIndex === 'number' ? [moveIndex] : [0, 1, 2, 3]
  const resultsByMove: DamageRollResult[] = []

  for (const index of moveIndexes) {
    const moveId = attacker.moves[index as 0 | 1 | 2 | 3]
    if (!moveId) continue
    const move = resolver.getMove(moveId)
    if (!move) continue
    const result = computeMoveDamage(scenario, resolver, attackerSide, attackerSlot, defenderSlot, move)
    if (!result) continue
    resultsByMove.push(result)
  }

  const best =
    resultsByMove.length > 0
      ? [...resultsByMove].sort((a, b) => b.maxPercent - a.maxPercent || b.minPercent - a.minPercent)[0]
      : null

  return {
    attackerSide,
    attackerSlot,
    defenderSlot,
    resultsByMove,
    best,
  }
}

export function computeMatrixDamage(
  scenario: DamageCalcScenario,
  resolver: DamageDexResolver,
  attackerSide: DamageSideId,
): DamageMatrixCell[] {
  const attackerState = sideById(scenario, attackerSide)
  const defenderState = sideById(scenario, getOpposingSideId(attackerSide))
  const cells: DamageMatrixCell[] = []

  for (const attackerSlot of attackerState.activeSlotIds) {
    for (const defenderSlot of defenderState.activeSlotIds) {
      const pair = computePairDamage(scenario, resolver, attackerSide, attackerSlot, defenderSlot)
      const best = pair.best
      cells.push({
        attackerSide,
        attackerSlot,
        defenderSlot,
        bestMoveId: best?.moveId ?? '',
        bestMoveName: best?.moveName ?? '-',
        minPercent: best?.minPercent ?? 0,
        maxPercent: best?.maxPercent ?? 0,
        koText: best?.koText ?? 'No move',
      })
    }
  }

  return cells
}
