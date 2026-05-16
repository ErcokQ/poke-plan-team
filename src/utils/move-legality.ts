import type { PokemonEntry } from '@/models/domain'

const LEARNSET_MOVE_OVERRIDES_BY_POKEMON_ID: Record<string, string[]> = {
  'aegislash-shield': ['poltergeist'],
  'aegislash-blade': ['poltergeist'],
  primarina: ['scald'],
  starmie: ['aqua-jet', 'liquidation'],
  'starmie-mega': ['aqua-jet', 'liquidation'],
}

function resolvePreEvolutionIds(pokemon: PokemonEntry): string[] {
  if (pokemon.preEvolutionChain && pokemon.preEvolutionChain.length > 0) {
    return [...pokemon.preEvolutionChain]
  }

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

  const moves = new Set<string>((pokemon.learnsetMoves ?? []).filter(Boolean))
  for (const moveId of LEARNSET_MOVE_OVERRIDES_BY_POKEMON_ID[pokemon.id] ?? []) {
    if (moveId) moves.add(moveId)
  }
  const preEvolutionIds = resolvePreEvolutionIds(pokemon)

  for (const preEvolutionId of preEvolutionIds) {
    const preEvolution = resolvePokemonById(preEvolutionId)
    if (!preEvolution) continue
    for (const moveId of preEvolution.learnsetMoves ?? []) {
      if (moveId) moves.add(moveId)
    }
  }

  return [...moves]
}
