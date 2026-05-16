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

  it('includes regional pre-evolution learnsets when the snapshot resolves the right lineage', () => {
    const sneaselHisui = buildPokemon('sneasel-hisui', ['fake-out'])
    sneaselHisui.types = ['fighting', 'poison']

    const sneasler = buildPokemon('sneasler', ['dire-claw'], ['sneasel-hisui'])
    sneasler.types = ['fighting', 'poison']

    const byId = new Map<string, PokemonEntry>([
      ['sneasel-hisui', sneaselHisui],
      ['sneasler', sneasler],
    ])

    const result = getEffectiveLearnsetMoveIds(sneasler, (id) => byId.get(id))
    expect(result).toContain('fake-out')
    expect(result).toContain('dire-claw')
  })

  it('applies local learnset overrides for missing snapshot moves', () => {
    const aegislash = buildPokemon('aegislash-shield', ['shadow-ball', 'flash-cannon'])

    const result = getEffectiveLearnsetMoveIds(aegislash, () => undefined)

    expect(result).toContain('poltergeist')
    expect(result).toContain('shadow-ball')
  })

  it('includes Champions-only local move overrides when the base learnset is missing them', () => {
    const starmie = buildPokemon('starmie', ['surf', 'ice-beam'])

    const result = getEffectiveLearnsetMoveIds(starmie, () => undefined)

    expect(result).toContain('aqua-jet')
    expect(result).toContain('liquidation')
    expect(result).toContain('surf')
  })

  it('includes Primarina local move overrides when the snapshot learnset omits scald', () => {
    const primarina = buildPokemon('primarina', ['surf', 'moonblast'])

    const result = getEffectiveLearnsetMoveIds(primarina, () => undefined)

    expect(result).toContain('scald')
    expect(result).toContain('surf')
  })
})
