import { canonicalizePokemonId } from '@/utils/showdown'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'
import sneaselHisuiSprite from '@/assets/pokesprite/pokemon-gen8/regular/sneasel-hisui.png'

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
  maushold: 'maushold-family-of-three',
  'maushold-four': 'maushold-family-of-three',
  'maushold-three': 'maushold-family-of-three',
  'maushold-family-of-four': 'maushold-family-of-three',
  'raichu-mega-x': 'raichu',
  'raichu-mega-y': 'raichu',
  'staraptor-mega': 'staraptor',
  'scolipede-mega': 'scolipede',
  'scrafty-mega': 'scrafty',
  'eelektross-mega': 'eelektross',
  'pyroar-mega': 'pyroar-male',
  'malamar-mega': 'malamar',
  'barbaracle-mega': 'barbaracle',
  'dragalge-mega': 'dragalge',
  'falinks-mega': 'falinks',
}

const spriteUrlOverrides: Record<string, string[]> = {
  'sneasel-hisui': [sneaselHisuiSprite],
  'floette-mega': ['https://www.serebii.net/legendsz-a/pokemon/670-m.png'],
  'drampa-mega': ['https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10302.png'],
  'raichu-mega-x': ['https://www.serebii.net/pokedex-champions/icon/026-mx.png'],
  'raichu-mega-y': ['https://www.serebii.net/pokedex-champions/icon/026-my.png'],
  'sceptile-mega': ['https://www.serebii.net/pokedex-champions/icon/254-m.png'],
  'blaziken-mega': ['https://www.serebii.net/pokedex-champions/icon/257-m.png'],
  'swampert-mega': ['https://www.serebii.net/pokedex-champions/icon/260-m.png'],
  'mawile-mega': ['https://www.serebii.net/pokedex-champions/icon/303-m.png'],
  'metagross-mega': ['https://www.serebii.net/pokedex-champions/icon/376-m.png'],
  'staraptor-mega': ['https://www.serebii.net/pokedex-champions/icon/398-m.png'],
  'scolipede-mega': ['https://www.serebii.net/pokedex-champions/icon/545-m.png'],
  'scrafty-mega': ['https://www.serebii.net/pokedex-champions/icon/560-m.png'],
  'eelektross-mega': ['https://www.serebii.net/pokedex-champions/icon/604-m.png'],
  'pyroar-mega': ['https://www.serebii.net/pokedex-champions/icon/668-m.png'],
  'malamar-mega': ['https://www.serebii.net/pokedex-champions/icon/687-m.png'],
  'barbaracle-mega': ['https://www.serebii.net/pokedex-champions/icon/689-m.png'],
  'dragalge-mega': ['https://www.serebii.net/pokedex-champions/icon/691-m.png'],
  'falinks-mega': ['https://www.serebii.net/pokedex-champions/icon/870-m.png'],
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

  const candidates: string[] = []

  for (const id of ids) {
    if (spriteUrlOverrides[id]?.length) {
      candidates.push(...spriteUrlOverrides[id])
    }
  }

  for (const id of ids) {
    candidates.push(`https://img.pokemondb.net/sprites/home/normal/${id}.png`)
    candidates.push(`https://play.pokemonshowdown.com/sprites/gen5/${id}.png`)
    candidates.push(`https://play.pokemonshowdown.com/sprites/ani/${id}.gif`)
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
