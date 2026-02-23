import { describe, expect, it } from 'vitest'
import type { MoveEntry, PokemonEntry } from '@/models/domain'
import type { DamageCalcScenario, DamageSideState, DamageSlotSet } from '@/models/damage-calc'
import { computePairDamage } from '@/utils/damage-engine'

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
}

const resolver = {
  getPokemon: (_mode: DamageCalcScenario['mode'], pokemonId: string) => pokemonById[pokemonId],
  getMove: (moveId: string) => moveById[moveId],
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
})
