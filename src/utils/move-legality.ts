import type { PokemonEntry } from '@/models/domain'

function resolvePreEvolutionIds(pokemon: PokemonEntry): string[] {
  if (pokemon.preEvolutionChain && pokemon.preEvolutionChain.length > 0) {
    return pokemon.preEvolutionChain
  }

  if (!pokemon.evolutionChain || pokemon.evolutionChain.length === 0) return []
  const selfIndex = pokemon.evolutionChain.indexOf(pokemon.id)
  if (selfIndex <= 0) return []
  return pokemon.evolutionChain.slice(0, selfIndex)
}

export function getEffectiveLearnsetMoveIds(
  pokemon: PokemonEntry | undefined,
  resolvePokemonById: (pokemonId: string) => PokemonEntry | undefined,
): string[] {
  if (!pokemon) return []

  const moves = new Set<string>((pokemon.learnsetMoves ?? []).filter(Boolean))
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
