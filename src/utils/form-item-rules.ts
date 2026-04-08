import type { PokemonEntry } from '@/models/domain'

type PokemonItemRuleTarget = Pick<PokemonEntry, 'requiredItemId' | 'suggestedItems'> | null | undefined

export function getRequiredItemIdForPokemon(pokemon: PokemonItemRuleTarget): string {
  return pokemon?.requiredItemId ?? ''
}

export function isItemLockedForPokemon(pokemon: PokemonItemRuleTarget): boolean {
  return Boolean(getRequiredItemIdForPokemon(pokemon))
}

export function resolveInitialItemIdForPokemon(pokemon: PokemonItemRuleTarget): string {
  return getRequiredItemIdForPokemon(pokemon) || pokemon?.suggestedItems?.[0] || ''
}

export function resolveItemIdAfterFormChange(
  nextPokemon: PokemonItemRuleTarget,
  previousPokemon: PokemonItemRuleTarget,
  currentItemId: string,
): string {
  const nextRequiredItemId = getRequiredItemIdForPokemon(nextPokemon)
  if (nextRequiredItemId) return nextRequiredItemId

  const previousRequiredItemId = getRequiredItemIdForPokemon(previousPokemon)
  if (previousRequiredItemId && currentItemId === previousRequiredItemId) {
    return resolveInitialItemIdForPokemon(nextPokemon)
  }

  return currentItemId
}
