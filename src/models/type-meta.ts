import fireIcon from '@/assets/pokesprite/misc/types/gen8/fire.png'
import waterIcon from '@/assets/pokesprite/misc/types/gen8/water.png'
import grassIcon from '@/assets/pokesprite/misc/types/gen8/grass.png'
import electricIcon from '@/assets/pokesprite/misc/types/gen8/electric.png'
import psychicIcon from '@/assets/pokesprite/misc/types/gen8/psychic.png'
import iceIcon from '@/assets/pokesprite/misc/types/gen8/ice.png'
import dragonIcon from '@/assets/pokesprite/misc/types/gen8/dragon.png'
import darkIcon from '@/assets/pokesprite/misc/types/gen8/dark.png'
import fairyIcon from '@/assets/pokesprite/misc/types/gen8/fairy.png'
import normalIcon from '@/assets/pokesprite/misc/types/gen8/normal.png'
import fightingIcon from '@/assets/pokesprite/misc/types/gen8/fighting.png'
import flyingIcon from '@/assets/pokesprite/misc/types/gen8/flying.png'
import poisonIcon from '@/assets/pokesprite/misc/types/gen8/poison.png'
import groundIcon from '@/assets/pokesprite/misc/types/gen8/ground.png'
import rockIcon from '@/assets/pokesprite/misc/types/gen8/rock.png'
import bugIcon from '@/assets/pokesprite/misc/types/gen8/bug.png'
import ghostIcon from '@/assets/pokesprite/misc/types/gen8/ghost.png'
import steelIcon from '@/assets/pokesprite/misc/types/gen8/steel.png'
import type { PokemonTypeKey } from './domain'

export const TYPE_META: Record<PokemonTypeKey, { es: string; en: string; icon: string }> = {
  normal: { es: 'Normal', en: 'Normal', icon: normalIcon },
  fire: { es: 'Fuego', en: 'Fire', icon: fireIcon },
  water: { es: 'Agua', en: 'Water', icon: waterIcon },
  electric: { es: 'Electrico', en: 'Electric', icon: electricIcon },
  grass: { es: 'Planta', en: 'Grass', icon: grassIcon },
  ice: { es: 'Hielo', en: 'Ice', icon: iceIcon },
  fighting: { es: 'Lucha', en: 'Fighting', icon: fightingIcon },
  poison: { es: 'Veneno', en: 'Poison', icon: poisonIcon },
  ground: { es: 'Tierra', en: 'Ground', icon: groundIcon },
  flying: { es: 'Volador', en: 'Flying', icon: flyingIcon },
  psychic: { es: 'Psiquico', en: 'Psychic', icon: psychicIcon },
  bug: { es: 'Bicho', en: 'Bug', icon: bugIcon },
  rock: { es: 'Roca', en: 'Rock', icon: rockIcon },
  ghost: { es: 'Fantasma', en: 'Ghost', icon: ghostIcon },
  dragon: { es: 'Dragon', en: 'Dragon', icon: dragonIcon },
  dark: { es: 'Siniestro', en: 'Dark', icon: darkIcon },
  steel: { es: 'Acero', en: 'Steel', icon: steelIcon },
  fairy: { es: 'Hada', en: 'Fairy', icon: fairyIcon },
}
