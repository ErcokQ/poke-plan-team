import { describe, expect, it } from 'vitest'
import type { PokemonEntry } from '@/models/domain'
import { getEffectiveLearnsetMoveIds } from './move-legality'

function buildPokemon(
  id: string,
  learnsetMoves: string[],
  preEvolutionChain: string[] = [],
): PokemonEntry {
  return {
    id,
    name: id,
    pokedexNumber: 1,
    types: ['normal'],
    evolutionChain: [id],
    preEvolutionChain,
    abilities: [],
    suggestedItems: [],
    suggestedMoves: [],
    learnsetMoves,
    defaultNature: 'hardy',
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    roleTags: ['support'],
  }
}

describe('move legality helper', () => {
  it('includes pre-evolution learnset moves', () => {
    const pawniard = buildPokemon('pawniard', ['sucker-punch', 'iron-head'])
    const kingambit = buildPokemon('kingambit', ['kowtow-cleave'], ['pawniard', 'bisharp'])
    const byId = new Map<string, PokemonEntry>([
      ['pawniard', pawniard],
      ['kingambit', kingambit],
    ])

    const result = getEffectiveLearnsetMoveIds(kingambit, (id) => byId.get(id))
    expect(result).toContain('kowtow-cleave')
    expect(result).toContain('sucker-punch')
  })

  it('returns empty array when pokemon is undefined', () => {
    const result = getEffectiveLearnsetMoveIds(undefined, () => undefined)
    expect(result).toEqual([])
  })

  it('falls back to evolutionChain path when preEvolutionChain is missing', () => {
    const pawniard = buildPokemon('pawniard', ['sucker-punch', 'iron-head'])
    const kingambit = buildPokemon('kingambit', ['kowtow-cleave'])
    kingambit.evolutionChain = ['pawniard', 'bisharp', 'kingambit']
    delete kingambit.preEvolutionChain

    const byId = new Map<string, PokemonEntry>([
      ['pawniard', pawniard],
      ['kingambit', kingambit],
    ])

    const result = getEffectiveLearnsetMoveIds(kingambit, (id) => byId.get(id))
    expect(result).toContain('sucker-punch')
  })
})
