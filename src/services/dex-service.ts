import type { ItemEntry, LocaleCode, MoveEntry, PokemonEntry, PokemonTypeKey, TeamRole } from '@/models/domain'

type NamedResource = { name: string; url: string }
type LocalizedName = { name: string; language: { name: string } }

interface PokeApiListResponse {
  count: number
  next: string | null
  previous: string | null
  results: NamedResource[]
}

interface PokeApiPokemon {
  id: number
  name: string
  base_experience: number
  height: number
  weight: number
  abilities: Array<{ ability: NamedResource; slot: number; is_hidden: boolean }>
  types: Array<{ slot: number; type: NamedResource }>
  stats: Array<{ base_stat: number; stat: { name: string } }>
  moves: Array<{
    move: NamedResource
    version_group_details: Array<{
      level_learned_at: number
      move_learn_method: NamedResource
      version_group: NamedResource
    }>
  }>
  species: NamedResource
  sprites: {
    front_default: string | null
    other?: {
      home?: { front_default: string | null }
      showdown?: { front_default: string | null }
      ['official-artwork']?: { front_default: string | null }
    }
  }
}

interface PokeApiSpecies {
  name: string
  id: number
  names: LocalizedName[]
  genera: Array<{ genus: string; language: { name: string } }>
  flavor_text_entries: Array<{ flavor_text: string; language: { name: string }; version: { name: string } }>
  habitat: NamedResource | null
  capture_rate: number
  base_happiness: number
  growth_rate: NamedResource
  generation: NamedResource
  egg_groups: NamedResource[]
  is_legendary: boolean
  is_mythical: boolean
  evolution_chain: { url: string } | null
  varieties: Array<{ is_default: boolean; pokemon: NamedResource }>
}

interface PokeApiEvolutionChain {
  chain: {
    species: NamedResource
    evolves_to: Array<PokeApiEvolutionChain['chain']>
  }
}

interface PokeApiMove {
  id: number
  name: string
  names: LocalizedName[]
  type: { name: string }
  damage_class: { name: 'physical' | 'special' | 'status' }
  power: number | null
  accuracy: number | null
  pp: number | null
  priority: number
  effect_chance: number | null
  target: { name: string }
  effect_entries: Array<{
    effect: string
    short_effect: string
    language: { name: string }
  }>
  meta: {
    ailment: { name: string }
    category: { name: string }
  } | null
}

interface PokeApiItem {
  id: number
  name: string
  names: LocalizedName[]
  category: { name: string }
  fling_power: number | null
  sprites?: {
    default: string | null
  }
  effect_entries: Array<{
    effect: string
    short_effect: string
    language: { name: string }
  }>
  flavor_text_entries: Array<{
    text: string
    language: { name: string }
    version_group: { name: string }
  }>
}

interface PokeApiAbility {
  id: number
  name: string
  names: LocalizedName[]
  effect_entries: Array<{
    effect: string
    short_effect: string
    language: { name: string }
  }>
}

interface PokeApiNamedEntry {
  name: string
  names: LocalizedName[]
}

