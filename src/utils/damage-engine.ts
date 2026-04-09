import type { ItemEntry, MoveEntry, PokemonEntry } from '@/models/domain'
import type {
  DamageCalcScenario,
  DamageCombatContext,
  DamageMatrixCell,
  DamageMoveOrderHint,
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
  getItem?: (itemId: string) => ItemEntry | undefined
}

type DamageSideRole = 'attacker' | 'defender'
type OffensiveStatKey = 'atk' | 'spa' | 'def'
type DefensiveStatClass = 'physical' | 'special'

interface DamageStatProfile {
  offenseOwner: DamageSideRole
  offenseStat: OffensiveStatKey
  offenseStage: OffensiveStatKey
  defenseClass: DefensiveStatClass
}

function defaultCombatContext(): DamageCombatContext {
  return {
    wasHitThisTurn: false,
    tookDamageThisTurn: false,
    statsLoweredThisTurn: false,
    previousMoveFailed: false,
    moveOrderHint: 'auto',
    consecutiveMoveUses: 0,
    timesHitThisBattle: 0,
    alliesFaintedCount: 0,
    stockpileCount: 0,
    friendship: 255,
  }
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

function weatherMultiplier(weather: DamageCalcScenario['field']['weather'], moveType: MoveEntry['type']): number {
  if (weather === 'heavy-rain' && moveType === 'fire') return 0
  if (weather === 'harsh-sunshine' && moveType === 'water') return 0

  if (weather === 'sun' || weather === 'harsh-sunshine') {
    if (moveType === 'fire') return 1.5
    if (moveType === 'water') return 0.5
  }
  if (weather === 'rain' || weather === 'heavy-rain') {
    if (moveType === 'water') return 1.5
    if (moveType === 'fire') return 0.5
  }
  return 1
}

function terrainMultiplier(
  terrain: DamageCalcScenario['field']['terrain'],
  moveType: MoveEntry['type'],
  terrainOffenseMultiplier: number,
): number {
  if (terrain === 'electric' && moveType === 'electric') return terrainOffenseMultiplier
  if (terrain === 'grassy' && moveType === 'grass') return terrainOffenseMultiplier
  if (terrain === 'psychic' && moveType === 'psychic') return terrainOffenseMultiplier
  if (terrain === 'misty' && moveType === 'dragon') return 0.5
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

function applyAttackItemMultiplier(itemId: string, move: MoveEntry, profile: DamageStatProfile): number {
  const item = itemId.trim().toLowerCase()
  if (profile.offenseOwner !== 'attacker') return 1
  if (item === 'choice-band' && profile.offenseStat === 'atk') return 1.5
  if (item === 'choice-specs' && profile.offenseStat === 'spa') return 1.5
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

function abilityAttackStatMultiplier(abilityId: string, profile: DamageStatProfile, status: DamageSlotSet['status']): number {
  if (profile.offenseOwner !== 'attacker') return 1
  if ((abilityIs(abilityId, 'huge-power') || abilityIs(abilityId, 'pure-power')) && profile.offenseStat === 'atk') return 2
  if (abilityIs(abilityId, 'guts') && profile.offenseStat === 'atk' && status !== 'healthy') return 1.5
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

function effectiveMoveType(
  move: MoveEntry,
  weather: DamageCalcScenario['field']['weather'],
  terrain: DamageCalcScenario['field']['terrain'],
): MoveEntry['type'] {
  if (move.id === 'weather-ball') {
    if (weather === 'sun' || weather === 'harsh-sunshine') return 'fire'
    if (weather === 'rain' || weather === 'heavy-rain') return 'water'
    if (weather === 'sand') return 'rock'
    if (weather === 'snow') return 'ice'
  }

  if (move.id === 'terrain-pulse') {
    if (terrain === 'electric') return 'electric'
    if (terrain === 'grassy') return 'grass'
    if (terrain === 'psychic') return 'psychic'
    if (terrain === 'misty') return 'fairy'
  }

  return move.type
}

function moveEffectivePower(options: {
  move: MoveEntry
  attackerDex: PokemonEntry
  defenderDex: PokemonEntry
  attacker: DamageSlotSet
  defender: DamageSlotSet
  attackerSide: DamageSideId
  attackerStats: ReturnType<typeof calculateBattleStats>
  defenderStats: ReturnType<typeof calculateBattleStats>
  attackerCurrentHp: number
  attackerMaxHp: number
  defenderCurrentHp: number
  defenderMaxHp: number
  weather: DamageCalcScenario['field']['weather']
  terrain: DamageCalcScenario['field']['terrain']
  scenario: DamageCalcScenario
  resolver: DamageDexResolver
}): number {
  const {
    move,
    attackerDex,
    defenderDex,
    attacker,
    defender,
    attackerSide,
    attackerStats,
    defenderStats,
    attackerCurrentHp,
    attackerMaxHp,
    defenderCurrentHp,
    defenderMaxHp,
    weather,
    terrain,
    scenario,
    resolver,
  } = options
  const attackerContext = combatContextFor(attacker)
  const defenderContext = combatContextFor(defender)
  const moveOrderHint = resolveMoveOrderHint(
    attacker,
    defender,
    move,
    attackerSide,
    attackerStats,
    defenderStats,
    scenario,
  )

  let power = move.power > 0 ? move.power : 0
  if (power <= 0) return 0

  switch (move.id) {
    case 'facade':
      if (attacker.status !== 'healthy') power *= 2
      break
    case 'hex':
    case 'infernal-parade':
      if (defender.status !== 'healthy') power *= 2
      break
    case 'venoshock':
    case 'barb-barrage':
      if (defender.status === 'poison' || defender.status === 'toxic') power *= 2
      break
    case 'brine':
      if (defenderCurrentHp * 2 <= defenderMaxHp) power *= 2
      break
    case 'avalanche':
    case 'revenge':
      if (attackerContext.wasHitThisTurn) power *= 2
      break
    case 'assurance':
      if (defenderContext.tookDamageThisTurn) power *= 2
      break
    case 'payback':
      if (moveOrderHint === 'after-target') power *= 2
      break
    case 'bolt-beak':
    case 'fishious-rend':
      if (moveOrderHint === 'before-target') power *= 2
      break
    case 'lash-out':
      if (attackerContext.statsLoweredThisTurn) power *= 2
      break
    case 'stomping-tantrum':
      if (attackerContext.previousMoveFailed) power *= 2
      break
    case 'eruption':
    case 'water-spout':
    case 'dragon-energy':
      power = Math.max(1, Math.floor((150 * attackerCurrentHp) / Math.max(1, attackerMaxHp)))
      break
    case 'acrobatics':
      if (!attacker.itemId) power *= 2
      break
    case 'weather-ball':
      power = weather === 'none' ? 50 : 100
      break
    case 'terrain-pulse':
      power = terrain === 'none' ? 50 : 100
      break
    case 'psyblade':
    case 'expanding-force':
      if (terrain === 'electric' || terrain === 'psychic') power = Math.floor(power * 1.5)
      break
    case 'misty-explosion':
      if (terrain === 'misty') power = Math.floor(power * 1.5)
      break
    case 'hydro-steam':
      if (weather === 'sun' || weather === 'harsh-sunshine') power = Math.floor(power * 1.5)
      break
    case 'solar-beam':
    case 'solar-blade':
      if (weather === 'rain' || weather === 'heavy-rain' || weather === 'sand' || weather === 'snow') {
        power = Math.floor(power * 0.5)
      }
      break
    case 'flail':
    case 'reversal': {
      const ratio = attackerCurrentHp / Math.max(1, attackerMaxHp)
      if (ratio <= 1 / 48) power = 200
      else if (ratio <= 1 / 5) power = 150
      else if (ratio <= 7 / 20) power = 100
      else if (ratio <= 35 / 100) power = 80
      else if (ratio <= 7 / 10) power = 40
      else power = 20
      break
    }
    case 'crush-grip':
    case 'wring-out': {
      power = Math.max(1, Math.floor((120 * defenderCurrentHp) / Math.max(1, defenderMaxHp)))
      break
    }
    case 'hard-press': {
      power = Math.max(1, Math.floor((100 * defenderCurrentHp) / Math.max(1, defenderMaxHp)))
      break
    }
    case 'stored-power':
    case 'power-trip':
      power += statStageSum(attacker.stages) * 20
      break
    case 'punishment':
      power = Math.min(200, 60 + statStageSum(defender.stages) * 20)
      break
    case 'fling': {
      const item = attacker.itemId ? resolver.getItem?.(attacker.itemId) : undefined
      power = item?.flingPower ?? 0
      break
    }
    case 'electro-ball': {
      const attackerSpeed = effectiveSpeed(attacker, attackerStats.spe, attackerSide, scenario)
      const defenderSpeed = effectiveSpeed(
        defender,
        defenderStats.spe,
        attackerSide === 'A' ? 'B' : 'A',
        scenario,
      )
      const ratio = attackerSpeed / Math.max(1, defenderSpeed)
      if (ratio >= 4) power = 150
      else if (ratio >= 3) power = 120
      else if (ratio >= 2) power = 80
      else if (ratio > 1) power = 60
      else power = 40
      break
    }
    case 'gyro-ball': {
      const attackerSpeed = effectiveSpeed(attacker, attackerStats.spe, attackerSide, scenario)
      const defenderSpeed = effectiveSpeed(
        defender,
        defenderStats.spe,
        attackerSide === 'A' ? 'B' : 'A',
        scenario,
      )
      power = Math.max(1, Math.min(150, Math.floor((25 * defenderSpeed) / Math.max(1, attackerSpeed))))
      break
    }
    case 'knock-off':
      if (defender.itemId) power = Math.floor(power * 1.5)
      break
    case 'fury-cutter': {
      const chainCount = Math.max(1, attackerContext.consecutiveMoveUses || 1)
      power = Math.min(160, power * 2 ** (chainCount - 1))
      break
    }
    case 'rollout':
    case 'ice-ball': {
      const chainCount = Math.max(1, attackerContext.consecutiveMoveUses || 1)
      power = Math.min(480, power * 2 ** (chainCount - 1))
      break
    }
    case 'rage-fist':
      power = Math.min(350, 50 + attackerContext.timesHitThisBattle * 50)
      break
    case 'last-respects':
      power = 50 + attackerContext.alliesFaintedCount * 50
      break
    case 'spit-up':
      power = attackerContext.stockpileCount <= 0 ? 0 : attackerContext.stockpileCount * 100
      break
    case 'return':
      power = Math.max(1, Math.floor((attackerContext.friendship * 10) / 25))
      break
    case 'frustration':
      power = Math.max(1, Math.floor(((255 - attackerContext.friendship) * 10) / 25))
      break
    case 'low-kick':
    case 'grass-knot':
      power = lowKickPower(weightKgForPokemon(defenderDex))
      break
    case 'heavy-slam':
    case 'heat-crash':
      power = weightRatioPower(weightKgForPokemon(attackerDex), weightKgForPokemon(defenderDex))
      break
  }

  return power
}

function koTextFromRolls(rolls: number[], currentHp: number): string {
  if (rolls.length === 0 || currentHp <= 0) return 'noDamage'

  const minRoll = Math.min(...rolls)
  const maxRoll = Math.max(...rolls)

  if (minRoll >= currentHp) return 'guaranteedOhko'
  if (maxRoll >= currentHp) return 'possibleOhko'
  if (minRoll * 2 >= currentHp) return 'guaranteed2hko'
  if (maxRoll * 2 >= currentHp) return 'possible2hko'
  if (minRoll * 3 >= currentHp) return 'guaranteed3hko'
  if (maxRoll * 3 >= currentHp) return 'possible3hko'
  if (maxRoll * 4 >= currentHp) return 'possible4hko'
  return 'fivePlusHits'
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

function resolveDamageStatProfile(
  move: MoveEntry,
  attackerStats: ReturnType<typeof calculateBattleStats>,
  defenderStats: ReturnType<typeof calculateBattleStats>,
  attacker: DamageSlotSet,
  defender: DamageSlotSet,
  scenario: DamageCalcScenario,
): DamageStatProfile {
  switch (move.id) {
    case 'body-press':
      return {
        offenseOwner: 'attacker',
        offenseStat: 'def',
        offenseStage: 'def',
        defenseClass: 'physical',
      }
    case 'psyshock':
    case 'psystrike':
    case 'secret-sword':
      return {
        offenseOwner: 'attacker',
        offenseStat: 'spa',
        offenseStage: 'spa',
        defenseClass: 'physical',
      }
    case 'foul-play':
      return {
        offenseOwner: 'defender',
        offenseStat: 'atk',
        offenseStage: 'atk',
        defenseClass: 'physical',
      }
    case 'photon-geyser':
      if (attackerStats.atk > attackerStats.spa) {
        return {
          offenseOwner: 'attacker',
          offenseStat: 'atk',
          offenseStage: 'atk',
          defenseClass: 'physical',
        }
      }
      return {
        offenseOwner: 'attacker',
        offenseStat: 'spa',
        offenseStage: 'spa',
        defenseClass: 'special',
      }
    case 'shell-side-arm': {
      const attackerAtk = Math.floor(attackerStats.atk * stageMultiplier(attacker.stages.atk ?? 0))
      const attackerSpa = Math.floor(attackerStats.spa * stageMultiplier(attacker.stages.spa ?? 0))
      const defenderDef = Math.floor(defenderStats.def * stageMultiplier(defender.stages.def ?? 0))
      const defenderSpd = Math.floor(defenderStats.spd * stageMultiplier(defender.stages.spd ?? 0))
      const physicalScore = attackerAtk / Math.max(1, defenderDef)
      const specialScore = attackerSpa / Math.max(1, defenderSpd)
      return physicalScore > specialScore
        ? {
            offenseOwner: 'attacker',
            offenseStat: 'atk',
            offenseStage: 'atk',
            defenseClass: 'physical',
          }
        : {
            offenseOwner: 'attacker',
            offenseStat: 'spa',
            offenseStage: 'spa',
            defenseClass: 'special',
          }
    }
    case 'terrain-pulse':
      if (attacker.isTeraActive && attacker.teraType && scenario.field.terrain !== 'none') {
        return {
          offenseOwner: 'attacker',
          offenseStat: 'spa',
          offenseStage: 'spa',
          defenseClass: 'special',
        }
      }
      break
  }

  if (move.category === 'physical') {
    return {
      offenseOwner: 'attacker',
      offenseStat: 'atk',
      offenseStage: 'atk',
      defenseClass: 'physical',
    }
  }

  return {
    offenseOwner: 'attacker',
    offenseStat: 'spa',
    offenseStage: 'spa',
    defenseClass: 'special',
  }
}

function statStageSum(stages: DamageSlotSet['stages']): number {
  return (stages.atk ?? 0) + (stages.def ?? 0) + (stages.spa ?? 0) + (stages.spd ?? 0) + (stages.spe ?? 0)
}

function effectiveSpeed(
  slot: DamageSlotSet,
  baseSpeed: number,
  side: DamageSideId,
  scenario: DamageCalcScenario,
): number {
  let speed = Math.floor(baseSpeed * stageMultiplier(slot.stages.spe ?? 0))

  if (slot.itemId === 'choice-scarf') speed = Math.floor(speed * 1.5)
  if (slot.status === 'paralyze') speed = Math.floor(speed * 0.5)
  if (abilityIs(slot.abilityId, 'quick-feet') && slot.status !== 'healthy') speed = Math.floor(speed * 1.5)

  const weather = scenario.field.weather
  if (abilityIs(slot.abilityId, 'chlorophyll') && (weather === 'sun' || weather === 'harsh-sunshine')) speed *= 2
  if (abilityIs(slot.abilityId, 'swift-swim') && (weather === 'rain' || weather === 'heavy-rain')) speed *= 2
  if (abilityIs(slot.abilityId, 'sand-rush') && weather === 'sand') speed *= 2
  if (abilityIs(slot.abilityId, 'slush-rush') && weather === 'snow') speed *= 2
  if (abilityIs(slot.abilityId, 'surge-surfer') && scenario.field.terrain === 'electric') speed *= 2

  const hasTailwind =
    side === 'A'
      ? Boolean(scenario.field.advancedFlags.tailwindA)
      : Boolean(scenario.field.advancedFlags.tailwindB)
  if (hasTailwind) speed *= 2

  return Math.max(1, speed)
}

function combatContextFor(slot: DamageSlotSet): DamageCombatContext {
  return slot.combatContext ?? defaultCombatContext()
}

function resolveMoveOrderHint(
  attacker: DamageSlotSet,
  defender: DamageSlotSet,
  move: MoveEntry,
  attackerSide: DamageSideId,
  attackerStats: ReturnType<typeof calculateBattleStats>,
  defenderStats: ReturnType<typeof calculateBattleStats>,
  scenario: DamageCalcScenario,
): DamageMoveOrderHint {
  const hint = combatContextFor(attacker).moveOrderHint
  if (hint !== 'auto') return hint

  if ((move.priority ?? 0) > 0) return 'before-target'
  if ((move.priority ?? 0) < 0) return 'after-target'

  const attackerSpeed = effectiveSpeed(attacker, attackerStats.spe, attackerSide, scenario)
  const defenderSpeed = effectiveSpeed(
    defender,
    defenderStats.spe,
    attackerSide === 'A' ? 'B' : 'A',
    scenario,
  )

  const trickRoom = Boolean(scenario.field.advancedFlags.trickRoom)
  if (attackerSpeed === defenderSpeed) return 'auto'
  if (trickRoom) return attackerSpeed < defenderSpeed ? 'before-target' : 'after-target'
  return attackerSpeed > defenderSpeed ? 'before-target' : 'after-target'
}

function weightKgForPokemon(pokemon?: PokemonEntry): number {
  return pokemon?.weightKg && Number.isFinite(pokemon.weightKg) ? pokemon.weightKg : 0
}

function lowKickPower(targetWeightKg: number): number {
  if (targetWeightKg < 10) return 20
  if (targetWeightKg < 25) return 40
  if (targetWeightKg < 50) return 60
  if (targetWeightKg < 100) return 80
  if (targetWeightKg < 200) return 100
  return 120
}

function weightRatioPower(attackerWeightKg: number, defenderWeightKg: number): number {
  if (attackerWeightKg <= 0 || defenderWeightKg <= 0) return 40
  const ratio = attackerWeightKg / Math.max(0.1, defenderWeightKg)
  if (ratio >= 5) return 120
  if (ratio >= 4) return 100
  if (ratio >= 3) return 80
  if (ratio >= 2) return 60
  return 40
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
      koText: 'statusMove',
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
  const statProfile = resolveDamageStatProfile(
    move,
    attackerStats,
    defenderStats,
    attacker,
    defender,
    scenario,
  )

  const attackerBaseTypes = attackerDex.types.length > 0 ? attackerDex.types : ['normal']
  const defenderBaseTypes = defenderDex.types.length > 0 ? defenderDex.types : ['normal']
  const defenderTypes = finalDefenderTypes(defenderBaseTypes, defender)
  const attackerCurrentHp = calcCurrentHp(attackerStats.hp, attacker.currentHpPercent)
  const defenderCurrentHp = calcCurrentHp(defenderStats.hp, defender.currentHpPercent)
  const resolvedMoveType = effectiveMoveType(move, scenario.field.weather, scenario.field.terrain)
  const typeMult = moveTypeEffectiveness(resolvedMoveType, defenderTypes)
  if (typeMult === 0) {
    return {
      min: 0,
      max: 0,
      rolls: Array.from({ length: 16 }, () => 0),
      minPercent: 0,
      maxPercent: 0,
      koText: 'noEffect',
      moveId: move.id,
      moveName: move.name,
    }
  }

  const magicRoomActive = scenario.field.globalFlags.magicRoom
  const offenseOwnerStats = statProfile.offenseOwner === 'attacker' ? attackerStats : defenderStats
  const offenseOwnerStages = statProfile.offenseOwner === 'attacker' ? attacker.stages : defender.stages
  const attackStage = offenseOwnerStages[statProfile.offenseStage] ?? 0
  const defenseStage = statProfile.defenseClass === 'physical' ? defender.stages.def ?? 0 : defender.stages.spd ?? 0

  let atkValue = offenseOwnerStats[statProfile.offenseStat]
  let defValue = statProfile.defenseClass === 'physical' ? defenderStats.def : defenderStats.spd
  if (scenario.field.globalFlags.wonderRoom) {
    defValue = statProfile.defenseClass === 'physical' ? defenderStats.spd : defenderStats.def
  }

  atkValue = Math.floor(atkValue * stageMultiplier(attackStage))
  defValue = Math.floor(defValue * stageMultiplier(defenseStage))
  atkValue = Math.floor(atkValue * abilityAttackStatMultiplier(attacker.abilityId, statProfile, attacker.status))
  atkValue = Math.floor(atkValue * (magicRoomActive ? 1 : applyAttackItemMultiplier(attacker.itemId, move, statProfile)))
  if (isSpecialMove(move) && scenario.field.weather === 'sand' && isRockType(defenderTypes.filter(Boolean) as string[])) {
    defValue = Math.floor(defValue * 1.5)
  }
  if (isPhysicalMove(move) && scenario.field.weather === 'snow' && rules.generation === 'gen9' && isIceType(defenderTypes.filter(Boolean) as string[])) {
    defValue = Math.floor(defValue * 1.5)
  }
  defValue = Math.floor(defValue * (magicRoomActive ? 1 : applyDefenseItemMultiplier(defender.itemId, move)))

  const level = clamp(attacker.level, 1, 100)
  const power = moveEffectivePower({
    move,
    attackerDex,
    defenderDex,
    attacker,
    defender,
    attackerSide,
    attackerStats,
    defenderStats,
    attackerCurrentHp,
    attackerMaxHp: attackerStats.hp,
    defenderCurrentHp,
    defenderMaxHp: defenderStats.hp,
    weather: scenario.field.weather,
    terrain: scenario.field.terrain,
    scenario,
    resolver,
  })
  const raw = Math.floor(Math.floor(((Math.floor((2 * level) / 5) + 2) * power * Math.max(1, atkValue)) / Math.max(1, defValue)) / 50) + 2

  let modifier = 1
  modifier *= weatherMultiplier(scenario.field.weather, resolvedMoveType)
  modifier *= terrainMultiplier(scenario.field.terrain, resolvedMoveType, rules.terrainOffenseMultiplier)
  modifier *= typeMult
  modifier *= stabMultiplier({ ...move, type: resolvedMoveType }, attackerBaseTypes, attacker)
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
    koText: baseKoText,
    koResidualText: residualDamage > 0 ? residualKoText : undefined,
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
        koText: best?.koText ?? 'noMove',
        koResidualText: best?.koResidualText,
      })
    }
  }

  return cells
}
