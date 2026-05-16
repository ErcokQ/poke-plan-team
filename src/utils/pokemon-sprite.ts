import { canonicalizePokemonId } from '@/utils/showdown'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
  maushold: 'maushold-family-of-three',
  'maushold-four': 'maushold-family-of-three',
  'maushold-three': 'maushold-family-of-three',
  'maushold-family-of-four': 'maushold-family-of-three',
}

const spriteUrlOverrides: Record<string, string[]> = {
  'floette-mega': ['https://www.serebii.net/legendsz-a/pokemon/670-m.png'],
  'drampa-mega': ['https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10302.png'],
  'maushold-family-of-four': [
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/925.png',
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/925.png',
    'https://play.pokemonshowdown.com/sprites/ani/maushold-family-of-three.gif',
  ],
  'maushold-family-of-three': [
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/925.png',
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/925.png',
    'https://play.pokemonshowdown.com/sprites/ani/maushold-family-of-three.gif',
  ],
}

export function spriteCandidatesForPokemon(pokemonId: string): string[] {
  if (!pokemonId) return [mudkipSprite]

  const canonicalId = canonicalizePokemonId(pokemonId) || pokemonId
  const ids = [canonicalId]
  if (pokemonId !== canonicalId) ids.push(pokemonId)
  for (const sourceId of [...ids]) {
    const aliasId = spriteAliasFallback[sourceId]
    if (aliasId && aliasId !== sourceId) ids.push(aliasId)
  }

  const prefersShowdown = canonicalId.includes('-')
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

  if (spriteUrlOverrides[canonicalId]?.length) {
    candidates.push(...spriteUrlOverrides[canonicalId])
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
