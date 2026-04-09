import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
}

const spriteUrlOverrides: Record<string, string[]> = {
  'floette-mega': ['https://www.serebii.net/legendsz-a/pokemon/670-m.png'],
  'drampa-mega': ['https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10302.png'],
}

export function spriteCandidatesForPokemon(pokemonId: string): string[] {
  if (!pokemonId) return [mudkipSprite]

  const ids = [pokemonId]
  const aliasId = spriteAliasFallback[pokemonId]
  if (aliasId && aliasId !== pokemonId) ids.push(aliasId)

  const prefersShowdown = pokemonId.includes('-')
  const candidates: string[] = []

  for (const id of ids) {
    if (prefersShowdown) {
      candidates.push(`https://play.pokemonshowdown.com/sprites/ani/${id}.gif`)
      candidates.push(`https://img.pokemondb.net/sprites/home/normal/${id}.png`)
    } else {
      candidates.push(`https://img.pokemondb.net/sprites/home/normal/${id}.png`)
      candidates.push(`https://play.pokemonshowdown.com/sprites/ani/${id}.gif`)
    }
    candidates.push(`https://play.pokemonshowdown.com/sprites/gen5/${id}.png`)
  }

  if (spriteUrlOverrides[pokemonId]?.length) {
    candidates.push(...spriteUrlOverrides[pokemonId])
  }

  return [...new Set(candidates)]
}

export function primaryPokemonSpriteUrl(pokemonId: string): string {
  return spriteCandidatesForPokemon(pokemonId)[0] ?? mudkipSprite
}

function spriteIdFromUrl(url: string): string {
  const match = url.match(/\/([^/?#]+)\.(?:png|gif)(?:[?#].*)?$/)
  return match?.[1] ?? ''
}

export function onPokemonSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  const pokemonId = target.dataset.spriteId || spriteIdFromUrl(target.src)
  const candidates = spriteCandidatesForPokemon(pokemonId)
  const currentIndex = Number(target.dataset.spriteFallbackIndex ?? '0')
  const nextIndex = currentIndex + 1

  if (nextIndex < candidates.length) {
    target.dataset.spriteFallbackIndex = String(nextIndex)
    target.src = candidates[nextIndex]
    return
  }

  if (target.src !== mudkipSprite) {
    target.src = mudkipSprite
  }
}
