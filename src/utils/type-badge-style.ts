import type { CSSProperties } from 'vue'
import type { PokemonTypeKey } from '@/models/domain'

const TYPE_BADGE_STYLES: Record<PokemonTypeKey, CSSProperties> = {
  normal: { background: 'linear-gradient(135deg, rgba(168, 167, 122, 0.22), rgba(99, 99, 99, 0.18))', borderColor: 'rgba(168, 167, 122, 0.45)', color: '#f5f5f4' },
  fire: { background: 'linear-gradient(135deg, rgba(238, 129, 48, 0.24), rgba(185, 28, 28, 0.18))', borderColor: 'rgba(238, 129, 48, 0.45)', color: '#fff7ed' },
  water: { background: 'linear-gradient(135deg, rgba(99, 144, 240, 0.24), rgba(29, 78, 216, 0.18))', borderColor: 'rgba(99, 144, 240, 0.45)', color: '#eff6ff' },
  electric: { background: 'linear-gradient(135deg, rgba(247, 208, 44, 0.24), rgba(202, 138, 4, 0.18))', borderColor: 'rgba(247, 208, 44, 0.45)', color: '#fefce8' },
  grass: { background: 'linear-gradient(135deg, rgba(122, 199, 76, 0.24), rgba(22, 163, 74, 0.18))', borderColor: 'rgba(122, 199, 76, 0.45)', color: '#f0fdf4' },
  ice: { background: 'linear-gradient(135deg, rgba(150, 217, 214, 0.24), rgba(8, 145, 178, 0.18))', borderColor: 'rgba(150, 217, 214, 0.45)', color: '#ecfeff' },
  fighting: { background: 'linear-gradient(135deg, rgba(194, 46, 40, 0.24), rgba(153, 27, 27, 0.18))', borderColor: 'rgba(194, 46, 40, 0.45)', color: '#fef2f2' },
  poison: { background: 'linear-gradient(135deg, rgba(163, 62, 161, 0.24), rgba(126, 34, 206, 0.18))', borderColor: 'rgba(163, 62, 161, 0.45)', color: '#faf5ff' },
  ground: { background: 'linear-gradient(135deg, rgba(226, 191, 101, 0.24), rgba(180, 83, 9, 0.18))', borderColor: 'rgba(226, 191, 101, 0.45)', color: '#fffbeb' },
  flying: { background: 'linear-gradient(135deg, rgba(169, 143, 243, 0.24), rgba(79, 70, 229, 0.18))', borderColor: 'rgba(169, 143, 243, 0.45)', color: '#eef2ff' },
  psychic: { background: 'linear-gradient(135deg, rgba(249, 85, 135, 0.24), rgba(190, 24, 93, 0.18))', borderColor: 'rgba(249, 85, 135, 0.45)', color: '#fdf2f8' },
  bug: { background: 'linear-gradient(135deg, rgba(166, 185, 26, 0.24), rgba(77, 124, 15, 0.18))', borderColor: 'rgba(166, 185, 26, 0.45)', color: '#f7fee7' },
  rock: { background: 'linear-gradient(135deg, rgba(182, 161, 54, 0.24), rgba(133, 77, 14, 0.18))', borderColor: 'rgba(182, 161, 54, 0.45)', color: '#fefce8' },
  ghost: { background: 'linear-gradient(135deg, rgba(115, 87, 151, 0.24), rgba(88, 28, 135, 0.18))', borderColor: 'rgba(115, 87, 151, 0.45)', color: '#faf5ff' },
  dragon: { background: 'linear-gradient(135deg, rgba(111, 53, 252, 0.24), rgba(67, 56, 202, 0.18))', borderColor: 'rgba(111, 53, 252, 0.45)', color: '#eef2ff' },
  dark: { background: 'linear-gradient(135deg, rgba(112, 87, 70, 0.28), rgba(31, 41, 55, 0.24))', borderColor: 'rgba(112, 87, 70, 0.45)', color: '#f5f5f4' },
  steel: { background: 'linear-gradient(135deg, rgba(183, 183, 206, 0.24), rgba(71, 85, 105, 0.18))', borderColor: 'rgba(183, 183, 206, 0.45)', color: '#f8fafc' },
  fairy: { background: 'linear-gradient(135deg, rgba(214, 133, 173, 0.24), rgba(219, 39, 119, 0.18))', borderColor: 'rgba(214, 133, 173, 0.45)', color: '#fdf2f8' },
}

export function typeBadgeStyle(type: PokemonTypeKey): CSSProperties {
  return TYPE_BADGE_STYLES[type]
}
