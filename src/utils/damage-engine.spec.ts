import { describe, expect, it } from 'vitest'
import type { MoveEntry, PokemonEntry } from '@/models/domain'
import type { DamageCalcScenario, DamageSideState, DamageSlotSet } from '@/models/damage-calc'
import { computePairDamage } from '@/utils/damage-engine'
import { simulateTwoHitSequence } from '@/utils/damage-sequence'

function makeSlot(slot: 1 | 2 | 3 | 4 | 5 | 6, pokemonId: string, moveId: string): DamageSlotSet {
  return {
    slot,
    pokemonId,
    abilityId: 'pressure',
    itemId: '',
    natureId: 'jolly',
    evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    teraType: undefined,
    isTeraActive: false,
    moves: [moveId, '', '', ''],
    level: 50,
    currentHpPercent: 100,
    status: 'healthy',
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    combatContext: {
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
    },
  }
}

function makeSide(slot: DamageSlotSet): DamageSideState {
  return {
    slots: [slot],
    activeSlotIds: [slot.slot],
    targetByAttacker: { [String(slot.slot)]: 1 },
  }
}

function makeScenario(moveId: string): DamageCalcScenario {
  const attacker = makeSlot(1, 'attacker-mon', moveId)
  const defender = makeSlot(1, 'defender-mon', moveId)
  defender.evs = { hp: 252, atk: 0, def: 252, spa: 0, spd: 0, spe: 0 }

  return {
    mode: 'vgc',
    generation: 'gen9',
    battleType: 'doubles',
    sideA: makeSide(attacker),
    sideB: makeSide(defender),
    field: {
      weather: 'none',
      terrain: 'none',
      sideA: {
        reflect: false,
        lightScreen: false,
        auroraVeil: false,
        friendGuard: false,
        helpingHand: false,
        battery: false,
        powerSpot: false,
        hazards: { stealthRock: false, spikesLayers: 0, toxicSpikesLayers: 0, stickyWeb: false },
        protectBySlot: { '1': false, '2': false, '3': false, '4': false, '5': false, '6': false },
      },
      sideB: {
        reflect: false,
        lightScreen: false,
        auroraVeil: false,
        friendGuard: false,
        helpingHand: false,
        battery: false,
        powerSpot: false,
        hazards: { stealthRock: false, spikesLayers: 0, toxicSpikesLayers: 0, stickyWeb: false },
        protectBySlot: { '1': false, '2': false, '3': false, '4': false, '5': false, '6': false },
      },
      globalFlags: {
        gravity: false,
        magicRoom: false,
        wonderRoom: false,
      },
      advancedFlags: {},
    },
    selectedPair: {
      attackerSide: 'A',
      attackerSlot: 1,
      defenderSlot: 1,
    },
  }
}

const pokemonById: Record<string, PokemonEntry> = {
  'attacker-mon': {
    id: 'attacker-mon',
    name: 'Attacker Mon',
    pokedexNumber: 1,
    types: ['fire'],
    evolutionChain: ['attacker-mon'],
    abilities: ['pressure'],
    suggestedItems: [],
    suggestedMoves: ['flame-strike'],
    defaultNature: 'jolly',
    baseStats: { hp: 80, atk: 120, def: 70, spa: 70, spd: 70, spe: 100 },
    weightKg: 210,
    roleTags: ['sweeper'],
  },
  'defender-mon': {
    id: 'defender-mon',
    name: 'Defender Mon',
    pokedexNumber: 2,
    types: ['grass'],
    evolutionChain: ['defender-mon'],
    abilities: ['pressure'],
    suggestedItems: [],
    suggestedMoves: ['flame-strike'],
    defaultNature: 'bold',
    baseStats: { hp: 90, atk: 70, def: 95, spa: 70, spd: 80, spe: 60 },
    weightKg: 40,
    roleTags: ['wall'],
  },
}

