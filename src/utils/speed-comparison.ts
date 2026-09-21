import { MAX_EV_PER_STAT, type PokemonEntry, type StatBlock } from '@/models/domain'
import { calculateBattleStats } from '@/utils/stat-calc'

export type SpeedComparisonRelation = 'faster' | 'tie' | 'slower'

export interface SpeedComparisonResult {
  relation: SpeedComparisonRelation
  delta: number
}

export function megaFormLabel(pokemonId: string): string | null {
  const match = pokemonId.match(/-mega(?:-([a-z0-9-]+))?$/)
  if (!match) return null
  return match[1] ? `Mega ${match[1].toUpperCase().split('-').join(' ')}` : 'Mega'
}

export function speedComparisonPokemonName(pokemon: Pick<PokemonEntry, 'id' | 'name'>): string {
  const form = megaFormLabel(pokemon.id)
  return form ? `${pokemon.name} ${form}` : pokemon.name
}

const PERFECT_IVS: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
const MAX_SPEED_POINTS: StatBlock = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: MAX_EV_PER_STAT,
}

export function calculateFavorableSpeedBenchmark(pokemon: PokemonEntry, level = 50): number {
  return calculateBattleStats(
    pokemon.baseStats,
    PERFECT_IVS,
    MAX_SPEED_POINTS,
    level,
    'timid',
  ).spe
}

export function compareSpeed(teamSpeed: number, benchmarkSpeed: number): SpeedComparisonResult {
  const delta = teamSpeed - benchmarkSpeed
  return {
    relation: delta > 0 ? 'faster' : delta < 0 ? 'slower' : 'tie',
    delta,
  }
}
