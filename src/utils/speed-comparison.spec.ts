import { describe, expect, it } from 'vitest'
import type { PokemonEntry } from '@/models/domain'
import {
  calculateFavorableSpeedBenchmark,
  compareSpeed,
  megaFormLabel,
  speedComparisonPokemonName,
} from '@/utils/speed-comparison'

const pokemon = {
  id: 'benchmark',
  name: 'Benchmark',
  pokedexNumber: 1,
  types: ['normal'],
  evolutionChain: ['benchmark'],
  abilities: [],
  suggestedItems: [],
  suggestedMoves: [],
  defaultNature: 'timid',
  baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 100 },
  roleTags: [],
} satisfies PokemonEntry

describe('Champions speed comparison', () => {
  it('uses level 50, perfect Speed IV, 32 Speed points and a favorable nature', () => {
    expect(calculateFavorableSpeedBenchmark(pokemon)).toBe(167)
  })

  it('reports faster, tied and slower team values with their delta', () => {
    expect(compareSpeed(180, 167)).toEqual({ relation: 'faster', delta: 13 })
    expect(compareSpeed(167, 167)).toEqual({ relation: 'tie', delta: 0 })
    expect(compareSpeed(150, 167)).toEqual({ relation: 'slower', delta: -17 })
  })

  it('identifies Mega X, Y and Z separately in team and opponent labels', () => {
    expect(speedComparisonPokemonName({ id: 'raichu', name: 'Raichu' })).toBe('Raichu')
    expect(speedComparisonPokemonName({ id: 'raichu-mega-x', name: 'Raichu' })).toBe('Raichu Mega X')
    expect(speedComparisonPokemonName({ id: 'raichu-mega-y', name: 'Raichu' })).toBe('Raichu Mega Y')
    expect(megaFormLabel('lucario-mega-z')).toBe('Mega Z')
    expect(megaFormLabel('gengar-mega')).toBe('Mega')
  })
})
