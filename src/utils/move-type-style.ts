import type { CSSProperties } from 'vue'
import type { PokemonTypeKey } from '@/models/domain'

const TYPE_GRADIENTS: Record<PokemonTypeKey, { accent: string; edge: string }> = {
  normal: { accent: 'rgba(148, 163, 184, 0.26)', edge: 'rgba(148, 163, 184, 0.08)' },
  fire: { accent: 'rgba(248, 113, 113, 0.30)', edge: 'rgba(251, 146, 60, 0.10)' },
  water: { accent: 'rgba(59, 130, 246, 0.30)', edge: 'rgba(34, 211, 238, 0.10)' },
  electric: { accent: 'rgba(250, 204, 21, 0.30)', edge: 'rgba(253, 224, 71, 0.10)' },
  grass: { accent: 'rgba(74, 222, 128, 0.30)', edge: 'rgba(134, 239, 172, 0.10)' },
  ice: { accent: 'rgba(103, 232, 249, 0.28)', edge: 'rgba(186, 230, 253, 0.10)' },
  fighting: { accent: 'rgba(251, 113, 133, 0.28)', edge: 'rgba(253, 186, 116, 0.10)' },
  poison: { accent: 'rgba(192, 132, 252, 0.28)', edge: 'rgba(216, 180, 254, 0.10)' },
  ground: { accent: 'rgba(251, 191, 36, 0.24)', edge: 'rgba(253, 230, 138, 0.10)' },
  flying: { accent: 'rgba(125, 211, 252, 0.26)', edge: 'rgba(165, 243, 252, 0.10)' },
  psychic: { accent: 'rgba(244, 114, 182, 0.28)', edge: 'rgba(251, 207, 232, 0.10)' },
  bug: { accent: 'rgba(163, 230, 53, 0.28)', edge: 'rgba(217, 249, 157, 0.10)' },
  rock: { accent: 'rgba(196, 181, 253, 0.24)', edge: 'rgba(221, 214, 254, 0.10)' },
  ghost: { accent: 'rgba(129, 140, 248, 0.28)', edge: 'rgba(199, 210, 254, 0.10)' },
  dragon: { accent: 'rgba(96, 165, 250, 0.30)', edge: 'rgba(165, 180, 252, 0.10)' },
  dark: { accent: 'rgba(71, 85, 105, 0.38)', edge: 'rgba(148, 163, 184, 0.16)' },
  steel: { accent: 'rgba(148, 163, 184, 0.28)', edge: 'rgba(226, 232, 240, 0.10)' },
  fairy: { accent: 'rgba(244, 114, 182, 0.24)', edge: 'rgba(251, 207, 232, 0.10)' },
}

export function moveTypeGradientStyle(type: PokemonTypeKey | null | undefined): CSSProperties | undefined {
  if (!type) return undefined
  const gradient = TYPE_GRADIENTS[type]
  if (!gradient) return undefined

  return {
    backgroundImage: `linear-gradient(90deg, ${gradient.accent} 0%, ${gradient.edge} 48%, rgba(10, 14, 20, 0) 100%)`,
  }
}
