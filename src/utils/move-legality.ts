import type { PokemonEntry } from '@/models/domain'

const SCEPTILE_CHAMPIONS_MOVE_OVERRIDES = [
  'brutal-swing',
  'cross-poison',
  'dragon-rush',
  'earth-power',
  'iron-tail',
  'mega-kick',
  'round',
  'snore',
]

const RAICHU_CHAMPIONS_MOVE_OVERRIDES = ['rising-voltage', 'volt-tackle']

const LEARNSET_MOVE_OVERRIDES_BY_POKEMON_ID: Record<string, string[]> = {
  'aegislash-shield': ['poltergeist'],
  'aegislash-blade': ['poltergeist'],
  primarina: ['scald'],
  raichu: RAICHU_CHAMPIONS_MOVE_OVERRIDES,
  'raichu-alola': RAICHU_CHAMPIONS_MOVE_OVERRIDES,
  'raichu-mega-x': RAICHU_CHAMPIONS_MOVE_OVERRIDES,
  'raichu-mega-y': RAICHU_CHAMPIONS_MOVE_OVERRIDES,
  sceptile: SCEPTILE_CHAMPIONS_MOVE_OVERRIDES,
  starmie: ['aqua-jet', 'liquidation', 'ice-spinner'],
  'starmie-mega': ['aqua-jet', 'liquidation', 'ice-spinner'],
}

function resolvePreEvolutionIds(pokemon: PokemonEntry): string[] {
  const preEvolutionIds =
    pokemon.preEvolutionChain && pokemon.preEvolutionChain.length > 0
      ? [...pokemon.preEvolutionChain]
      : []

  if (pokemon.id.includes('-mega')) {
    const basePokemonId = pokemon.evolutionChain?.[pokemon.evolutionChain.length - 1]
    if (basePokemonId && basePokemonId !== pokemon.id && !preEvolutionIds.includes(basePokemonId)) {
      preEvolutionIds.push(basePokemonId)
    }
  }

  if (preEvolutionIds.length > 0) return preEvolutionIds

  if (!pokemon.evolutionChain || pokemon.evolutionChain.length === 0) return []
  const selfIndex = pokemon.evolutionChain.indexOf(pokemon.id)
  if (selfIndex <= 0) return []
  return [...pokemon.evolutionChain.slice(0, selfIndex)]
}

export function getEffectiveLearnsetMoveIds(
  pokemon: PokemonEntry | undefined,
  resolvePokemonById: (pokemonId: string) => PokemonEntry | undefined,
): string[] {
  if (!pokemon) return []
  // A reviewed Champions movepool is complete; inherited moves can be illegal here.
  if (pokemon.championsLearnsetMoves) return [...pokemon.championsLearnsetMoves]

  const moves = new Set<string>((pokemon.learnsetMoves ?? []).filter(Boolean))
  addLocalLearnsetOverrides(moves, pokemon.id)
  const preEvolutionIds = resolvePreEvolutionIds(pokemon)

  for (const preEvolutionId of preEvolutionIds) {
    const preEvolution = resolvePokemonById(preEvolutionId)
    if (!preEvolution) continue
    for (const moveId of preEvolution.learnsetMoves ?? []) {
      if (moveId) moves.add(moveId)
    }
    addLocalLearnsetOverrides(moves, preEvolutionId)
  }

  return [...moves]
}

export function getPreferredLegalMoves(
  pokemon: PokemonEntry,
  resolvePokemonById: (pokemonId: string) => PokemonEntry | undefined,
  metaMoveIds: string[] = [],
): [string, string, string, string] {
  const learnset = getEffectiveLearnsetMoveIds(pokemon, resolvePokemonById)
  const allowed = learnset.length > 0 || pokemon.championsLearnsetMoves !== undefined
    ? learnset
    : pokemon.suggestedMoves ?? []
  const allowedIds = new Set(allowed)
  const ordered = [...new Set([...metaMoveIds, ...(pokemon.suggestedMoves ?? []), ...allowed])]
    .filter((moveId) => moveId && allowedIds.has(moveId))
  return [ordered[0] ?? '', ordered[1] ?? '', ordered[2] ?? '', ordered[3] ?? '']
}

function addLocalLearnsetOverrides(moves: Set<string>, pokemonId: string): void {
  for (const moveId of LEARNSET_MOVE_OVERRIDES_BY_POKEMON_ID[pokemonId] ?? []) {
    if (moveId) moves.add(moveId)
  }
}
