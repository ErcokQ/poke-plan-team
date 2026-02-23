import { describe, it, expect } from 'vitest'
import type { MoveEntry, PokemonEntry, Team, TeamMember } from '@/models/domain'
import type { ThreatProfile } from '@/models/threats'
import {
  evaluateThreatAgainstTeam,
  threatStatusFromCounts,
} from '@/utils/threat-response'

function createMember(slot: TeamMember['slot'], pokemonId: string, moves: string[]): TeamMember {
  return {
    slot,
    pokemonId,
    abilityId: '',
    itemId: '',
    natureId: 'jolly',
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    moves: [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''],
    roleTags: [],
  }
}

function createTeam(members: TeamMember[]): Team {
  return {
    id: 'test-team',
    name: 'Test Team',
    mode: 'vgc',
    members,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const dexById: Record<string, PokemonEntry> = {
  'aqua-one': {
    id: 'aqua-one',
    name: 'Aqua One',
    pokedexNumber: 1,
    types: ['water'],
    evolutionChain: ['aqua-one'],
    abilities: ['torrent'],
    suggestedItems: [],
    suggestedMoves: ['water-blast'],
    learnsetMoves: ['water-blast', 'taunt'],
    defaultNature: 'jolly',
    baseStats: { hp: 80, atk: 70, def: 80, spa: 85, spd: 80, spe: 95 },
    roleTags: ['support'],
  },
  'aqua-two': {
    id: 'aqua-two',
    name: 'Aqua Two',
    pokedexNumber: 2,
    types: ['water'],
    evolutionChain: ['aqua-two'],
    abilities: ['torrent'],
    suggestedItems: [],
    suggestedMoves: ['water-blast'],
    learnsetMoves: ['water-blast'],
    defaultNature: 'jolly',
    baseStats: { hp: 78, atk: 72, def: 82, spa: 88, spd: 80, spe: 98 },
    roleTags: ['sweeper'],
  },
  'neutral-one': {
    id: 'neutral-one',
    name: 'Neutral One',
    pokedexNumber: 3,
    types: ['normal'],
    evolutionChain: ['neutral-one'],
    abilities: ['inner-focus'],
    suggestedItems: [],
    suggestedMoves: ['tackle'],
    learnsetMoves: ['tackle'],
    defaultNature: 'jolly',
    baseStats: { hp: 75, atk: 70, def: 70, spa: 65, spd: 70, spe: 80 },
    roleTags: ['support'],
  },
  'bulky-mon': {
    id: 'bulky-mon',
    name: 'Bulky Mon',
    pokedexNumber: 4,
    types: ['steel'],
    evolutionChain: ['bulky-mon'],
    abilities: ['sturdy'],
    suggestedItems: [],
    suggestedMoves: ['unknown-move'],
    learnsetMoves: ['unknown-move'],
    defaultNature: 'careful',
    baseStats: { hp: 95, atk: 60, def: 120, spa: 55, spd: 110, spe: 40 },
    roleTags: ['wall'],
  },
}

const movesById: Record<string, MoveEntry> = {
  'water-blast': {
    id: 'water-blast',
    name: 'Water Blast',
    type: 'water',
    category: 'special',
    power: 80,
    accuracy: 100,
    pp: 15,
    tags: [],
  },
  tackle: {
    id: 'tackle',
    name: 'Tackle',
    type: 'normal',
    category: 'physical',
    power: 40,
    accuracy: 100,
    pp: 35,
    tags: [],
  },
  taunt: {
    id: 'taunt',
    name: 'Taunt',
    type: 'dark',
    category: 'status',
    power: 0,
    accuracy: 100,
    pp: 20,
    tags: [],
  },
}

const dexResolver = (pokemonId: string) => dexById[pokemonId]
const moveResolver = (moveId: string) => movesById[moveId]

describe('threat-response', () => {
  it('returns good status when a threat has 2 solid answers', () => {
    const team = createTeam([
      createMember(1, 'aqua-one', ['water-blast']),
      createMember(2, 'aqua-two', ['water-blast']),
    ])
    const threat: ThreatProfile = {
      id: 'fire-threat',
      name: 'Fire Threat',
      kind: 'pokemon',
      pokemonId: 'fire-threat',
      defensiveTypes: ['fire'],
      threatMoveTypes: ['fire'],
      expectedSpeed: 140,
      utilityCountersAny: ['taunt'],
      priority: 1,
    }

    const row = evaluateThreatAgainstTeam({
      mode: 'vgc',
      team,
      threat,
      dexResolver,
      moveResolver,
      getThreatUsage: () => 0,
    })

    expect(row.status).toBe('good')
    expect(row.solidCount).toBeGreaterThanOrEqual(2)
  })

  it('returns warning status when a threat has exactly 1 solid answer', () => {
    const team = createTeam([
      createMember(1, 'aqua-one', ['water-blast']),
      createMember(2, 'neutral-one', ['tackle']),
    ])
    const threat: ThreatProfile = {
      id: 'fire-threat-warning',
      name: 'Fire Threat Warning',
      kind: 'pokemon',
      defensiveTypes: ['fire'],
      threatMoveTypes: ['fire'],
      expectedSpeed: 170,
      utilityCountersAny: ['taunt'],
      priority: 2,
    }

    const row = evaluateThreatAgainstTeam({
      mode: 'vgc',
      team,
      threat,
      dexResolver,
      moveResolver,
      getThreatUsage: () => 0,
    })

    expect(row.status).toBe('warning')
    expect(row.solidCount).toBe(1)
  })

  it('returns danger status when a threat has no responses', () => {
    const team = createTeam([
      createMember(1, 'neutral-one', ['tackle']),
      createMember(2, 'neutral-one', ['tackle']),
    ])
    const threat: ThreatProfile = {
      id: 'dragon-threat',
      name: 'Dragon Threat',
      kind: 'pokemon',
      defensiveTypes: ['dragon'],
      threatMoveTypes: ['dragon'],
      expectedSpeed: 220,
      utilityCountersAny: ['haze'],
      priority: 3,
    }

    const row = evaluateThreatAgainstTeam({
      mode: 'vgc',
      team,
      threat,
      dexResolver,
      moveResolver,
      getThreatUsage: () => 0,
    })

    expect(row.status).toBe('danger')
    expect(row.solidCount).toBe(0)
    expect(row.softCount).toBe(0)
  })

  it('detects utility counter for TR archetype threat', () => {
    const team = createTeam([createMember(1, 'neutral-one', ['taunt'])])
    const threat: ThreatProfile = {
      id: 'tr-caly-i',
      name: 'TR (Caly-I)',
      kind: 'archetype',
      defensiveTypes: ['psychic', 'ice'],
      threatMoveTypes: ['psychic', 'ice'],
      expectedSpeed: 110,
      utilityCountersAny: ['taunt', 'imprison', 'trick-room', 'fake-out', 'haze'],
      priority: 4,
    }

    const row = evaluateThreatAgainstTeam({
      mode: 'vgc',
      team,
      threat,
      dexResolver,
      moveResolver,
      getThreatUsage: () => 0,
    })

    expect(row.topResponders.length).toBe(1)
    expect(row.topResponders[0].slot).toBe(1)
    expect(row.topResponders[0].level).not.toBe('none')
  })

  it('falls back safely when threat pokemon or move data is missing', () => {
    const team = createTeam([createMember(1, 'bulky-mon', ['unknown-move'])])
    const threat: ThreatProfile = {
      id: 'missing-data-threat',
      name: 'Missing Data Threat',
      kind: 'pokemon',
      pokemonId: 'not-in-dex',
      defensiveTypes: ['water'],
      threatMoveTypes: ['water'],
      expectedSpeed: 120,
      utilityCountersAny: ['taunt'],
      priority: 5,
    }

    const row = evaluateThreatAgainstTeam({
      mode: 'vgc',
      team,
      threat,
      dexResolver,
      moveResolver,
      getThreatUsage: () => 0,
    })

    expect(['good', 'warning', 'danger']).toContain(row.status)
    expect(row.name).toBe('Missing Data Threat')
  })

  it('maps counts to status deterministically', () => {
    expect(threatStatusFromCounts(2, 0)).toBe('good')
    expect(threatStatusFromCounts(1, 0)).toBe('warning')
    expect(threatStatusFromCounts(0, 2)).toBe('warning')
    expect(threatStatusFromCounts(0, 1)).toBe('danger')
  })
})
