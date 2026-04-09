import type { BattleMode, PokemonTypeKey, StatBlock, Team, TeamMember } from '@/models/domain'
import { MAX_EV_PER_STAT, MAX_EVS, MAX_IV_PER_STAT, STATS } from '@/models/domain'

export const NATURES = [
  'hardy',
  'lonely',
  'brave',
  'adamant',
  'naughty',
  'docile',
  'relaxed',
  'lax',
  'hasty',
  'jolly',
  'serious',
  'timid',
  'modest',
  'mild',
  'quiet',
  'bashful',
  'rash',
  'careful',
  'bold',
  'calm',
  'impish',
  'gentle',
  'sassy',
  'naive',
  'quirky',
] as const

export function emptyStats(value: number): StatBlock {
  return {
    hp: value,
    atk: value,
    def: value,
    spa: value,
    spd: value,
    spe: value,
  }
}

export function createEmptyMember(slot: TeamMember['slot']): TeamMember {
  return {
    slot,
    pokemonId: '',
    teraType: undefined,
    abilityId: '',
    itemId: '',
    natureId: 'jolly',
    evs: emptyStats(0),
    ivs: emptyStats(MAX_IV_PER_STAT),
    moves: ['', '', '', ''],
    roleTags: [],
  }
}

export function createEmptyTeam(mode: BattleMode, name?: string): Team {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name ?? `${mode.toUpperCase()} Team`,
    mode,
    members: [
      createEmptyMember(1),
      createEmptyMember(2),
      createEmptyMember(3),
      createEmptyMember(4),
      createEmptyMember(5),
      createEmptyMember(6),
    ],
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeStatValue(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function normalizeEvs(member: TeamMember): TeamMember {
  const next: TeamMember = {
    slot: member.slot,
    pokemonId: member.pokemonId,
    teraType: member.teraType,
    abilityId: member.abilityId,
    itemId: member.itemId,
    natureId: member.natureId,
    evs: { ...member.evs },
    ivs: { ...member.ivs },
    moves: [...member.moves] as TeamMember['moves'],
    roleTags: [...member.roleTags],
  }
  let total = 0

  for (const stat of STATS) {
    const clamped = normalizeStatValue(next.evs[stat], 0, MAX_EV_PER_STAT)
    next.evs[stat] = clamped
    total += clamped
  }

  if (total > MAX_EVS) {
    let overflow = total - MAX_EVS
    for (const stat of STATS) {
      if (overflow === 0) break
      const delta = Math.min(next.evs[stat], overflow)
      next.evs[stat] -= delta
      overflow -= delta
    }
  }

  for (const stat of STATS) {
    next.ivs[stat] = normalizeStatValue(next.ivs[stat], 0, MAX_IV_PER_STAT)
  }

  return next
}

export function memberIsComplete(member: TeamMember): boolean {
  return Boolean(
    member.pokemonId &&
      member.abilityId &&
      member.natureId &&
      member.itemId &&
      member.moves.every((move) => move),
  )
}

export function getMemberDisplayType(member: TeamMember, defaultTypes: PokemonTypeKey[]): PokemonTypeKey[] {
  if (member.teraType) return [member.teraType]
  return defaultTypes
}