const moveById: Record<string, MoveEntry> = {
  'flame-strike': {
    id: 'flame-strike',
    name: 'Flame Strike',
    type: 'fire',
    category: 'physical',
    power: 90,
    accuracy: 100,
    pp: 15,
    tags: [],
  },
  'heat-wave-test': {
    id: 'heat-wave-test',
    name: 'Heat Wave Test',
    type: 'fire',
    category: 'special',
    power: 95,
    accuracy: 100,
    pp: 10,
    tags: ['all-opponents'],
  },
  facade: {
    id: 'facade',
    name: 'Facade',
    type: 'normal',
    category: 'physical',
    power: 70,
    accuracy: 100,
    pp: 20,
    tags: [],
  },
  hex: {
    id: 'hex',
    name: 'Hex',
    type: 'ghost',
    category: 'special',
    power: 65,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'weather-ball': {
    id: 'weather-ball',
    name: 'Weather Ball',
    type: 'normal',
    category: 'special',
    power: 50,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  reversal: {
    id: 'reversal',
    name: 'Reversal',
    type: 'fighting',
    category: 'physical',
    power: 20,
    accuracy: 100,
    pp: 15,
    tags: [],
  },
  'electro-ball': {
    id: 'electro-ball',
    name: 'Electro Ball',
    type: 'electric',
    category: 'special',
    power: 40,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'body-press': {
    id: 'body-press',
    name: 'Body Press',
    type: 'fighting',
    category: 'physical',
    power: 80,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'foul-play': {
    id: 'foul-play',
    name: 'Foul Play',
    type: 'dark',
    category: 'physical',
    power: 95,
    accuracy: 100,
    pp: 15,
    tags: [],
  },
  psyshock: {
    id: 'psyshock',
    name: 'Psyshock',
    type: 'psychic',
    category: 'special',
    power: 80,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  assurance: {
    id: 'assurance',
    name: 'Assurance',
    type: 'dark',
    category: 'physical',
    power: 60,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'bullet-punch': {
    id: 'bullet-punch',
    name: 'Bullet Punch',
    type: 'steel',
    category: 'physical',
    power: 40,
    accuracy: 100,
    pp: 30,
    priority: 1,
    tags: [],
  },
  'bolt-beak': {
    id: 'bolt-beak',
    name: 'Bolt Beak',
    type: 'electric',
    category: 'physical',
    power: 85,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'stomping-tantrum': {
    id: 'stomping-tantrum',
    name: 'Stomping Tantrum',
    type: 'ground',
    category: 'physical',
    power: 75,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'rage-fist': {
    id: 'rage-fist',
    name: 'Rage Fist',
    type: 'ghost',
    category: 'physical',
    power: 50,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'last-respects': {
    id: 'last-respects',
    name: 'Last Respects',
    type: 'ghost',
    category: 'physical',
    power: 50,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'heavy-slam': {
    id: 'heavy-slam',
    name: 'Heavy Slam',
    type: 'steel',
    category: 'physical',
    power: 40,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  return: {
    id: 'return',
    name: 'Return',
    type: 'normal',
    category: 'physical',
    power: 1,
    accuracy: 100,
    pp: 20,
    tags: [],
  },
  fling: {
    id: 'fling',
    name: 'Fling',
    type: 'dark',
    category: 'physical',
    power: 1,
    accuracy: 100,
    pp: 10,
    tags: [],
  },
  'knock-off': {
    id: 'knock-off',
    name: 'Knock Off',
    type: 'dark',
    category: 'physical',
    power: 65,
    accuracy: 100,
    pp: 20,
    tags: [],
  },
  'triple-axel': {
    id: 'triple-axel',
    name: 'Triple Axel',
    type: 'ice',
    category: 'physical',
    power: 20,
    accuracy: 90,
    pp: 10,
    tags: [],
  },
}

const itemById = {
  'iron-ball': {
    id: 'iron-ball',
    name: 'Iron Ball',
    tags: [],
    flingPower: 130,
  },
}

const resolver = {
  getPokemon: (_mode: DamageCalcScenario['mode'], pokemonId: string) => pokemonById[pokemonId],
  getMove: (moveId: string) => moveById[moveId],
  getItem: (itemId: string) => itemById[itemId as keyof typeof itemById],
}

describe('damage-engine', () => {
  it('returns 16 random rolls for a valid damaging move', () => {
    const scenario = makeScenario('flame-strike')
    const pair = computePairDamage(scenario, resolver, 'A', 1, 1)

    expect(pair.resultsByMove).toHaveLength(1)
    expect(pair.resultsByMove[0].rolls).toHaveLength(16)
    expect(pair.resultsByMove[0].max).toBeGreaterThanOrEqual(pair.resultsByMove[0].min)
  })

  it('reduces damage when target uses Protect', () => {
    const baseScenario = makeScenario('flame-strike')
    const protectedScenario = makeScenario('flame-strike')
    protectedScenario.field.sideB.protectBySlot['1'] = true

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const withProtect = computePairDamage(protectedScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(withProtect.max).toBeLessThan(base.max)
  })

  it('reduces physical damage when attacker is burned', () => {
    const baseScenario = makeScenario('flame-strike')
    const burnedScenario = makeScenario('flame-strike')
    burnedScenario.sideA.slots[0].status = 'burn'

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const burned = computePairDamage(burnedScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(burned.max).toBeLessThan(base.max)
  })

  it('applies spread move penalty in later generations', () => {
    const gen3 = makeScenario('heat-wave-test')
    gen3.generation = 'gen3'
    const gen4 = makeScenario('heat-wave-test')
    gen4.generation = 'gen4'

    gen3.sideB.activeSlotIds = [1, 2]
    gen4.sideB.activeSlotIds = [1, 2]

    const gen3Result = computePairDamage(gen3, resolver, 'A', 1, 1).resultsByMove[0]
    const gen4Result = computePairDamage(gen4, resolver, 'A', 1, 1).resultsByMove[0]

    expect(gen4Result.max).toBeLessThan(gen3Result.max)
  })

  it('boosts fire damage under sun weather', () => {
    const baseScenario = makeScenario('flame-strike')
    const sunScenario = makeScenario('flame-strike')
    sunScenario.field.weather = 'sun'

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const sunny = computePairDamage(sunScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(sunny.max).toBeGreaterThan(base.max)
  })

  it('applies type-boosting held items like Soft Sand and Metal Coat', () => {
    const baseGroundScenario = makeScenario('stomping-tantrum')
    const boostedGroundScenario = makeScenario('stomping-tantrum')
    boostedGroundScenario.sideA.slots[0].itemId = 'soft-sand'

    const baseGround = computePairDamage(baseGroundScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const boostedGround = computePairDamage(boostedGroundScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(boostedGround.max).toBeGreaterThan(baseGround.max)
    expect(boostedGround.min).toBeGreaterThan(baseGround.min)

    const baseSteelScenario = makeScenario('heavy-slam')
    const boostedSteelScenario = makeScenario('heavy-slam')
    boostedSteelScenario.sideA.slots[0].itemId = 'metal-coat'

    const baseSteel = computePairDamage(baseSteelScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const boostedSteel = computePairDamage(boostedSteelScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(boostedSteel.max).toBeGreaterThan(baseSteel.max)
    expect(boostedSteel.min).toBeGreaterThan(baseSteel.min)
  })

  it('applies Facade based on the attacker status, not the defender status', () => {
    const baseScenario = makeScenario('facade')
    const attackerBurnedScenario = makeScenario('facade')
    const defenderBurnedScenario = makeScenario('facade')

    attackerBurnedScenario.sideA.slots[0].status = 'burn'
    defenderBurnedScenario.sideB.slots[0].status = 'burn'

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const attackerBurned = computePairDamage(attackerBurnedScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const defenderBurned = computePairDamage(defenderBurnedScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(Math.abs(attackerBurned.max - base.max)).toBeLessThanOrEqual(1)
    expect(defenderBurned.max).toBe(base.max)
  })

  it('boosts Hex when the defender has a status condition', () => {
    const baseScenario = makeScenario('hex')
    const poisonedScenario = makeScenario('hex')
    poisonedScenario.sideB.slots[0].status = 'poison'

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const poisoned = computePairDamage(poisonedScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(poisoned.max).toBeGreaterThan(base.max)
  })

  it('changes Weather Ball under sun weather', () => {
    const baseScenario = makeScenario('weather-ball')
    const sunScenario = makeScenario('weather-ball')
    sunScenario.field.weather = 'sun'

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const sunny = computePairDamage(sunScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(sunny.max).toBeGreaterThan(base.max)
  })

  it('boosts Reversal when the attacker is low on HP', () => {
    const baseScenario = makeScenario('reversal')
    const lowHpScenario = makeScenario('reversal')
    lowHpScenario.sideA.slots[0].currentHpPercent = 5

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const lowHp = computePairDamage(lowHpScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(lowHp.max).toBeGreaterThan(base.max)
  })

  it('boosts Electro Ball when the attacker is much faster', () => {
    const baseScenario = makeScenario('electro-ball')
    const fastScenario = makeScenario('electro-ball')
    fastScenario.sideA.slots[0].stages.spe = 6
    fastScenario.sideB.slots[0].stages.spe = -6

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const fast = computePairDamage(fastScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(fast.max).toBeGreaterThan(base.max)
  })

  it('uses item-dependent power for Fling and Knock Off', () => {
    const flingScenario = makeScenario('fling')
    flingScenario.sideA.slots[0].itemId = 'iron-ball'

    const knockOffScenario = makeScenario('knock-off')
    knockOffScenario.sideB.slots[0].itemId = 'iron-ball'

    const fling = computePairDamage(flingScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const knockOff = computePairDamage(knockOffScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const knockOffBase = computePairDamage(makeScenario('knock-off'), resolver, 'A', 1, 1).resultsByMove[0]

    expect(fling.max).toBeGreaterThan(0)
    expect(knockOff.max).toBeGreaterThan(knockOffBase.max)
  })

  it('uses Defense for Body Press damage', () => {
    const baseScenario = makeScenario('body-press')
    const boostedDefenseScenario = makeScenario('body-press')
    boostedDefenseScenario.sideA.slots[0].stages.def = 4

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const boosted = computePairDamage(boostedDefenseScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(boosted.max).toBeGreaterThan(base.max)
  })

  it('uses defender Attack for Foul Play damage', () => {
    const baseScenario = makeScenario('foul-play')
    const boostedTargetScenario = makeScenario('foul-play')
    boostedTargetScenario.sideB.slots[0].stages.atk = 4

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const boostedTarget = computePairDamage(boostedTargetScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(boostedTarget.max).toBeGreaterThan(base.max)
  })

  it('uses defender Defense for Psyshock-style moves', () => {
    const baseScenario = makeScenario('psyshock')
    const boostedDefenseScenario = makeScenario('psyshock')
    boostedDefenseScenario.sideB.slots[0].stages.def = 4

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const boostedDefense = computePairDamage(boostedDefenseScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(boostedDefense.max).toBeLessThan(base.max)
  })

  it('boosts Assurance when the defender already took damage this turn', () => {
    const baseScenario = makeScenario('assurance')
    const chippedScenario = makeScenario('assurance')
    chippedScenario.sideB.slots[0].combatContext.tookDamageThisTurn = true

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const chipped = computePairDamage(chippedScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(chipped.max).toBeGreaterThan(base.max)
  })

  it('applies Technician only to moves with effective power 60 or less', () => {
    const assuranceScenario = makeScenario('assurance')
    assuranceScenario.sideA.slots[0].abilityId = 'technician'
    const assuranceBaseScenario = makeScenario('assurance')

    const bulletPunchScenario = makeScenario('bullet-punch')
    bulletPunchScenario.sideA.slots[0].abilityId = 'technician'
    const bulletPunchBaseScenario = makeScenario('bullet-punch')

    const knockOffScenario = makeScenario('knock-off')
    knockOffScenario.sideA.slots[0].abilityId = 'technician'
    const knockOffBaseScenario = makeScenario('knock-off')

    const assurance = computePairDamage(assuranceScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const assuranceBase = computePairDamage(assuranceBaseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const bulletPunch = computePairDamage(bulletPunchScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const bulletPunchBase = computePairDamage(bulletPunchBaseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const knockOff = computePairDamage(knockOffScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const knockOffBase = computePairDamage(knockOffBaseScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(assurance.max).toBeGreaterThan(assuranceBase.max)
    expect(bulletPunch.max).toBeGreaterThan(bulletPunchBase.max)
    expect(knockOff.max).toBe(knockOffBase.max)
  })

  it('uses move order hints for Bolt Beak', () => {
    const baseScenario = makeScenario('bolt-beak')
    baseScenario.sideA.slots[0].combatContext.moveOrderHint = 'after-target'
    const firstScenario = makeScenario('bolt-beak')
    firstScenario.sideA.slots[0].combatContext.moveOrderHint = 'before-target'

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const first = computePairDamage(firstScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(first.max).toBeGreaterThan(base.max)
  })

  it('boosts Stomping Tantrum when the previous move failed', () => {
    const baseScenario = makeScenario('stomping-tantrum')
    const failedScenario = makeScenario('stomping-tantrum')
    failedScenario.sideA.slots[0].combatContext.previousMoveFailed = true

    const base = computePairDamage(baseScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const failed = computePairDamage(failedScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(failed.max).toBeGreaterThan(base.max)
  })

  it('scales Rage Fist and Last Respects from combat counters', () => {
    const rageScenario = makeScenario('rage-fist')
    rageScenario.sideA.slots[0].combatContext.timesHitThisBattle = 4
    const lastRespectScenario = makeScenario('last-respects')
    lastRespectScenario.sideA.slots[0].combatContext.alliesFaintedCount = 3

    const rage = computePairDamage(rageScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const lastRespects = computePairDamage(lastRespectScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const rageBase = computePairDamage(makeScenario('rage-fist'), resolver, 'A', 1, 1).resultsByMove[0]
    const lastRespectsBase = computePairDamage(makeScenario('last-respects'), resolver, 'A', 1, 1).resultsByMove[0]

    expect(rage.max).toBeGreaterThan(rageBase.max)
    expect(lastRespects.max).toBeGreaterThan(lastRespectsBase.max)
  })

  it('uses weight data for Heavy Slam', () => {
    const result = computePairDamage(makeScenario('heavy-slam'), resolver, 'A', 1, 1).resultsByMove[0]
    const lighterAttackerScenario = makeScenario('heavy-slam')
    pokemonById['attacker-mon'].weightKg = 50
    const lighter = computePairDamage(lighterAttackerScenario, resolver, 'A', 1, 1).resultsByMove[0]
    pokemonById['attacker-mon'].weightKg = 210

    expect(result.max).toBeGreaterThan(lighter.max)
  })

  it('scales Return from friendship', () => {
    const maxFriendshipScenario = makeScenario('return')
    const lowFriendshipScenario = makeScenario('return')
    maxFriendshipScenario.sideA.slots[0].combatContext.friendship = 255
    lowFriendshipScenario.sideA.slots[0].combatContext.friendship = 0

    const maxFriendship = computePairDamage(maxFriendshipScenario, resolver, 'A', 1, 1).resultsByMove[0]
    const lowFriendship = computePairDamage(lowFriendshipScenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(maxFriendship.max).toBeGreaterThan(lowFriendship.max)
  })

  it('models Triple Axel as escalating multi-hit damage', () => {
    const scenario = makeScenario('triple-axel')
    const result = computePairDamage(scenario, resolver, 'A', 1, 1).resultsByMove[0]

    expect(result.max).toBeGreaterThan(0)
    expect(result.sequenceRolls?.hitsPerUse).toBe(3)
    expect(result.sequenceRolls?.fresh).toHaveLength(16)
    expect(result.sequenceRolls?.chipped).toHaveLength(16)
  })

  it('drops Multiscale after the first Triple Axel use in the two-use simulation', () => {
    const scenario = makeScenario('triple-axel')
    scenario.sideB.slots[0].abilityId = 'multiscale'
    const result = computePairDamage(scenario, resolver, 'A', 1, 1).resultsByMove[0]
    const simulation = simulateTwoHitSequence(result, {
      profile: 'mid',
      currentHp: 200,
      maxHp: 200,
      defenderAbilityId: 'multiscale',
      defenderStatus: 'healthy',
      defenderTypes: ['grass'],
    })

    expect(simulation).not.toBeNull()
    expect(simulation?.secondHitDamage ?? 0).toBeGreaterThan(simulation?.firstHitDamage ?? 0)
  })
})
