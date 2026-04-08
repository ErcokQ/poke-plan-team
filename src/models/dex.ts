import type { ItemEntry, LocaleCode, MoveEntry, PokemonEntry, PokemonTypeKey } from './domain'

export type DexAvailabilityFilterKey = 'scarlet-violet' | 'sword-shield' | 'pokemon-champions'
export type DexChampionsAvailabilityStatus = 'available' | 'limited' | 'unconfirmed' | 'unavailable'

export interface DexAbilityEntry {
  id: string
  name: string
  shortEffect: string
  effect: string
}

export interface DexPokemonProfileMoveEntry {
  id: string
  name: string
  category: 'physical' | 'special' | 'status'
  type: PokemonTypeKey
  versionGroups: string[]
  learnMethods: string[]
  minLevel: number | null
}

export interface DexPokemonProfileAbilityEntry {
  id: string
  name: string
  isHidden: boolean
  shortEffect?: string
  effect?: string
}

export interface DexPokemonProfileEvolutionVariant {
  id: string
  name: string
  kind: 'mega' | 'regional' | 'gmax' | 'totem' | 'primal' | 'style' | 'form'
}

export interface DexPokemonProfileEvolutionEntry {
  id: string
  name: string
  pokedexNumber: number
  variants: DexPokemonProfileEvolutionVariant[]
}

export interface DexPokemonProfileSummary {
  id: string
  pokedexNumber: number
  name: string
  genus: string
  flavorText: string
  types: PokemonTypeKey[]
  abilities: DexPokemonProfileAbilityEntry[]
  stats: {
    hp: number
    atk: number
    def: number
    spa: number
    spd: number
    spe: number
  }
  heightMeters: number
  weightKg: number
  baseExperience: number
  captureRate: number
  baseHappiness: number
  habitat: string
  growthRate: string
  generation: string
  generationId: number
  gameAvailability: DexAvailabilityFilterKey[]
  eggGroups: string[]
  isLegendary: boolean
  isMythical: boolean
  evolutionChain: DexPokemonProfileEvolutionEntry[]
  sprites: {
    home: string | null
    officialArtwork: string | null
    showdown: string | null
    default: string | null
  }
}

export interface DexPokemonProfileDetails {
  id: string
  moves: DexPokemonProfileMoveEntry[]
}

export interface DexPokemonProfile extends DexPokemonProfileSummary {
  moves: DexPokemonProfileMoveEntry[]
}

export interface DexCatalogSnapshot {
  version: 'v1'
  locale: LocaleCode
  generatedAt: string
  pokemon: PokemonEntry[]
  moves: MoveEntry[]
  items: ItemEntry[]
  abilities: DexAbilityEntry[]
  formsByPokemonId: Record<string, string[]>
}

export interface DexGenerationSnapshot {
  version: 'v1'
  locale: LocaleCode
  generationId: number
  generatedAt: string
  profiles: DexPokemonProfileSummary[]
  detailBucketsByPokemonId: Record<string, number>
}

export interface DexProfileSnapshot {
  version: 'v1'
  locale: LocaleCode
  generationId: number
  bucketId: number
  generatedAt: string
  profiles: DexPokemonProfileDetails[]
}

export interface DexChampionsAvailabilityEntry {
  pokemonId: string
  formId: string | null
  availability: DexChampionsAvailabilityStatus
  introducedIn: string
  sourceType: 'official' | 'community' | 'internal'
  sourceLabel: string
  sourceUrl: string
  notes: string
}

export interface DexChampionsAvailabilitySnapshot {
  version: 'v1'
  generatedAt: string
  game: {
    id: 'pokemon-champions'
    name: string
  }
  metadata: {
    maintainers: string[]
    lastReviewedAt: string
    notes: string
  }
  entries: DexChampionsAvailabilityEntry[]
}