const ITEM_DESCRIPTION_FALLBACKS: Record<string, { es: string; en: string }> = {
  'booster-energy': {
    es: 'Activa Protosintesis o Carga Cuark al entrar. Se consume tras activarse.',
    en: 'Activates Protosynthesis or Quark Drive on switch-in. Consumed on activation.',
  },
  'loaded-dice': {
    es: 'Aumenta la consistencia de movimientos multi-golpe para impactar mas veces.',
    en: 'Improves multi-hit consistency so those moves land more hits.',
  },
  'clear-amulet': {
    es: 'Evita que rivales bajen tus estadisticas. Ignora reducciones de stats enemigas.',
    en: 'Prevents opponents from lowering your stats.',
  },
  'mirror-herb': {
    es: 'Copia una subida de estadisticas del rival una vez y luego se consume.',
    en: 'Copies one opposing stat boost once, then it is consumed.',
  },
  'covert-cloak': {
    es: 'Evita efectos secundarios de movimientos que impactan al portador.',
    en: 'Protects the holder from additional move effects.',
  },
  'safety-goggles': {
    es: 'Inmune a dano de clima y a movimientos de polvo/espora.',
    en: 'Grants immunity to weather chip damage and powder/spore moves.',
  },
  'ability-shield': {
    es: 'Protege la habilidad para evitar anulacion, supresion o ignorar sus efectos.',
    en: 'Protects the holder Ability from suppression or negation effects.',
  },
  'black-augurite': {
    es: 'Piedra de evolucion especial usada para evolucionar a ciertos Pokemon.',
    en: 'A special evolution stone used to evolve specific Pokemon.',
  },
  'blank-plate': {
    es: 'Tabla de tipo neutro. Util para cambiar o definir tipo en casos especiales.',
    en: 'A neutral plate. Used for special type-changing interactions.',
  },
  'cornerstone-mask': {
    es: 'Mascara de Ogerpon (Cornerstone). Cambia forma y tera especial al equiparla.',
    en: 'Ogerpon Cornerstone mask. Changes form and special tera behavior when held.',
  },
  'fairy-feather': {
    es: 'Aumenta la potencia de movimientos de tipo Hada.',
    en: 'Boosts the power of Fairy-type moves.',
  },
  'hearthflame-mask': {
    es: 'Mascara de Ogerpon (Hearthflame). Cambia forma y tera especial al equiparla.',
    en: 'Ogerpon Hearthflame mask. Changes form and special tera behavior when held.',
  },
  'legend-plate': {
    es: 'Tabla legendaria asociada a Arceus y cambios especiales de tipo.',
    en: 'Legendary plate tied to Arceus and special type-changing behavior.',
  },
  'malicious-armor': {
    es: 'Armadura de evolucion usada para evolucionar a Charcadet.',
    en: 'Evolution armor used to evolve Charcadet.',
  },
  'masterpiece-teacup': {
    es: 'Tetera especial para evolucionar la forma autentica de Sinistea.',
    en: 'Special teacup used to evolve the authentic Sinistea line.',
  },
  'peat-block': {
    es: 'Bloque de turba usado para una evolucion especifica en condiciones especiales.',
    en: 'Peat block used for a specific evolution under special conditions.',
  },
  'punching-glove': {
    es: 'Potencia movimientos de punio y evita efectos de contacto en esos movimientos.',
    en: 'Boosts punching moves and removes contact side effects for those moves.',
  },
  'syrupy-apple': {
    es: 'Manzana especial usada para evolucionar a Dipplin.',
    en: 'Special apple used to evolve into Dipplin.',
  },
  'unremarkable-teacup': {
    es: 'Tetera para evolucionar la forma comun de Sinistea.',
    en: 'Teacup used to evolve the common Sinistea line.',
  },
  'wellspring-mask': {
    es: 'Mascara de Ogerpon (Wellspring). Cambia forma y tera especial al equiparla.',
    en: 'Ogerpon Wellspring mask. Changes form and special tera behavior when held.',
  },
}

function isExcludedItemSlug(itemSlug: string): boolean {
  // Event-only Dynamax crystal drops flood the list and are not useful for team builder.
  if (itemSlug.startsWith('dynamax-crystal-')) return true
  return false
}

function isExcludedItemCategory(category: string): boolean {
  // Builder item picker should ignore machine entries and similar noisy utility catalogs.
  return category === 'all-machines' || category === 'tm-materials'
}

export interface DexCatalogOptions {
  locale?: LocaleCode
  pokemonLimit?: number
  movesLimit?: number
  itemsLimit?: number
  offset?: number
  concurrency?: number
}

export interface DexNationalEntry {
  id: string
  pokedexNumber: number
  name: string
  types: PokemonTypeKey[]
}

export interface DexGenerationOptions {
  offset: number
  limit: number
  locale?: LocaleCode
  includeLocalizedNames?: boolean
  concurrency?: number
}

export interface DexPokemonProfile {
  id: string
  pokedexNumber: number
  name: string
  genus: string
  flavorText: string
  types: PokemonTypeKey[]
  abilities: Array<{ id: string; name: string; isHidden: boolean }>
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
  eggGroups: string[]
  isLegendary: boolean
  isMythical: boolean
  moves: Array<{
    id: string
    name: string
    category: 'physical' | 'special' | 'status'
    type: PokemonTypeKey
    versionGroups: string[]
    learnMethods: string[]
    minLevel: number | null
  }>
  evolutionChain: Array<{
    id: string
    name: string
    pokedexNumber: number
    variants: Array<{
      id: string
      name: string
      kind: 'mega' | 'regional' | 'gmax' | 'totem' | 'primal' | 'style' | 'form'
    }>
  }>
  sprites: {
    home: string | null
    officialArtwork: string | null
    showdown: string | null
    default: string | null
  }
}

const TYPE_SET = new Set<PokemonTypeKey>([
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
])

function isPokemonType(value: string): value is PokemonTypeKey {
  return TYPE_SET.has(value as PokemonTypeKey)
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function statValue(stats: PokeApiPokemon['stats'], key: string): number {
  return stats.find((entry) => entry.stat.name === key)?.base_stat ?? 0
}

function inferNature(stats: PokeApiPokemon['stats']): string {
  const atk = statValue(stats, 'attack')
  const spa = statValue(stats, 'special-attack')
  const spe = statValue(stats, 'speed')

  if (spe >= 95 && spa >= atk) return 'timid'
  if (spe >= 95 && atk > spa) return 'jolly'
  if (atk >= spa) return 'adamant'
  return 'modest'
}

function inferRoleTags(pokemon: PokeApiPokemon): TeamRole[] {
  const hp = statValue(pokemon.stats, 'hp')
  const atk = statValue(pokemon.stats, 'attack')
  const def = statValue(pokemon.stats, 'defense')
  const spa = statValue(pokemon.stats, 'special-attack')
  const spd = statValue(pokemon.stats, 'special-defense')
  const spe = statValue(pokemon.stats, 'speed')

  const roles = new Set<TeamRole>()
  const offense = Math.max(atk, spa)
  const bulk = def + spd

  // Keep base role seeds conservative; final role is refined by selected moves in Builder.
  if (offense >= 118) roles.add('sweeper')
  if (hp >= 95 && (def >= 100 || spd >= 100) && bulk >= 215) roles.add('wall')
  if (spe >= 120) {
    roles.add('speed-control')
  }
  if (spe >= 95 && offense >= 110 && !roles.has('wall')) roles.add('pivot')

  if (roles.size === 0 || (roles.size === 1 && roles.has('speed-control'))) roles.add('support')
  return [...roles]
}

function defaultSuggestedItems(types: PokemonTypeKey[]): string[] {
  if (types.includes('steel') || types.includes('rock')) return ['leftovers', 'assault-vest', 'sitrus-berry']
  if (types.includes('ghost') || types.includes('dark')) return ['focus-sash', 'life-orb', 'choice-scarf']
  return ['leftovers', 'life-orb', 'choice-scarf']
}

const BUILDER_VERSION_GROUPS = new Set(['scarlet-violet'])
const LEGAL_MOVE_LEARN_METHODS = new Set(['level-up', 'machine', 'tutor', 'egg', 'form-change'])

export class DexService {
  private readonly cache = new Map<string, Promise<unknown>>()

  constructor(private readonly baseUrl = 'https://pokeapi.co/api/v2') {}

  private mapMoveEntry(move: PokeApiMove, locale: LocaleCode): MoveEntry | null {
    if (!isPokemonType(move.type.name)) return null
    const shortEffect = this.resolveEffectText(move.effect_entries, locale, 'short', move.effect_chance)
    const longEffect = this.resolveEffectText(move.effect_entries, locale, 'long', move.effect_chance)

    return {
      id: move.name,
      name: this.resolveLocalizedName(move.names, locale, move.name),
      type: move.type.name,
      category: move.damage_class.name,
      power: move.power ?? 0,
      accuracy: move.accuracy,
      pp: move.pp,
      priority: move.priority,
      tags: [move.target.name, move.meta?.category?.name, move.meta?.ailment?.name]
        .filter(Boolean)
        .map((value) => String(value)),
      description: shortEffect,
      effect: longEffect || shortEffect,
    } satisfies MoveEntry
  }

  async loadPokemonCatalog(options: DexCatalogOptions = {}): Promise<PokemonEntry[]> {
    const locale = options.locale ?? 'es'
    const limit = options.pokemonLimit ?? 151
    const offset = options.offset ?? 0
    const concurrency = options.concurrency ?? 8
    const list = await this.request<PokeApiListResponse>(`pokemon?limit=${limit}&offset=${offset}`)

    const entries = await this.mapWithConcurrency(list.results, concurrency, async (resource) => {
      return this.loadPokemonEntry(resource.name, locale)
    })

    return entries.sort((a, b) => a.pokedexNumber - b.pokedexNumber)
  }

  async loadGenerationPokemon(options: DexGenerationOptions): Promise<DexNationalEntry[]> {
    const locale = options.locale ?? 'es'
    const includeLocalizedNames = options.includeLocalizedNames ?? locale !== 'en'
    const concurrency = options.concurrency ?? 12
    const list = await this.request<PokeApiListResponse>(
      `pokemon?limit=${options.limit}&offset=${options.offset}`,
    )

    const entries = await this.mapWithConcurrency(list.results, concurrency, async (resource) => {
      const pokemon = await this.request<PokeApiPokemon>(resource.url)
      const types = pokemon.types
        .sort((a, b) => a.slot - b.slot)
        .map((entry) => entry.type.name)
        .filter(isPokemonType)

      let localizedName = titleFromSlug(pokemon.name)
      if (includeLocalizedNames) {
        const species = await this.request<PokeApiSpecies>(pokemon.species.url)
        localizedName = this.resolveLocalizedName(species.names, locale, pokemon.name)
      }

      return {
        id: pokemon.name,
        pokedexNumber: pokemon.id,
        name: localizedName,
        types: types.length ? types : ['normal'],
      } satisfies DexNationalEntry
    })

    return entries.sort((a, b) => a.pokedexNumber - b.pokedexNumber)
  }

  async loadMovesCatalog(options: DexCatalogOptions = {}): Promise<MoveEntry[]> {
    const locale = options.locale ?? 'es'
    const limit = options.movesLimit ?? 250
    const offset = options.offset ?? 0
    const concurrency = options.concurrency ?? 10
    const list = await this.request<PokeApiListResponse>(`move?limit=${limit}&offset=${offset}`)

    const entries = await this.mapWithConcurrency(
      list.results,
      concurrency,
      async (resource): Promise<MoveEntry | null> => {
      const move = await this.request<PokeApiMove>(resource.url)
      return this.mapMoveEntry(move, locale)
      },
    )

    return entries.filter((entry): entry is MoveEntry => entry !== null)
  }

  async loadMoveEntry(idOrName: string, locale: LocaleCode = 'es'): Promise<MoveEntry | null> {
    try {
      const move = await this.request<PokeApiMove>(`move/${idOrName}`)
      return this.mapMoveEntry(move, locale)
    } catch {
      return null
    }
  }

  async loadItemsCatalog(options: DexCatalogOptions = {}): Promise<ItemEntry[]> {
    const locale = options.locale ?? 'es'
    const limit = options.itemsLimit ?? 0
    const offset = options.offset ?? 0
    const concurrency = options.concurrency ?? 10
    const pageSize = 200

    const resources =
      limit > 0
        ? (await this.request<PokeApiListResponse>(`item?limit=${limit}&offset=${offset}`)).results
        : await this.loadAllNamedResources('item', offset, pageSize)
    const filteredResources = resources.filter((resource) => !isExcludedItemSlug(resource.name))

    const entries = await this.mapWithConcurrency(
      filteredResources,
      concurrency,
      async (resource): Promise<ItemEntry | null> => {
      const item = await this.request<PokeApiItem>(resource.url)
      if (isExcludedItemCategory(item.category.name)) return null
      const shortEffect = this.resolveItemEffectText(item.effect_entries, locale, 'short')
      const longEffect = this.resolveItemEffectText(item.effect_entries, locale, 'long')
      const flavorText = this.resolveItemFlavorText(item.flavor_text_entries, locale)
      const fallbackDescription = this.resolveItemDescriptionFallback(item.name, locale)
      const description = shortEffect || flavorText || fallbackDescription

      return {
        id: item.name,
        name: this.resolveLocalizedName(item.names, locale, item.name),
        tags: [item.category.name, item.fling_power ? `fling-${item.fling_power}` : ''].filter(Boolean),
        description,
        effect: longEffect || description || fallbackDescription,
        icon:
          item.sprites?.default ??
          `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.name}.png`,
        category: item.category.name,
        flingPower: item.fling_power,
      } satisfies ItemEntry
      },
    )

    return entries.filter((entry): entry is ItemEntry => entry !== null)
  }

  private async loadAllNamedResources(
    resource: string,
    offset = 0,
    pageSize = 200,
  ): Promise<NamedResource[]> {
    const safeOffset = Math.max(0, Math.floor(offset))
    const safePageSize = Math.max(1, Math.floor(pageSize))
    const entries: NamedResource[] = []
    let nextUrl: string | null = `${resource}?limit=${safePageSize}&offset=${safeOffset}`

    while (nextUrl) {
      const page: PokeApiListResponse = await this.request<PokeApiListResponse>(nextUrl)
      entries.push(...page.results)
      nextUrl = page.next
    }

    return entries
  }

  async loadLocalizedResourceName(
    resource: 'ability' | 'nature',
    idOrName: string,
    locale: LocaleCode = 'es',
  ): Promise<string> {
    const entry = await this.request<PokeApiNamedEntry>(`${resource}/${idOrName}`)
    return this.resolveLocalizedName(entry.names, locale, entry.name)
  }

  async loadAbilityLocalizedMeta(
    abilityId: string,
    locale: LocaleCode = 'es',
  ): Promise<{ name: string; shortEffect: string; effect: string }> {
    const ability = await this.request<PokeApiAbility>(`ability/${abilityId}`)
    return {
      name: this.resolveLocalizedName(ability.names, locale, ability.name),
      shortEffect: this.resolveEffectText(ability.effect_entries, locale, 'short'),
      effect: this.resolveEffectText(ability.effect_entries, locale, 'long'),
    }
  }

  async loadPokemonEntry(idOrName: string | number, locale: LocaleCode = 'es'): Promise<PokemonEntry> {
    const pokemon = await this.request<PokeApiPokemon>(`pokemon/${idOrName}`)
    const species = await this.request<PokeApiSpecies>(pokemon.species.url)
    const evolutionChain = species.evolution_chain
      ? await this.loadEvolutionChain(species.evolution_chain.url)
      : [pokemon.name]
    const preEvolutionChain = species.evolution_chain
      ? await this.loadEvolutionPathToSpecies(species.evolution_chain.url, species.name)
      : []

    const types = pokemon.types
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name)
      .filter(isPokemonType)

    const learnsetMoves = this.extractLearnsetMoves(pokemon)
    const suggestedMoves = learnsetMoves.slice(0, 8)

    return {
      id: pokemon.name,
      name: this.resolveLocalizedName(species.names, locale, pokemon.name),
      pokedexNumber: species.id,
      types: types.length ? types : ['normal'],
      evolutionChain: evolutionChain.length ? evolutionChain : [pokemon.name],
      preEvolutionChain,
      abilities: pokemon.abilities.sort((a, b) => a.slot - b.slot).map((entry) => entry.ability.name),
      suggestedItems: defaultSuggestedItems(types),
      suggestedMoves,
      learnsetMoves,
      defaultNature: inferNature(pokemon.stats),
      baseStats: {
        hp: statValue(pokemon.stats, 'hp'),
        atk: statValue(pokemon.stats, 'attack'),
        def: statValue(pokemon.stats, 'defense'),
        spa: statValue(pokemon.stats, 'special-attack'),
        spd: statValue(pokemon.stats, 'special-defense'),
        spe: statValue(pokemon.stats, 'speed'),
      },
      roleTags: inferRoleTags(pokemon),
    }
  }

  async loadPokemonForms(idOrName: string | number, locale: LocaleCode = 'es'): Promise<PokemonEntry[]> {
    const pokemon = await this.request<PokeApiPokemon>(`pokemon/${idOrName}`)
    const species = await this.request<PokeApiSpecies>(pokemon.species.url)
    const varieties = species.varieties ?? []

    const varietyOrder = new Map<string, { index: number; isDefault: boolean }>()
    varieties.forEach((entry, index) => {
      varietyOrder.set(entry.pokemon.name, { index, isDefault: entry.is_default })
    })

    const varietyNames = [
      ...new Set(
        (varieties.length ? varieties.map((entry) => entry.pokemon.name) : [pokemon.name]).filter(Boolean),
      ),
    ]

    const entries = await this.mapWithConcurrency(varietyNames, 4, async (varietyName) =>
      this.loadPokemonEntry(varietyName, locale),
    )

    return entries.sort((a, b) => {
      const aOrder = varietyOrder.get(a.id)
      const bOrder = varietyOrder.get(b.id)
      const aDefault = aOrder?.isDefault ? 1 : 0
      const bDefault = bOrder?.isDefault ? 1 : 0
      if (aDefault !== bDefault) return bDefault - aDefault
      const aIndex = aOrder?.index ?? Number.MAX_SAFE_INTEGER
      const bIndex = bOrder?.index ?? Number.MAX_SAFE_INTEGER
      if (aIndex !== bIndex) return aIndex - bIndex
      return a.name.localeCompare(b.name, locale === 'es' ? 'es' : 'en')
    })
  }

  async loadPokemonProfile(idOrName: string | number, locale: LocaleCode = 'es'): Promise<DexPokemonProfile> {
    const pokemon = await this.request<PokeApiPokemon>(`pokemon/${idOrName}`)
    const species = await this.request<PokeApiSpecies>(pokemon.species.url)

    const types = pokemon.types
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name)
      .filter(isPokemonType)

    const flavor = this.resolveFlavorText(species.flavor_text_entries, locale)
    const genus = this.resolveGenus(species.genera, locale)

    const abilities = await this.mapWithConcurrency(
      pokemon.abilities.sort((a, b) => a.slot - b.slot),
      4,
      async (entry) => {
        const ability = await this.request<PokeApiAbility>(entry.ability.url)
        return {
          id: entry.ability.name,
          name: this.resolveLocalizedName(ability.names, locale, entry.ability.name),
          isHidden: entry.is_hidden,
        }
      },
    )

    const evolutionChain = species.evolution_chain
      ? await this.loadEvolutionChainDetailed(species.evolution_chain.url, locale)
      : [
          {
            id: pokemon.name,
            name: this.resolveLocalizedName(species.names, locale, pokemon.name),
            pokedexNumber: pokemon.id,
            variants: this.extractVariants(species, locale),
          },
        ]

    const moveMetadata = new Map<
      string,
      {
        versionGroups: Set<string>
        learnMethods: Set<string>
        minLevel: number | null
      }
    >()

    for (const entry of pokemon.moves) {
      if (!moveMetadata.has(entry.move.name)) {
        moveMetadata.set(entry.move.name, {
          versionGroups: new Set<string>(),
          learnMethods: new Set<string>(),
          minLevel: null,
        })
      }
      const target = moveMetadata.get(entry.move.name)!
      for (const detail of entry.version_group_details) {
        target.versionGroups.add(detail.version_group.name)
        target.learnMethods.add(detail.move_learn_method.name)
        if (detail.level_learned_at > 0) {
          target.minLevel =
            target.minLevel === null
              ? detail.level_learned_at
              : Math.min(target.minLevel, detail.level_learned_at)
        }
      }
    }

    const uniqueMoves = pokemon.moves
      .map((entry) => entry.move)
      .filter((entry, index, list) => list.findIndex((item) => item.name === entry.name) === index)

    const moves = await this.mapWithConcurrency(uniqueMoves, 16, async (moveRef) => {
      const move = await this.request<PokeApiMove>(moveRef.url)
      if (!isPokemonType(move.type.name)) return null
      const metadata = moveMetadata.get(move.name)
      return {
        id: move.name,
        name: this.resolveLocalizedName(move.names, locale, move.name),
        category: move.damage_class.name,
        type: move.type.name,
        versionGroups: [...(metadata?.versionGroups ?? [])].sort(),
        learnMethods: [...(metadata?.learnMethods ?? [])].sort(),
        minLevel: metadata?.minLevel ?? null,
      } satisfies DexPokemonProfile['moves'][number]
    })

    const normalizedMoves = moves
      .filter((entry): entry is DexPokemonProfile['moves'][number] => Boolean(entry))
      .sort((a, b) => a.name.localeCompare(b.name, locale === 'es' ? 'es' : 'en'))

    return {
      id: pokemon.name,
      pokedexNumber: pokemon.id,
      name: this.resolveLocalizedName(species.names, locale, pokemon.name),
      genus,
      flavorText: flavor,
      types: types.length ? types : ['normal'],
      abilities,
      stats: {
        hp: statValue(pokemon.stats, 'hp'),
        atk: statValue(pokemon.stats, 'attack'),
        def: statValue(pokemon.stats, 'defense'),
        spa: statValue(pokemon.stats, 'special-attack'),
        spd: statValue(pokemon.stats, 'special-defense'),
        spe: statValue(pokemon.stats, 'speed'),
      },
      heightMeters: pokemon.height / 10,
      weightKg: pokemon.weight / 10,
      baseExperience: pokemon.base_experience ?? 0,
      captureRate: species.capture_rate ?? 0,
      baseHappiness: species.base_happiness ?? 0,
      habitat: species.habitat ? titleFromSlug(species.habitat.name) : 'Unknown',
      growthRate: species.growth_rate ? titleFromSlug(species.growth_rate.name) : 'Unknown',
      generation: species.generation ? titleFromSlug(species.generation.name) : 'Unknown',
      eggGroups: (species.egg_groups ?? []).map((entry) => titleFromSlug(entry.name)),
      isLegendary: Boolean(species.is_legendary),
      isMythical: Boolean(species.is_mythical),
      moves: normalizedMoves,
      evolutionChain,
      sprites: {
        home: pokemon.sprites.other?.home?.front_default ?? null,
        officialArtwork: pokemon.sprites.other?.['official-artwork']?.front_default ?? null,
        showdown: pokemon.sprites.other?.showdown?.front_default ?? null,
        default: pokemon.sprites.front_default ?? null,
      },
    }
  }

  async getPokemonSpriteUrl(idOrName: string | number): Promise<string | null> {
    const pokemon = await this.request<PokeApiPokemon>(`pokemon/${idOrName}`)
    return (
      pokemon.sprites.other?.home?.front_default ??
      pokemon.sprites.other?.showdown?.front_default ??
      pokemon.sprites.other?.['official-artwork']?.front_default ??
      pokemon.sprites.front_default ??
      null
    )
  }

  private async loadEvolutionChain(url: string): Promise<string[]> {
    const evolution = await this.request<PokeApiEvolutionChain>(url)
    const chain: string[] = []

    const walk = (node: PokeApiEvolutionChain['chain']) => {
      chain.push(node.species.name)
      for (const next of node.evolves_to) walk(next)
    }

    walk(evolution.chain)
    return [...new Set(chain)]
  }

  private async loadEvolutionPathToSpecies(url: string, targetSpeciesName: string): Promise<string[]> {
    const evolution = await this.request<PokeApiEvolutionChain>(url)
    const path: string[] = []

    const walk = (node: PokeApiEvolutionChain['chain'], trail: string[]): boolean => {
      const nextTrail = [...trail, node.species.name]
      if (node.species.name === targetSpeciesName) {
        path.push(...nextTrail)
        return true
      }
      for (const next of node.evolves_to) {
        if (walk(next, nextTrail)) return true
      }
      return false
    }

    const found = walk(evolution.chain, [])
    if (!found) return []
    return path.slice(0, -1)
  }

  private async loadEvolutionChainDetailed(
    url: string,
    locale: LocaleCode,
  ): Promise<
    Array<{
      id: string
      name: string
      pokedexNumber: number
      variants: Array<{
        id: string
        name: string
        kind: 'mega' | 'regional' | 'gmax' | 'totem' | 'primal' | 'style' | 'form'
      }>
    }>
  > {
    const evolution = await this.request<PokeApiEvolutionChain>(url)
    const chain: NamedResource[] = []

    const walk = (node: PokeApiEvolutionChain['chain']) => {
      chain.push(node.species)
      for (const next of node.evolves_to) walk(next)
    }

    walk(evolution.chain)

    const unique = chain.filter(
      (entry, index, list) => list.findIndex((item) => item.name === entry.name) === index,
    )

    const detailed = await this.mapWithConcurrency(unique, 4, async (entry) => {
      const species = await this.request<PokeApiSpecies>(entry.url)
      return {
        id: entry.name,
        name: this.resolveLocalizedName(species.names, locale, entry.name),
        pokedexNumber: species.id,
        variants: this.extractVariants(species, locale),
      }
    })

    return detailed.sort((a, b) => a.pokedexNumber - b.pokedexNumber)
  }

  private resolveFlavorText(
    entries: Array<{ flavor_text: string; language: { name: string } }>,
    locale: LocaleCode,
  ): string {
    const normalized = locale === 'es' ? 'es' : 'en'
    const localized = entries.find((entry) => entry.language.name === normalized)
    const fallback = entries.find((entry) => entry.language.name === 'en')
    const value = localized?.flavor_text ?? fallback?.flavor_text ?? ''
    return value.replace(/\f|\n|\r/g, ' ').replace(/\s+/g, ' ').trim()
  }

  private resolveGenus(
    entries: Array<{ genus: string; language: { name: string } }>,
    locale: LocaleCode,
  ): string {
    const normalized = locale === 'es' ? 'es' : 'en'
    return (
      entries.find((entry) => entry.language.name === normalized)?.genus ??
      entries.find((entry) => entry.language.name === 'en')?.genus ??
      ''
    )
  }

  private resolveLocalizedName(names: LocalizedName[], locale: LocaleCode, fallbackSlug: string): string {
    const normalized = locale === 'es' ? 'es' : 'en'
    const found = names.find((entry) => entry.language.name === normalized)
    if (found?.name) return found.name
    return titleFromSlug(fallbackSlug)
  }

  private resolveItemEffectText(
    entries: Array<{ effect: string; short_effect: string; language: { name: string } }>,
    locale: LocaleCode,
    variant: 'short' | 'long',
  ): string {
    return this.resolveEffectText(entries, locale, variant)
  }

  private resolveEffectText(
    entries: Array<{ effect: string; short_effect: string; language: { name: string } }>,
    locale: LocaleCode,
    variant: 'short' | 'long',
    effectChance?: number | null,
  ): string {
    const normalized = locale === 'es' ? 'es' : 'en'
    const localized = entries.find((entry) => entry.language.name === normalized)
    const fallback = entries.find((entry) => entry.language.name === 'en')
    const localizedValue =
      variant === 'short'
        ? localized?.short_effect?.trim()
        : localized?.effect?.trim()
    const fallbackValue =
      variant === 'short'
        ? fallback?.short_effect?.trim()
        : fallback?.effect?.trim()
    const value = localizedValue || fallbackValue || ''
    const withChance =
      effectChance == null
        ? value
        : value.replace(/\$effect_chance|\{effect_chance\}/g, String(effectChance))
    return withChance.replace(/\f|\n|\r/g, ' ').replace(/\s+/g, ' ').trim()
  }

  private resolveItemFlavorText(
    entries: Array<{ text: string; language: { name: string } }>,
    locale: LocaleCode,
  ): string {
    const normalized = locale === 'es' ? 'es' : 'en'
    const localized = entries.find((entry) => entry.language.name === normalized)
    const fallback = entries.find((entry) => entry.language.name === 'en')
    const value = localized?.text ?? fallback?.text ?? ''
    return value.replace(/\f|\n|\r/g, ' ').replace(/\s+/g, ' ').trim()
  }

  private resolveItemDescriptionFallback(itemId: string, locale: LocaleCode): string {
    const entry = ITEM_DESCRIPTION_FALLBACKS[itemId]
    if (!entry) return ''
    return locale === 'es' ? entry.es : entry.en
  }

  private extractVariants(
    species: PokeApiSpecies,
    locale: LocaleCode,
  ): Array<{
    id: string
    name: string
    kind: 'mega' | 'regional' | 'gmax' | 'totem' | 'primal' | 'style' | 'form'
  }> {
    const baseSlug = species.name
    const baseName = this.resolveLocalizedName(species.names, locale, baseSlug)
    return (species.varieties ?? [])
      .filter((entry) => !entry.is_default)
      .map((entry) => entry.pokemon.name)
      .sort()
      .map((variantId) => {
        const descriptor = this.describeVariant(variantId, baseSlug, locale)
        return {
          id: variantId,
          name: `${baseName} ${descriptor.label}`.trim(),
          kind: descriptor.kind,
        }
      })
  }

  private describeVariant(
    variantId: string,
    speciesSlug: string,
    locale: LocaleCode,
  ): {
    label: string
    kind: 'mega' | 'regional' | 'gmax' | 'totem' | 'primal' | 'style' | 'form'
  } {
    const suffixRaw = variantId.startsWith(`${speciesSlug}-`)
      ? variantId.slice(speciesSlug.length + 1)
      : variantId

    const normalized = suffixRaw.toLowerCase()
    const tokens = normalized.split('-').filter(Boolean)
    const fallbackLabel = titleFromSlug(suffixRaw)

    if (tokens.includes('mega')) {
      const extra = tokens.filter((token) => token !== 'mega').join(' ')
      const mega = locale === 'es' ? 'Mega' : 'Mega'
      return { label: extra ? `${mega} ${extra.toUpperCase()}` : mega, kind: 'mega' }
    }

    if (tokens.includes('gmax')) {
      return { label: locale === 'es' ? 'Gigamax' : 'Gmax', kind: 'gmax' }
    }

    const regionMap: Record<string, { es: string; en: string }> = {
      alola: { es: 'Alola', en: 'Alola' },
      galar: { es: 'Galar', en: 'Galar' },
      hisui: { es: 'Hisui', en: 'Hisui' },
      paldea: { es: 'Paldea', en: 'Paldea' },
    }
    const regionToken = tokens.find((token) => token in regionMap)
    if (regionToken) {
      const region = locale === 'es' ? regionMap[regionToken].es : regionMap[regionToken].en
      const extra = tokens
        .filter((token) => token !== regionToken)
        .map((token) => titleFromSlug(token))
        .join(' ')
      return { label: extra ? `${region} ${extra}` : region, kind: 'regional' }
    }

    if (tokens.includes('totem')) {
      return { label: locale === 'es' ? 'Totem' : 'Totem', kind: 'totem' }
    }

    if (tokens.includes('primal')) {
      return { label: locale === 'es' ? 'Primigenio' : 'Primal', kind: 'primal' }
    }

    const styleTokens = new Set([
      'single',
      'rapid',
      'strike',
      'school',
      'blade',
      'shield',
      'midday',
      'midnight',
      'dusk',
      'hero',
      'crowned',
      'sunny',
      'rainy',
      'snowy',
      'origin',
      'therian',
      'incarnate',
      'attack',
      'defense',
      'speed',
      'average',
      'small',
      'large',
      'super',
    ])
    if (tokens.some((token) => styleTokens.has(token))) {
      return { label: fallbackLabel, kind: 'style' }
    }

    return { label: fallbackLabel, kind: 'form' }
  }

  private extractLearnsetMoves(pokemon: PokeApiPokemon): string[] {
    const filtered = new Set<string>()
    const anyMethod = new Set<string>()

    for (const entry of pokemon.moves) {
      let hasBuilderLegalDetail = false
      let hasAllowedMethod = false

      for (const detail of entry.version_group_details) {
        if (!LEGAL_MOVE_LEARN_METHODS.has(detail.move_learn_method.name)) continue
        hasAllowedMethod = true
        if (BUILDER_VERSION_GROUPS.has(detail.version_group.name)) {
          hasBuilderLegalDetail = true
        }
      }

      if (hasBuilderLegalDetail) filtered.add(entry.move.name)
      if (hasAllowedMethod) anyMethod.add(entry.move.name)
    }

    if (filtered.size > 0) return [...filtered]
    return [...anyMethod]
  }

  private async request<T>(pathOrUrl: string): Promise<T> {
    const url = this.toUrl(pathOrUrl)

    if (!this.cache.has(url)) {
      this.cache.set(
        url,
        fetch(url).then(async (response) => {
          if (!response.ok) {
            throw new Error(`DexService request failed (${response.status}) for ${url}`)
          }
          return (await response.json()) as T
        }),
      )
    }

    return (await this.cache.get(url)) as T
  }

  private toUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
    return `${this.baseUrl.replace(/\/+$/, '')}/${pathOrUrl.replace(/^\/+/, '')}`
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const safeLimit = Math.max(1, Math.floor(limit))
    const results = new Array<R>(items.length)
    let nextIndex = 0

    const worker = async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1
        if (index >= items.length) break
        results[index] = await mapper(items[index], index)
      }
    }

    await Promise.all(Array.from({ length: Math.min(safeLimit, items.length) }, () => worker()))
    return results
  }
}

export const dexService = new DexService()
