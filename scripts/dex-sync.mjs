import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'
import { syncChampionsRegulation } from './champions-regulation-sync.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const outputRoot = path.join(repoRoot, 'public', 'dex-snapshots')
const abilityDescriptionOverridesPath = path.join(repoRoot, 'data', 'abilities', 'description-overrides.source.json')
const moveDescriptionOverridesPath = path.join(repoRoot, 'data', 'moves', 'description-overrides.source.json')
const championsSourcePath = path.join(repoRoot, 'data', 'champions', 'availability.source.json')
const championsFormOverridesPath = path.join(repoRoot, 'data', 'champions', 'form-overrides.source.json')

const API_BASE_URL = 'https://pokeapi.co/api/v2'
const SHOWDOWN_POKEDEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json'
const SHOWDOWN_ABILITIES_URL = 'https://play.pokemonshowdown.com/data/abilities.js'
const SHOWDOWN_ITEMS_URL = 'https://play.pokemonshowdown.com/data/items.js'
const LOCALES = ['es', 'en']
const DETAIL_BUCKET_SIZE = 24
const GAME_AVAILABILITY_VERSION_GROUPS = {
  'scarlet-violet': new Set(['paldea', 'kitakami', 'blueberry']),
  'sword-shield': new Set(['galar', 'isle-of-armor', 'crown-tundra']),
}
const TYPE_KEYS = new Set([
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
const BUILDER_VERSION_GROUPS = new Set(['scarlet-violet'])
const LEGAL_MOVE_LEARN_METHODS = new Set(['level-up', 'machine', 'tutor', 'egg', 'form-change'])
const ITEM_DESCRIPTION_FALLBACKS = {
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
  'punching-glove': {
    es: 'Potencia movimientos de punio y evita efectos de contacto en esos movimientos.',
    en: 'Boosts punching moves and removes contact side effects for those moves.',
  },
}
const TYPE_LABELS_ES = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Electrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psiquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragon',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
}
const TERRAIN_LABELS_ES = {
  'electric terrain': 'Campo Electrico',
  'grassy terrain': 'Campo de Hierba',
  'misty terrain': 'Campo de Niebla',
  'psychic terrain': 'Campo Psiquico',
}
const STAT_LABELS_ES = {
  attack: { label: 'Ataque', article: 'el' },
  defense: { label: 'Defensa', article: 'la' },
  accuracy: { label: 'precision', article: 'la' },
  speed: { label: 'Velocidad', article: 'la' },
  'special attack': { label: 'Ataque Especial', article: 'el' },
  'special defense': { label: 'Defensa Especial', article: 'la' },
}
const STAGE_LABELS_ES = {
  one: 'un nivel',
  two: 'dos niveles',
  three: 'tres niveles',
  four: 'cuatro niveles',
  five: 'cinco niveles',
  six: 'seis niveles',
}

function normalizeChampionsAvailabilityEntry(entry) {
  const pokemonId = String(entry?.pokemonId ?? '').trim()
  if (!pokemonId) return null

  const rawAvailability = String(entry?.availability ?? 'unconfirmed').trim().toLowerCase()
  const availability = ['available', 'limited', 'unconfirmed', 'unavailable'].includes(rawAvailability)
    ? rawAvailability
    : 'unconfirmed'
  const rawSourceType = String(entry?.sourceType ?? 'internal').trim().toLowerCase()
  const sourceType = ['official', 'community', 'internal'].includes(rawSourceType) ? rawSourceType : 'internal'

  return {
    pokemonId,
    formId: entry?.formId ? String(entry.formId).trim() : null,
    availability,
    introducedIn: String(entry?.introducedIn ?? 'unknown').trim() || 'unknown',
    sourceType,
    sourceLabel: String(entry?.sourceLabel ?? '').trim(),
    sourceUrl: String(entry?.sourceUrl ?? '').trim(),
    notes: String(entry?.notes ?? '').trim(),
  }
}

function normalizeChampionsFormOverrideEntry(entry) {
  const formId = String(entry?.formId ?? '').trim()
  if (!formId) return null

  const abilityIds = Array.isArray(entry?.abilityIds)
    ? entry.abilityIds.map((value) => normalizeAbilityId(value)).filter(Boolean)
    : []

  return {
    formId,
    abilityIds: [...new Set(abilityIds)],
  }
}

function normalizeChampionsAbilityOverride(entry) {
  const id = normalizeAbilityId(entry?.id)
  if (!id) return null

  const nameEn = String(entry?.nameEn ?? entry?.name ?? titleFromSlug(id)).trim() || titleFromSlug(id)
  const nameEs = String(entry?.nameEs ?? entry?.name ?? nameEn).trim() || nameEn
  const shortEffectEn = normalizeText(entry?.shortEffectEn ?? entry?.shortEffect ?? entry?.effectEn ?? entry?.effect ?? '')
  const shortEffectEs = normalizeText(entry?.shortEffectEs ?? entry?.shortEffect ?? entry?.effectEs ?? entry?.effect ?? shortEffectEn)
  const effectEn = normalizeText(entry?.effectEn ?? entry?.effect ?? entry?.shortEffectEn ?? entry?.shortEffect ?? shortEffectEn)
  const effectEs = normalizeText(entry?.effectEs ?? entry?.effect ?? entry?.shortEffectEs ?? entry?.shortEffect ?? shortEffectEs)

  return {
    id,
    nameEs,
    nameEn,
    shortEffectEs,
    shortEffectEn,
    effectEs,
    effectEn,
  }
}

function normalizeAbilityDescriptionOverride(entry) {
  const id = normalizeAbilityId(entry?.id)
  if (!id) return null

  const nameEn = String(entry?.nameEn ?? entry?.name ?? titleFromSlug(id)).trim() || titleFromSlug(id)
  const nameEs = String(entry?.nameEs ?? entry?.name ?? nameEn).trim() || nameEn
  const shortEffectEn = normalizeText(entry?.shortEffectEn ?? entry?.shortEffect ?? entry?.effectEn ?? entry?.effect ?? '')
  const shortEffectEs = normalizeText(entry?.shortEffectEs ?? entry?.shortEffect ?? entry?.effectEs ?? entry?.effect ?? shortEffectEn)
  const effectEn = normalizeText(entry?.effectEn ?? entry?.effect ?? entry?.shortEffectEn ?? entry?.shortEffect ?? shortEffectEn)
  const effectEs = normalizeText(entry?.effectEs ?? entry?.effect ?? entry?.shortEffectEs ?? entry?.shortEffect ?? shortEffectEs)

  return {
    id,
    nameEs,
    nameEn,
    shortEffectEs,
    shortEffectEn,
    effectEs,
    effectEn,
  }
}

function normalizeMoveDescriptionOverride(entry) {
  const id = String(entry?.id ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id) return null

  const nameEn = String(entry?.nameEn ?? entry?.name ?? titleFromSlug(id)).trim() || titleFromSlug(id)
  const nameEs = String(entry?.nameEs ?? entry?.name ?? nameEn).trim() || nameEn
  const shortEffectEn = normalizeText(entry?.shortEffectEn ?? entry?.shortEffect ?? entry?.effectEn ?? entry?.effect ?? '')
  const shortEffectEs = normalizeText(entry?.shortEffectEs ?? entry?.shortEffect ?? entry?.effectEs ?? entry?.effect ?? shortEffectEn)
  const effectEn = normalizeText(entry?.effectEn ?? entry?.effect ?? entry?.shortEffectEn ?? entry?.shortEffect ?? shortEffectEn)
  const effectEs = normalizeText(entry?.effectEs ?? entry?.effect ?? entry?.shortEffectEs ?? entry?.shortEffect ?? shortEffectEs)

  return {
    id,
    nameEs,
    nameEn,
    shortEffectEs,
    shortEffectEn,
    effectEs,
    effectEn,
  }
}

async function loadChampionsAvailabilityOverlay(generatedAt) {
  const raw = JSON.parse(await readFile(championsSourcePath, 'utf8'))
  const entries = Array.isArray(raw?.entries)
    ? raw.entries.map((entry) => normalizeChampionsAvailabilityEntry(entry)).filter(Boolean)
    : []

  return {
    version: 'v1',
    generatedAt,
    game: {
      id: 'pokemon-champions',
      name: String(raw?.game?.name ?? 'Pokemon Champions'),
    },
    metadata: {
      maintainers: Array.isArray(raw?.metadata?.maintainers)
        ? raw.metadata.maintainers.map((entry) => String(entry).trim()).filter(Boolean)
        : [],
      lastReviewedAt: String(raw?.metadata?.lastReviewedAt ?? '').trim() || generatedAt.slice(0, 10),
      notes: String(raw?.metadata?.notes ?? '').trim(),
    },
    entries,
  }
}

async function loadAbilityDescriptionOverrides() {
  const raw = JSON.parse(await readFile(abilityDescriptionOverridesPath, 'utf8'))
  const abilities = Array.isArray(raw?.abilities)
    ? raw.abilities.map((entry) => normalizeAbilityDescriptionOverride(entry)).filter(Boolean)
    : []

  return {
    abilitiesById: Object.fromEntries(abilities.map((entry) => [entry.id, entry])),
  }
}

async function loadMoveDescriptionOverrides() {
  const raw = JSON.parse(await readFile(moveDescriptionOverridesPath, 'utf8'))
  const moves = Array.isArray(raw?.moves) ? raw.moves.map((entry) => normalizeMoveDescriptionOverride(entry)).filter(Boolean) : []

  return {
    movesById: Object.fromEntries(moves.map((entry) => [entry.id, entry])),
  }
}

async function loadChampionsFormOverrides() {
  const raw = JSON.parse(await readFile(championsFormOverridesPath, 'utf8'))
  const entries = Array.isArray(raw?.entries)
    ? raw.entries.map((entry) => normalizeChampionsFormOverrideEntry(entry)).filter(Boolean)
    : []
  const abilities = Array.isArray(raw?.abilities)
    ? raw.abilities.map((entry) => normalizeChampionsAbilityOverride(entry)).filter(Boolean)
    : []

  return {
    entriesByFormId: Object.fromEntries(entries.map((entry) => [entry.formId, entry])),
    abilitiesById: Object.fromEntries(abilities.map((entry) => [entry.id, entry])),
  }
}

const requestCache = new Map()

function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function toShowdownId(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeAbilityId(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeItemId(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isPokemonType(value) {
  return TYPE_KEYS.has(value)
}

function statValue(stats, key) {
  return stats.find((entry) => entry.stat.name === key)?.base_stat ?? 0
}

function inferNature(stats) {
  const atk = statValue(stats, 'attack')
  const spa = statValue(stats, 'special-attack')
  const spe = statValue(stats, 'speed')

  if (spe >= 95 && spa >= atk) return 'timid'
  if (spe >= 95 && atk > spa) return 'jolly'
  if (atk >= spa) return 'adamant'
  return 'modest'
}

function inferRoleTags(pokemon) {
  const hp = statValue(pokemon.stats, 'hp')
  const atk = statValue(pokemon.stats, 'attack')
  const def = statValue(pokemon.stats, 'defense')
  const spa = statValue(pokemon.stats, 'special-attack')
  const spd = statValue(pokemon.stats, 'special-defense')
  const spe = statValue(pokemon.stats, 'speed')

  const roles = new Set()
  const offense = Math.max(atk, spa)
  const bulk = def + spd

  if (offense >= 118) roles.add('sweeper')
  if (hp >= 95 && (def >= 100 || spd >= 100) && bulk >= 215) roles.add('wall')
  if (spe >= 120) roles.add('speed-control')
  if (spe >= 95 && offense >= 110 && !roles.has('wall')) roles.add('pivot')
  if (roles.size === 0 || (roles.size === 1 && roles.has('speed-control'))) roles.add('support')

  return [...roles]
}

function defaultSuggestedItems(types) {
  if (types.includes('steel') || types.includes('rock')) return ['leftovers', 'assault-vest', 'sitrus-berry']
  if (types.includes('ghost') || types.includes('dark')) return ['focus-sash', 'life-orb', 'choice-scarf']
  return ['leftovers', 'life-orb', 'choice-scarf']
}

function generationIdFromName(name) {
  const match = String(name ?? '').match(/generation-([ivx]+)/i)
  if (!match) return 9
  const roman = match[1].toLowerCase()
  const map = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 }
  return map[roman] ?? 9
}

function resolveLocalizedName(names, locale, fallbackSlug) {
  const lang = locale === 'es' ? 'es' : 'en'
  return names.find((entry) => entry.language.name === lang)?.name ?? titleFromSlug(fallbackSlug)
}

function resolveGenus(entries, locale) {
  const lang = locale === 'es' ? 'es' : 'en'
  return (
    entries.find((entry) => entry.language.name === lang)?.genus ??
    entries.find((entry) => entry.language.name === 'en')?.genus ??
    ''
  )
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\f|\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveFlavorText(entries, locale) {
  const lang = locale === 'es' ? 'es' : 'en'
  return normalizeText(
    entries.find((entry) => entry.language.name === lang)?.flavor_text ??
      entries.find((entry) => entry.language.name === 'en')?.flavor_text ??
      '',
  )
}

function resolveEffectText(entries, locale, variant, effectChance) {
  const lang = locale === 'es' ? 'es' : 'en'
  const localized = entries.find((entry) => entry.language.name === lang)
  const fallback = entries.find((entry) => entry.language.name === 'en')
  const key = variant === 'short' ? 'short_effect' : 'effect'
  const raw = localized?.[key]?.trim() || fallback?.[key]?.trim() || ''
  const withChance =
    effectChance == null ? raw : raw.replace(/\$effect_chance|\{effect_chance\}/g, String(effectChance))
  return normalizeText(withChance)
}

function translateTypeLabelToSpanish(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return TYPE_LABELS_ES[normalized] ?? value
}

function translateTerrainLabelToSpanish(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return TERRAIN_LABELS_ES[normalized] ?? value
}

function translateStageLabelToSpanish(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return STAGE_LABELS_ES[normalized] ?? value
}

function translateStatSequenceToSpanish(value) {
  const parts = String(value ?? '')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const translated = parts.map((part) => {
    const normalized = part.toLowerCase()
    const stat = STAT_LABELS_ES[normalized]
    if (!stat) return part
    return `${stat.article} ${stat.label}`
  })

  if (translated.length <= 1) return translated[0] ?? value
  if (translated.length === 2) return `${translated[0]} y ${translated[1]}`
  return `${translated.slice(0, -1).join(', ')} y ${translated.at(-1)}`
}

function translateMoveSentenceToSpanish(sentence) {
  const trimmed = normalizeText(sentence)
  if (!trimmed) return ''
  const statusVerbLabelsEs = {
    burn: 'quemar',
    freeze: 'congelar',
    paralyze: 'paralizar',
    poison: 'envenenar',
    confuse: 'confundir',
    flinch: 'hacer retroceder',
  }

  const exactTranslations = {
    'Inflicts regular damage.': 'Inflige dano normal.',
    'Has an increased chance for a critical hit.': 'Tiene una probabilidad aumentada de golpe critico.',
    'Hits through Protect and Detect.': 'Golpea a traves de Proteccion y Deteccion.',
    'Traps the target.': 'Atrapa al objetivo.',
    'Heals the user by half its max HP.': 'Recupera la mitad de los PS maximos del usuario.',
    'Restores 1/16 of the user’s max HP each turn.': 'Restaura 1/16 de los PS maximos del usuario cada turno.',
    "Restores 1/16 of the user's max HP each turn.": 'Restaura 1/16 de los PS maximos del usuario cada turno.',
    'Has double power if the user has no held item.': 'Duplica su potencia si el usuario no lleva objeto equipado.',
    'Guarantees a critical hit with the user’s next move.': 'Garantiza un golpe critico con el siguiente movimiento del usuario.',
    "Guarantees a critical hit with the user's next move.": 'Garantiza un golpe critico con el siguiente movimiento del usuario.',
    'Uses a move which depends upon the terrain.': 'Usa un movimiento distinto segun el terreno activo.',
    'Takes the target’s item.': 'Toma el objeto del objetivo.',
    "Takes the target's item.": 'Toma el objeto del objetivo.',
    'Cleanses the user of a burn, paralysis, or poison.': 'Cura al usuario de quemadura, paralisis o envenenamiento.',
    'Only works on the first turn the user is in battle and may cause the target to flinch.':
      'Solo funciona en el primer turno en combate del usuario y puede hacer retroceder al objetivo.',
  }
  if (exactTranslations[trimmed]) return exactTranslations[trimmed]

  let match = trimmed.match(/^Raises the user[’']s (.+?) by (one|two|three|four|five|six) stages?\.$/i)
  if (match) {
    return `Aumenta ${translateStatSequenceToSpanish(match[1])} del usuario en ${translateStageLabelToSpanish(match[2])}.`
  }

  match = trimmed.match(/^Lowers the target[’']s (.+?) by (one|two|three|four|five|six) stages?\.$/i)
  if (match) {
    return `Reduce ${translateStatSequenceToSpanish(match[1])} del objetivo en ${translateStageLabelToSpanish(match[2])}.`
  }

  match = trimmed.match(/^Lowers the user[’']s (.+?) by (one|two|three|four|five|six) stages? after inflicting damage\.$/i)
  if (match) {
    return `Tras infligir dano, reduce ${translateStatSequenceToSpanish(match[1])} del usuario en ${translateStageLabelToSpanish(match[2])}.`
  }

  match = trimmed.match(
    /^Has a (\d+)% chance to lower the target[’']s (.+?) by (one|two|three|four|five|six) stages?\.$/i,
  )
  if (match) {
    return `Tiene un ${match[1]}% de probabilidad de reducir ${translateStatSequenceToSpanish(match[2])} del objetivo en ${translateStageLabelToSpanish(match[3])}.`
  }

  match = trimmed.match(
    /^Has a (\d+)% chance to raise the user[’']s (.+?) by (one|two|three|four|five|six) stages?\.$/i,
  )
  if (match) {
    return `Tiene un ${match[1]}% de probabilidad de aumentar ${translateStatSequenceToSpanish(match[2])} del usuario en ${translateStageLabelToSpanish(match[3])}.`
  }

  match = trimmed.match(/^Has a chance to lower the target[’']s (.+?) by (one|two|three|four|five|six) stages?\.$/i)
  if (match) {
    return `Puede reducir ${translateStatSequenceToSpanish(match[1])} del objetivo en ${translateStageLabelToSpanish(match[2])}.`
  }

  match = trimmed.match(/^Has a (\d+)% chance to ([a-z-]+) the target\.$/i)
  if (match) {
    return `Tiene un ${match[1]}% de probabilidad de ${statusVerbLabelsEs[match[2].toLowerCase()] ?? match[2]} al objetivo.`
  }

  match = trimmed.match(/^Drains half the damage inflicted to heal the user\.$/i)
  if (match) {
    return 'Restaura al usuario la mitad del dano causado.'
  }

  match = trimmed.match(/^Prevents the target from fleeing and inflicts damage for 2-5 turns\.$/i)
  if (match) {
    return 'Impide que el objetivo huya y le causa dano durante 2 a 5 turnos.'
  }

  match = trimmed.match(/^Raises one of a friendly Pokémon[’']s stats at random by two stages\.$/i)
  if (match) {
    return 'Aumenta al azar una estadistica de un Pokemon aliado en dos niveles.'
  }

  match = trimmed.match(/^Changes the target[’']s ability to ([A-Za-z -]+)\.$/i)
  if (match) {
    return `Cambia la habilidad del objetivo a ${match[1]}.`
  }

  match = trimmed.match(/^Heals the user by the target[’']s current Attack stat and lowers the target[’']s Attack by one stage\.$/i)
  if (match) {
    return 'Cura al usuario segun el Ataque actual del objetivo y reduce el Ataque del objetivo en un nivel.'
  }

  match = trimmed.match(/^Power increases against targets with more HP remaining, up to a maximum of 121 power\.$/i)
  if (match) {
    return 'Su potencia aumenta cuanto mas PS le queden al objetivo, hasta un maximo de 121.'
  }

  match = trimmed.match(/^Forced to use this move for several turns\.$/i)
  if (match) {
    return 'Obliga al usuario a repetir este movimiento durante varios turnos.'
  }

  match = trimmed.match(/^Pokémon cannot fall asleep in that time\.$/i)
  if (match) {
    return 'Durante ese tiempo, ningun Pokemon puede dormirse.'
  }

  match = trimmed.match(/^Changes the target[’']s type to ([A-Za-z-]+)\.$/i)
  if (match) {
    return `Cambia el tipo del objetivo a ${translateTypeLabelToSpanish(match[1])}.`
  }

  match = trimmed.match(/^Turns the entire field into (.+?) for 5 turns\.$/i)
  if (match) {
    return `Activa ${translateTerrainLabelToSpanish(match[1])} durante 5 turnos.`
  }

  match = trimmed.match(/^Prevents any priority moves from hitting friendly Pokémon this turn\.$/i)
  if (match) {
    return 'Evita que los movimientos con prioridad golpeen a los aliados del usuario durante este turno.'
  }

  return trimmed
}

function translateEnglishMoveTextToSpanish(value) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized
    .split(/(?<=\.)\s+/)
    .map((sentence) => translateMoveSentenceToSpanish(sentence))
    .join(' ')
}

function localizedMoveOverride(override, locale) {
  if (!override) return null
  return {
    id: override.id,
    name: locale === 'es' ? override.nameEs : override.nameEn,
    shortEffect: locale === 'es' ? override.shortEffectEs : override.shortEffectEn,
    effect: locale === 'es' ? override.effectEs : override.effectEn,
  }
}

function resolveMoveText(move, descriptionOverride, locale, variant) {
  const fromApi =
    locale === 'es'
      ? resolveLocalizedEffectText(move.effect_entries, locale, variant, move.effect_chance)
      : resolveEffectText(move.effect_entries, locale, variant, move.effect_chance)
  if (fromApi) return fromApi

  const localizedOverride = localizedMoveOverride(descriptionOverride, locale)
  const fromOverride = variant === 'short' ? localizedOverride?.shortEffect ?? '' : localizedOverride?.effect ?? ''
  if (fromOverride) return fromOverride

  const fallback = resolveEffectText(move.effect_entries, 'en', variant, move.effect_chance)
  return locale === 'es' ? translateEnglishMoveTextToSpanish(fallback) : fallback
}

function resolveLocalizedEffectText(entries, locale, variant, effectChance) {
  const lang = locale === 'es' ? 'es' : 'en'
  const localized = entries.find((entry) => entry.language.name === lang)
  if (!localized) return ''
  const key = variant === 'short' ? 'short_effect' : 'effect'
  const raw = localized?.[key]?.trim() || ''
  const withChance =
    effectChance == null ? raw : raw.replace(/\$effect_chance|\{effect_chance\}/g, String(effectChance))
  return normalizeText(withChance)
}

function resolveItemFlavorText(entries, locale) {
  const lang = locale === 'es' ? 'es' : 'en'
  return normalizeText(
    entries.find((entry) => entry.language.name === lang)?.text ??
      entries.find((entry) => entry.language.name === 'en')?.text ??
      '',
  )
}

function resolveItemDescriptionFallback(itemId, locale) {
  const entry = ITEM_DESCRIPTION_FALLBACKS[itemId]
  if (!entry) return ''
  return locale === 'es' ? entry.es : entry.en
}

function isExcludedItemSlug(itemSlug) {
  return itemSlug.startsWith('dynamax-crystal-')
}

function isExcludedItemCategory(category) {
  return category === 'all-machines' || category === 'tm-materials'
}

function describeVariant(variantId, speciesSlug, locale) {
  const suffixRaw = variantId.startsWith(`${speciesSlug}-`) ? variantId.slice(speciesSlug.length + 1) : variantId
  const normalized = suffixRaw.toLowerCase()
  const tokens = normalized.split('-').filter(Boolean)
  const fallbackLabel = titleFromSlug(suffixRaw)

  if (tokens.includes('mega')) {
    const extra = tokens.filter((token) => token !== 'mega').join(' ')
    return {
      label: extra ? `Mega ${extra.toUpperCase()}` : 'Mega',
      kind: 'mega',
    }
  }

  if (tokens.includes('gmax')) {
    return {
      label: locale === 'es' ? 'Gigamax' : 'Gmax',
      kind: 'gmax',
    }
  }

  const regionMap = {
    alola: { es: 'Alola', en: 'Alola' },
    galar: { es: 'Galar', en: 'Galar' },
    hisui: { es: 'Hisui', en: 'Hisui' },
    paldea: { es: 'Paldea', en: 'Paldea' },
  }
  const regionToken = tokens.find((token) => regionMap[token])
  if (regionToken) {
    const region = locale === 'es' ? regionMap[regionToken].es : regionMap[regionToken].en
    const extra = tokens
      .filter((token) => token !== regionToken)
      .map((token) => titleFromSlug(token))
      .join(' ')
    return {
      label: extra ? `${region} ${extra}` : region,
      kind: 'regional',
    }
  }

  if (tokens.includes('totem')) return { label: locale === 'es' ? 'Totem' : 'Totem', kind: 'totem' }
  if (tokens.includes('primal')) return { label: locale === 'es' ? 'Primigenio' : 'Primal', kind: 'primal' }

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

function extractVariants(species, locale) {
  const baseSlug = species.name
  const baseName = resolveLocalizedName(species.names, locale, baseSlug)
  return (species.varieties ?? [])
    .filter((entry) => !entry.is_default)
    .map((entry) => entry.pokemon.name)
    .sort()
    .map((variantId) => {
      const descriptor = describeVariant(variantId, baseSlug, locale)
      return {
        id: variantId,
        name: `${baseName} ${descriptor.label}`.trim(),
        kind: descriptor.kind,
      }
    })
}

function extractLearnsetMoves(pokemon) {
  const moveEntries = Array.isArray(pokemon) ? pokemon : pokemon.moves
  const filtered = new Set()
  const anyMethod = new Set()

  for (const entry of moveEntries) {
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

  return filtered.size > 0 ? [...filtered] : [...anyMethod]
}

function flattenEvolutionSpeciesNames(chain) {
  if (!chain?.species?.name) return []
  const names = [chain.species.name]
  for (const branch of chain.evolves_to ?? []) {
    names.push(...flattenEvolutionSpeciesNames(branch))
  }
  return names
}

function findEvolutionPathToSpecies(chain, targetSpeciesName, path = []) {
  if (!chain?.species?.name) return null
  const nextPath = [...path, chain.species.name]
  if (chain.species.name === targetSpeciesName) return nextPath
  for (const branch of chain.evolves_to ?? []) {
    const found = findEvolutionPathToSpecies(branch, targetSpeciesName, nextPath)
    if (found) return found
  }
  return null
}

function resolvePreEvolutionSpeciesNames(species, speciesByName) {
  const chain = []
  let current = species
  const seen = new Set()

  while (current?.evolves_from_species?.name) {
    const previousName = current.evolves_from_species.name
    if (!previousName || seen.has(previousName)) break
    seen.add(previousName)
    chain.unshift(previousName)
    current = speciesByName.get(previousName) ?? null
  }

  return chain
}

const FAMILY_CHAIN_POKEMON_ID_OVERRIDES = {
  'rattata-alola': {
    evolutionChain: ['rattata-alola', 'raticate-alola'],
    preEvolutionChain: [],
  },
  'raticate-alola': {
    evolutionChain: ['rattata-alola', 'raticate-alola'],
    preEvolutionChain: ['rattata-alola'],
  },
  'raticate-totem-alola': {
    evolutionChain: ['rattata-alola', 'raticate-alola', 'raticate-totem-alola'],
    preEvolutionChain: ['rattata-alola', 'raticate-alola'],
  },
  'raichu-alola': {
    evolutionChain: ['pichu', 'pikachu', 'raichu-alola'],
    preEvolutionChain: ['pichu', 'pikachu'],
  },
  'sandshrew-alola': {
    evolutionChain: ['sandshrew-alola', 'sandslash-alola'],
    preEvolutionChain: [],
  },
  'sandslash-alola': {
    evolutionChain: ['sandshrew-alola', 'sandslash-alola'],
    preEvolutionChain: ['sandshrew-alola'],
  },
  'vulpix-alola': {
    evolutionChain: ['vulpix-alola', 'ninetales-alola'],
    preEvolutionChain: [],
  },
  'ninetales-alola': {
    evolutionChain: ['vulpix-alola', 'ninetales-alola'],
    preEvolutionChain: ['vulpix-alola'],
  },
  'diglett-alola': {
    evolutionChain: ['diglett-alola', 'dugtrio-alola'],
    preEvolutionChain: [],
  },
  'dugtrio-alola': {
    evolutionChain: ['diglett-alola', 'dugtrio-alola'],
    preEvolutionChain: ['diglett-alola'],
  },
  'meowth-alola': {
    evolutionChain: ['meowth-alola', 'persian-alola'],
    preEvolutionChain: [],
  },
  'persian-alola': {
    evolutionChain: ['meowth-alola', 'persian-alola'],
    preEvolutionChain: ['meowth-alola'],
  },
  'sneasel-hisui': {
    evolutionChain: ['sneasel-hisui', 'sneasler'],
    preEvolutionChain: [],
  },
  sneasler: {
    evolutionChain: ['sneasel-hisui', 'sneasler'],
    preEvolutionChain: ['sneasel-hisui'],
  },
  'qwilfish-hisui': {
    evolutionChain: ['qwilfish-hisui', 'overqwil'],
    preEvolutionChain: [],
  },
  overqwil: {
    evolutionChain: ['qwilfish-hisui', 'overqwil'],
    preEvolutionChain: ['qwilfish-hisui'],
  },
  'wooper-paldea': {
    evolutionChain: ['wooper-paldea', 'clodsire'],
    preEvolutionChain: [],
  },
  clodsire: {
    evolutionChain: ['wooper-paldea', 'clodsire'],
    preEvolutionChain: ['wooper-paldea'],
  },
  'farfetchd-galar': {
    evolutionChain: ['farfetchd-galar', 'sirfetchd'],
    preEvolutionChain: [],
  },
  sirfetchd: {
    evolutionChain: ['farfetchd-galar', 'sirfetchd'],
    preEvolutionChain: ['farfetchd-galar'],
  },
  'meowth-galar': {
    evolutionChain: ['meowth-galar', 'perrserker'],
    preEvolutionChain: [],
  },
  perrserker: {
    evolutionChain: ['meowth-galar', 'perrserker'],
    preEvolutionChain: ['meowth-galar'],
  },
  'growlithe-hisui': {
    evolutionChain: ['growlithe-hisui', 'arcanine-hisui'],
    preEvolutionChain: [],
  },
  'arcanine-hisui': {
    evolutionChain: ['growlithe-hisui', 'arcanine-hisui'],
    preEvolutionChain: ['growlithe-hisui'],
  },
  'geodude-alola': {
    evolutionChain: ['geodude-alola', 'graveler-alola', 'golem-alola'],
    preEvolutionChain: [],
  },
  'graveler-alola': {
    evolutionChain: ['geodude-alola', 'graveler-alola', 'golem-alola'],
    preEvolutionChain: ['geodude-alola'],
  },
  'golem-alola': {
    evolutionChain: ['geodude-alola', 'graveler-alola', 'golem-alola'],
    preEvolutionChain: ['geodude-alola', 'graveler-alola'],
  },
  'ponyta-galar': {
    evolutionChain: ['ponyta-galar', 'rapidash-galar'],
    preEvolutionChain: [],
  },
  'rapidash-galar': {
    evolutionChain: ['ponyta-galar', 'rapidash-galar'],
    preEvolutionChain: ['ponyta-galar'],
  },
  'grimer-alola': {
    evolutionChain: ['grimer-alola', 'muk-alola'],
    preEvolutionChain: [],
  },
  'muk-alola': {
    evolutionChain: ['grimer-alola', 'muk-alola'],
    preEvolutionChain: ['grimer-alola'],
  },
  'voltorb-hisui': {
    evolutionChain: ['voltorb-hisui', 'electrode-hisui'],
    preEvolutionChain: [],
  },
  'electrode-hisui': {
    evolutionChain: ['voltorb-hisui', 'electrode-hisui'],
    preEvolutionChain: ['voltorb-hisui'],
  },
  'exeggutor-alola': {
    evolutionChain: ['exeggcute', 'exeggutor-alola'],
    preEvolutionChain: ['exeggcute'],
  },
  'marowak-alola': {
    evolutionChain: ['cubone', 'marowak-alola'],
    preEvolutionChain: ['cubone'],
  },
  'weezing-galar': {
    evolutionChain: ['koffing', 'weezing-galar'],
    preEvolutionChain: ['koffing'],
  },
  'zigzagoon-galar': {
    evolutionChain: ['zigzagoon-galar', 'linoone-galar', 'obstagoon'],
    preEvolutionChain: [],
  },
  'linoone-galar': {
    evolutionChain: ['zigzagoon-galar', 'linoone-galar', 'obstagoon'],
    preEvolutionChain: ['zigzagoon-galar'],
  },
  obstagoon: {
    evolutionChain: ['zigzagoon-galar', 'linoone-galar', 'obstagoon'],
    preEvolutionChain: ['zigzagoon-galar', 'linoone-galar'],
  },
  'corsola-galar': {
    evolutionChain: ['corsola-galar', 'cursola'],
    preEvolutionChain: [],
  },
  cursola: {
    evolutionChain: ['corsola-galar', 'cursola'],
    preEvolutionChain: ['corsola-galar'],
  },
  'yamask-galar': {
    evolutionChain: ['yamask-galar', 'runerigus'],
    preEvolutionChain: [],
  },
  runerigus: {
    evolutionChain: ['yamask-galar', 'runerigus'],
    preEvolutionChain: ['yamask-galar'],
  },
  'mr-mime-galar': {
    evolutionChain: ['mime-jr', 'mr-mime-galar', 'mr-rime'],
    preEvolutionChain: ['mime-jr'],
  },
  'mr-rime': {
    evolutionChain: ['mime-jr', 'mr-mime-galar', 'mr-rime'],
    preEvolutionChain: ['mime-jr', 'mr-mime-galar'],
  },
  'darumaka-galar': {
    evolutionChain: ['darumaka-galar', 'darmanitan-galar-standard'],
    preEvolutionChain: [],
  },
  'darmanitan-galar-standard': {
    evolutionChain: ['darumaka-galar', 'darmanitan-galar-standard'],
    preEvolutionChain: ['darumaka-galar'],
  },
  'darmanitan-galar-zen': {
    evolutionChain: ['darumaka-galar', 'darmanitan-galar-standard', 'darmanitan-galar-zen'],
    preEvolutionChain: ['darumaka-galar', 'darmanitan-galar-standard'],
  },
  'slowpoke-galar': {
    evolutionChain: ['slowpoke-galar', 'slowbro-galar', 'slowking-galar'],
    preEvolutionChain: [],
  },
  'slowbro-galar': {
    evolutionChain: ['slowpoke-galar', 'slowbro-galar', 'slowking-galar'],
    preEvolutionChain: ['slowpoke-galar'],
  },
  'slowking-galar': {
    evolutionChain: ['slowpoke-galar', 'slowbro-galar', 'slowking-galar'],
    preEvolutionChain: ['slowpoke-galar'],
  },
  'typhlosion-hisui': {
    evolutionChain: ['cyndaquil', 'quilava', 'typhlosion-hisui'],
    preEvolutionChain: ['cyndaquil', 'quilava'],
  },
  'samurott-hisui': {
    evolutionChain: ['oshawott', 'dewott', 'samurott-hisui'],
    preEvolutionChain: ['oshawott', 'dewott'],
  },
  'lilligant-hisui': {
    evolutionChain: ['petilil', 'lilligant-hisui'],
    preEvolutionChain: ['petilil'],
  },
  'zorua-hisui': {
    evolutionChain: ['zorua-hisui', 'zoroark-hisui'],
    preEvolutionChain: [],
  },
  'zoroark-hisui': {
    evolutionChain: ['zorua-hisui', 'zoroark-hisui'],
    preEvolutionChain: ['zorua-hisui'],
  },
  'braviary-hisui': {
    evolutionChain: ['rufflet', 'braviary-hisui'],
    preEvolutionChain: ['rufflet'],
  },
  'sliggoo-hisui': {
    evolutionChain: ['goomy', 'sliggoo-hisui', 'goodra-hisui'],
    preEvolutionChain: ['goomy'],
  },
  'goodra-hisui': {
    evolutionChain: ['goomy', 'sliggoo-hisui', 'goodra-hisui'],
    preEvolutionChain: ['goomy', 'sliggoo-hisui'],
  },
  'avalugg-hisui': {
    evolutionChain: ['bergmite', 'avalugg-hisui'],
    preEvolutionChain: ['bergmite'],
  },
  'decidueye-hisui': {
    evolutionChain: ['rowlet', 'dartrix', 'decidueye-hisui'],
    preEvolutionChain: ['rowlet', 'dartrix'],
  },
  'basculegion-male': {
    evolutionChain: ['basculin-white-striped', 'basculegion-male'],
    preEvolutionChain: ['basculin-white-striped'],
  },
  'basculegion-female': {
    evolutionChain: ['basculin-white-striped', 'basculegion-female'],
    preEvolutionChain: ['basculin-white-striped'],
  },
}

async function fetchJson(pathOrUrl, attempt = 1) {
  const url = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
    ? pathOrUrl
    : `${API_BASE_URL}/${pathOrUrl.replace(/^\/+/, '')}`

  if (!requestCache.has(url)) {
    requestCache.set(
      url,
      (async () => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Request failed (${response.status}) for ${url}`)
        }
        return response.json()
      })().catch(async (error) => {
        requestCache.delete(url)
        if (attempt >= 3) throw error
        await new Promise((resolve) => setTimeout(resolve, attempt * 400))
        return fetchJson(url, attempt + 1)
      }),
    )
  }

  return requestCache.get(url)
}

async function mapWithConcurrency(items, limit, mapper) {
  const safeLimit = Math.max(1, Math.floor(limit))
  const results = new Array(items.length)
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

async function loadAllNamedResources(resource) {
  const firstPage = await fetchJson(`${resource}?limit=1&offset=0`)
  const count = Number(firstPage.count ?? 0)
  const page = await fetchJson(`${resource}?limit=${Math.max(1, count)}&offset=0`)
  return page.results ?? []
}

function moveEntryFromRaw(move, descriptionOverride, locale) {
  if (!isPokemonType(move.type.name)) return null
  const shortEffect = resolveMoveText(move, descriptionOverride, locale, 'short')
  const longEffect = resolveMoveText(move, descriptionOverride, locale, 'long')
  return {
    id: move.name,
    name: resolveLocalizedName(move.names, locale, move.name),
    type: move.type.name,
    category: move.damage_class.name,
    power: move.power ?? 0,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    tags: [move.target.name, move.meta?.category?.name, move.meta?.ailment?.name].filter(Boolean),
    description: shortEffect,
    effect: longEffect || shortEffect,
  }
}

function parseShowdownAbilitiesSource(source) {
  const sandbox = { exports: {} }
  vm.runInNewContext(source, sandbox, { timeout: 2000 })
  return sandbox.exports.BattleAbilities ?? {}
}

function parseShowdownItemsSource(source) {
  const sandbox = { exports: {} }
  vm.runInNewContext(source, sandbox, { timeout: 2000 })
  return sandbox.exports.BattleItems ?? {}
}

async function loadShowdownOverlay() {
  console.log('Fetching Showdown overlay...')
  const [pokedex, abilitiesSource, itemsSource] = await Promise.all([
    fetch(SHOWDOWN_POKEDEX_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Request failed (${response.status}) for ${SHOWDOWN_POKEDEX_URL}`)
      return response.json()
    }),
    fetch(SHOWDOWN_ABILITIES_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Request failed (${response.status}) for ${SHOWDOWN_ABILITIES_URL}`)
      return response.text()
    }),
    fetch(SHOWDOWN_ITEMS_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Request failed (${response.status}) for ${SHOWDOWN_ITEMS_URL}`)
      return response.text()
    }),
  ])

  return {
    pokedex,
    abilities: parseShowdownAbilitiesSource(abilitiesSource),
    items: parseShowdownItemsSource(itemsSource),
  }
}

function resolveBasePokemonForSpecies(species, pokemonByName) {
  const defaultId = species.varieties?.find((entry) => entry.is_default)?.pokemon?.name ?? species.name
  return pokemonByName.get(defaultId) ?? null
}

function buildShowdownAbilityEntries(entry) {
  if (!entry?.abilities) return []

  return Object.entries(entry.abilities)
    .map(([slotKey, abilityName]) => {
      const id = normalizeAbilityId(abilityName)
      if (!id) return null

      const slot = Number(slotKey)
      return {
        slot: Number.isFinite(slot) ? slot : slotKey === 'H' ? 99 : 0,
        is_hidden: slotKey === 'H' || slotKey === 'S',
        ability: { name: id },
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.slot - b.slot)
}

function buildOverrideAbilityEntries(formOverride) {
  if (!formOverride?.abilityIds?.length) return []
  return formOverride.abilityIds.map((abilityId, index) => ({
    slot: index,
    is_hidden: false,
    ability: { name: abilityId },
  }))
}

function resolveEffectivePokemonData(pokemon, species, pokemonByName, showdownOverlay, championsFormOverrides) {
  const showdownEntry = showdownOverlay.pokedex[toShowdownId(pokemon.name)] ?? null
  const basePokemon = resolveBasePokemonForSpecies(species, pokemonByName)
  const formOverride = championsFormOverrides.entriesByFormId[pokemon.name] ?? null

  const moveEntries =
    Array.isArray(pokemon.moves) && pokemon.moves.length > 0
      ? pokemon.moves
      : basePokemon?.moves ?? []

  const abilityEntries =
    formOverride?.abilityIds?.length
      ? buildOverrideAbilityEntries(formOverride)
      : Array.isArray(pokemon.abilities) && pokemon.abilities.length > 0
      ? pokemon.abilities
      : buildShowdownAbilityEntries(showdownEntry)

  const typesFromPokeApi = pokemon.types
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => entry.type.name)
    .filter(isPokemonType)

  const typesFromShowdown = (showdownEntry?.types ?? [])
    .map((type) => String(type).toLowerCase())
    .filter(isPokemonType)

  const types = typesFromPokeApi.length > 0 ? typesFromPokeApi : typesFromShowdown
  const stats = pokemon.stats?.length
    ? {
        hp: statValue(pokemon.stats, 'hp'),
        atk: statValue(pokemon.stats, 'attack'),
        def: statValue(pokemon.stats, 'defense'),
        spa: statValue(pokemon.stats, 'special-attack'),
        spd: statValue(pokemon.stats, 'special-defense'),
        spe: statValue(pokemon.stats, 'speed'),
      }
    : {
        hp: showdownEntry?.baseStats?.hp ?? 0,
        atk: showdownEntry?.baseStats?.atk ?? 0,
        def: showdownEntry?.baseStats?.def ?? 0,
        spa: showdownEntry?.baseStats?.spa ?? 0,
        spd: showdownEntry?.baseStats?.spd ?? 0,
        spe: showdownEntry?.baseStats?.spe ?? 0,
      }

  const showdownSpriteUrl = pokemon.name ? `https://play.pokemonshowdown.com/sprites/ani/${pokemon.name}.gif` : null
  const officialArtwork = pokemon.sprites.other?.['official-artwork']?.front_default ?? null
  const showdownSprite = pokemon.sprites.other?.showdown?.front_default ?? showdownSpriteUrl
  const defaultSprite = pokemon.sprites.front_default ?? showdownSprite ?? officialArtwork
  const homeSprite = pokemon.sprites.other?.home?.front_default ?? officialArtwork ?? showdownSprite ?? defaultSprite
  const requiredItemId = normalizeItemId(showdownEntry?.requiredItem ?? '')

  return {
    moveEntries,
    abilityEntries,
    types: types.length > 0 ? types : ['normal'],
    stats,
    requiredItemId: requiredItemId || null,
    sprites: {
      home: homeSprite ?? null,
      officialArtwork,
      showdown: showdownSprite ?? null,
      default: defaultSprite ?? null,
    },
  }
}

function itemEntryFromRaw(item, locale) {
  if (isExcludedItemSlug(item.name) || isExcludedItemCategory(item.category.name)) return null
  const shortEffect = resolveEffectText(item.effect_entries, locale, 'short')
  const longEffect = resolveEffectText(item.effect_entries, locale, 'long')
  const flavorText = resolveItemFlavorText(item.flavor_text_entries, locale)
  const fallbackDescription = resolveItemDescriptionFallback(item.name, locale)
  const description = shortEffect || flavorText || fallbackDescription
  return {
    id: item.name,
    name: resolveLocalizedName(item.names, locale, item.name),
    tags: [item.category.name, item.fling_power ? `fling-${item.fling_power}` : ''].filter(Boolean),
    description,
    effect: longEffect || description || fallbackDescription,
    icon:
      item.sprites?.default ??
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.name}.png`,
    category: item.category.name,
    flingPower: item.fling_power,
  }
}

function abilityEntryFromRaw(ability, locale) {
  return {
    id: ability.name,
    name: resolveLocalizedName(ability.names, locale, ability.name),
    shortEffect: resolveEffectText(ability.effect_entries, locale, 'short'),
    effect: resolveEffectText(ability.effect_entries, locale, 'long'),
  }
}

function abilityEntryFromShowdown(abilityId, ability, locale) {
  const resolvedName = ability?.name || titleFromSlug(abilityId)
  const shortEffect = normalizeText(ability?.shortDesc ?? ability?.desc ?? '')
  const effect = normalizeText(ability?.desc ?? ability?.shortDesc ?? '')
  return {
    id: abilityId,
    name: locale === 'es' ? resolvedName : resolvedName,
    shortEffect,
    effect,
  }
}

function localizedAbilityOverride(override, locale) {
  if (!override) return null
  return {
    id: override.id,
    name: locale === 'es' ? override.nameEs : override.nameEn,
    shortEffect: locale === 'es' ? override.shortEffectEs : override.shortEffectEn,
    effect: locale === 'es' ? override.effectEs : override.effectEn,
  }
}

function resolveAbilityText(rawAbility, descriptionOverride, locale, variant) {
  const fromApi =
    locale === 'es'
      ? rawAbility
        ? resolveLocalizedEffectText(rawAbility.effect_entries, locale, variant)
        : ''
      : rawAbility
        ? resolveEffectText(rawAbility.effect_entries, locale, variant)
        : ''
  if (fromApi) return fromApi
  const localizedOverride = localizedAbilityOverride(descriptionOverride, locale)
  return variant === 'short'
    ? localizedOverride?.shortEffect ?? ''
    : localizedOverride?.effect ?? ''
}

function resolveAbilityEntry(abilityId, rawAbility, championsOverride, descriptionOverride, showdownAbility, locale) {
  const localizedChampionsOverride = localizedAbilityOverride(championsOverride, locale)
  const localizedDescriptionOverride = localizedAbilityOverride(descriptionOverride, locale)

  return {
    id: abilityId,
    name: rawAbility
      ? resolveLocalizedName(rawAbility.names, locale, abilityId)
      : localizedChampionsOverride?.name ||
        localizedDescriptionOverride?.name ||
        showdownAbility?.name ||
        titleFromSlug(abilityId),
    shortEffect:
      resolveAbilityText(rawAbility, descriptionOverride, locale, 'short') ||
      localizedChampionsOverride?.shortEffect ||
      abilityEntryFromShowdown(abilityId, showdownAbility, locale).shortEffect,
    effect:
      resolveAbilityText(rawAbility, descriptionOverride, locale, 'long') ||
      localizedChampionsOverride?.effect ||
      abilityEntryFromShowdown(abilityId, showdownAbility, locale).effect,
  }
}

function itemEntryFromShowdown(itemId, item, locale) {
  const normalizedId = normalizeItemId(item?.name || itemId)
  if (!normalizedId) return null
  const category = item?.megaStone ? 'mega-stone' : 'showdown-overlay'
  const localizedMegaStone = localizeMegaStoneFromShowdown(item, locale)
  const resolvedName = localizedMegaStone?.name || item?.name || titleFromSlug(normalizedId)
  const description = normalizeText(
    localizedMegaStone?.description ?? item?.shortDesc ?? item?.desc ?? '',
  )
  const effect = normalizeText(localizedMegaStone?.effect ?? item?.desc ?? item?.shortDesc ?? '')
  return {
    id: normalizedId,
    name: locale === 'es' ? resolvedName : resolvedName,
    tags: [category, item?.fling?.basePower ? `fling-${item.fling.basePower}` : ''].filter(Boolean),
    description,
    effect: effect || description,
    icon: `https://play.pokemonshowdown.com/sprites/itemicons/${toShowdownId(item?.name || itemId)}.png`,
    category,
    flingPower: item?.fling?.basePower ?? null,
  }
}

function localizeMegaStoneFromShowdown(item, locale) {
  if (!item?.megaStone || locale !== 'es') return null

  const itemUsers = Array.isArray(item.itemUser) ? item.itemUser : []
  const rawBaseName = itemUsers[0] || Object.keys(item.megaStone)[0] || ''
  const baseName = titleFromSlug(normalizeItemId(rawBaseName))
  const stoneBaseName = baseName.endsWith('e') ? baseName.slice(0, -1) : baseName
  const megaTarget = Object.values(item.megaStone)[0]
  const megaSuffix = String(megaTarget ?? '')
    .split('-')
    .slice(2)
    .map((part) => titleFromSlug(part))
    .join(' ')

  const name = megaSuffix ? `${stoneBaseName}ita ${megaSuffix}` : `${stoneBaseName}ita`
  return {
    name,
    description: `Si lo lleva ${baseName}, puede megaevolucionar en combate.`,
    effect: `Si lo lleva ${baseName}, puede megaevolucionar en combate.`,
  }
}

function pokemonEntryFromRaw(pokemon, species, effectiveData) {
  const learnsetMoves = extractLearnsetMoves(effectiveData.moveEntries)
  const defaultItems = defaultSuggestedItems(effectiveData.types)
  const suggestedItems = effectiveData.requiredItemId
    ? [effectiveData.requiredItemId, ...defaultItems.filter((itemId) => itemId !== effectiveData.requiredItemId)]
    : defaultItems
  return {
    id: pokemon.name,
    name: resolveLocalizedName(species.names, 'en', pokemon.name),
    pokedexNumber: species.id,
    types: effectiveData.types,
    evolutionChain: [],
    preEvolutionChain: [],
    abilities: effectiveData.abilityEntries
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.ability.name),
    requiredItemId: effectiveData.requiredItemId ?? undefined,
    suggestedItems,
    suggestedMoves: learnsetMoves.slice(0, 8),
    learnsetMoves,
    defaultNature: inferNature(
      pokemon.stats?.length
        ? pokemon.stats
        : [
            { stat: { name: 'hp' }, base_stat: effectiveData.stats.hp },
            { stat: { name: 'attack' }, base_stat: effectiveData.stats.atk },
            { stat: { name: 'defense' }, base_stat: effectiveData.stats.def },
            { stat: { name: 'special-attack' }, base_stat: effectiveData.stats.spa },
            { stat: { name: 'special-defense' }, base_stat: effectiveData.stats.spd },
            { stat: { name: 'speed' }, base_stat: effectiveData.stats.spe },
          ],
    ),
    baseStats: effectiveData.stats,
    heightMeters: typeof pokemon.height === 'number' && Number.isFinite(pokemon.height) ? pokemon.height / 10 : undefined,
    weightKg: typeof pokemon.weight === 'number' && Number.isFinite(pokemon.weight) ? pokemon.weight / 10 : undefined,
    roleTags: inferRoleTags(
      pokemon.stats?.length
        ? pokemon
        : {
            stats: [
              { stat: { name: 'hp' }, base_stat: effectiveData.stats.hp },
              { stat: { name: 'attack' }, base_stat: effectiveData.stats.atk },
              { stat: { name: 'defense' }, base_stat: effectiveData.stats.def },
              { stat: { name: 'special-attack' }, base_stat: effectiveData.stats.spa },
              { stat: { name: 'special-defense' }, base_stat: effectiveData.stats.spd },
              { stat: { name: 'speed' }, base_stat: effectiveData.stats.spe },
            ],
          },
    ),
  }
}

function buildMoveDetails(moveEntries, moveByName, locale) {
  const metadataByMove = new Map()

  for (const entry of moveEntries) {
    if (!metadataByMove.has(entry.move.name)) {
      metadataByMove.set(entry.move.name, {
        versionGroups: new Set(),
        learnMethods: new Set(),
        minLevel: null,
      })
    }
    const metadata = metadataByMove.get(entry.move.name)
    for (const detail of entry.version_group_details) {
      metadata.versionGroups.add(detail.version_group.name)
      metadata.learnMethods.add(detail.move_learn_method.name)
      if (detail.level_learned_at > 0) {
        metadata.minLevel =
          metadata.minLevel == null ? detail.level_learned_at : Math.min(metadata.minLevel, detail.level_learned_at)
      }
    }
  }

  const uniqueMoves = moveEntries
    .map((entry) => entry.move.name)
    .filter((moveId, index, list) => list.indexOf(moveId) === index)

  return uniqueMoves
    .map((moveId) => {
      const move = moveByName.get(moveId)
      if (!move || !isPokemonType(move.type.name)) return null
      const metadata = metadataByMove.get(moveId)
      return {
        id: moveId,
        name: resolveLocalizedName(move.names, locale, moveId),
        category: move.damage_class.name,
        type: move.type.name,
        versionGroups: [...metadata.versionGroups].sort(),
        learnMethods: [...metadata.learnMethods].sort(),
        minLevel: metadata.minLevel ?? null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, locale === 'es' ? 'es' : 'en'))
}

function chunkItems(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function resolveGameAvailability(species) {
  const pokedexes = new Set((species.pokedex_numbers ?? []).map((entry) => entry.pokedex?.name).filter(Boolean))
  return Object.entries(GAME_AVAILABILITY_VERSION_GROUPS)
    .filter(([, supportedPokedexes]) => [...supportedPokedexes].some((pokedex) => pokedexes.has(pokedex)))
    .map(([filterKey]) => filterKey)
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true })

  console.log('Fetching resource indexes from PokeAPI...')
  const [pokemonResources, moveResources, itemResources] = await Promise.all([
    loadAllNamedResources('pokemon'),
    loadAllNamedResources('move'),
    loadAllNamedResources('item'),
  ])

  console.log(`Pokemon resources: ${pokemonResources.length}`)
  console.log(`Move resources: ${moveResources.length}`)
  console.log(`Item resources: ${itemResources.length}`)

  console.log('Fetching pokemon payloads...')
  const pokemonRaw = await mapWithConcurrency(pokemonResources, 16, async (resource) => fetchJson(resource.url))
  console.log('Fetching species payloads...')
  const speciesRaw = await mapWithConcurrency(
    pokemonRaw,
    16,
    async (pokemon) => fetchJson(pokemon.species.url),
  )
  console.log('Fetching evolution chains...')
  const evolutionChainUrls = [...new Set(speciesRaw.map((species) => species.evolution_chain?.url).filter(Boolean))]
  const evolutionChainsRaw = await mapWithConcurrency(
    evolutionChainUrls,
    12,
    async (url) => fetchJson(url),
  )

  const speciesByName = new Map(speciesRaw.map((species) => [species.name, species]))
  const pokemonByName = new Map(pokemonRaw.map((pokemon) => [pokemon.name, pokemon]))
  const evolutionChainByUrl = new Map(evolutionChainsRaw.map((chain) => [chain.id ? `${API_BASE_URL}/evolution-chain/${chain.id}/` : '', chain]))
  for (let index = 0; index < evolutionChainUrls.length; index += 1) {
    evolutionChainByUrl.set(evolutionChainUrls[index], evolutionChainsRaw[index])
  }
  const showdownOverlay = await loadShowdownOverlay()
  const championsFormOverrides = await loadChampionsFormOverrides()
  const abilityDescriptionOverrides = await loadAbilityDescriptionOverrides()
  const moveDescriptionOverrides = await loadMoveDescriptionOverrides()
  const usedAbilityIds = new Set()
  const usedMoveIds = new Set()
  const usedRequiredItemIds = new Set()

  for (const pokemon of pokemonRaw) {
    const species = speciesByName.get(pokemon.species.name)
    if (!species) continue
    const effectiveData = resolveEffectivePokemonData(
      pokemon,
      species,
      pokemonByName,
      showdownOverlay,
      championsFormOverrides,
    )
    for (const ability of effectiveData.abilityEntries) usedAbilityIds.add(ability.ability.name)
    for (const move of effectiveData.moveEntries) usedMoveIds.add(move.move.name)
    if (effectiveData.requiredItemId) usedRequiredItemIds.add(effectiveData.requiredItemId)
  }

  console.log(`Fetching used abilities: ${usedAbilityIds.size}`)
  const abilityRaw = (
    await mapWithConcurrency([...usedAbilityIds], 16, async (abilityId) => {
      try {
        return await fetchJson(`ability/${abilityId}`)
      } catch {
        return null
      }
    })
  ).filter(Boolean)
  console.log(`Fetching moves: ${usedMoveIds.size}`)
  const moveRaw = await mapWithConcurrency(
    [...usedMoveIds],
    24,
    async (moveId) => fetchJson(`move/${moveId}`),
  )
  console.log('Fetching items...')
  const itemRaw = await mapWithConcurrency(itemResources, 24, async (resource) => fetchJson(resource.url))

  const moveByName = new Map(moveRaw.map((move) => [move.name, move]))
  const abilityByName = new Map(abilityRaw.map((ability) => [ability.name, ability]))
  const generatedAt = new Date().toISOString()
  const championsAvailabilityOverlay = await loadChampionsAvailabilityOverlay(generatedAt)

  console.log('Building locale snapshots...')
  for (const locale of LOCALES) {
    const formsByPokemonId = {}
    const evolutionChainByPokemonId = {}
    const preEvolutionChainByPokemonId = {}

    for (const species of speciesRaw) {
      const forms = [...new Set((species.varieties ?? []).map((entry) => entry.pokemon.name).filter(Boolean))]
      const resolved = forms.length > 0 ? forms : [species.name]
      const chain = species.evolution_chain?.url ? evolutionChainByUrl.get(species.evolution_chain.url) : null
      const speciesEvolutionChain = chain ? flattenEvolutionSpeciesNames(chain.chain) : [species.name]
      const speciesPreEvolutionChain =
        resolvePreEvolutionSpeciesNames(species, speciesByName).length > 0
          ? resolvePreEvolutionSpeciesNames(species, speciesByName)
          : chain
            ? (findEvolutionPathToSpecies(chain.chain, species.name)?.slice(0, -1) ?? [])
            : []
      const evolutionChainPokemonIds = speciesEvolutionChain
        .map((speciesName) => {
          const targetSpecies = speciesByName.get(speciesName)
          const defaultVariety = targetSpecies?.varieties?.find((entry) => entry.is_default)?.pokemon?.name
          return defaultVariety ?? speciesName
        })
        .filter(Boolean)
      const preEvolutionPokemonIds = speciesPreEvolutionChain
        .map((speciesName) => {
          const targetSpecies = speciesByName.get(speciesName)
          const defaultVariety = targetSpecies?.varieties?.find((entry) => entry.is_default)?.pokemon?.name
          return defaultVariety ?? speciesName
        })
        .filter(Boolean)
      for (const pokemonId of resolved) {
        formsByPokemonId[pokemonId] = resolved
        const chainOverride = FAMILY_CHAIN_POKEMON_ID_OVERRIDES[pokemonId] ?? null
        evolutionChainByPokemonId[pokemonId] =
          chainOverride?.evolutionChain ?? (evolutionChainPokemonIds.length > 0 ? evolutionChainPokemonIds : [pokemonId])
        preEvolutionChainByPokemonId[pokemonId] =
          chainOverride?.preEvolutionChain ?? preEvolutionPokemonIds
      }
    }

    const pokemonEntries = pokemonRaw
      .map((pokemon) => {
        const species = speciesByName.get(pokemon.species.name)
        if (!species) return null
        const effectiveData = resolveEffectivePokemonData(
          pokemon,
          species,
          pokemonByName,
          showdownOverlay,
          championsFormOverrides,
        )
        const entry = pokemonEntryFromRaw(pokemon, species, effectiveData)
        entry.name = resolveLocalizedName(species.names, locale, pokemon.name)
        entry.evolutionChain = evolutionChainByPokemonId[pokemon.name] ?? [pokemon.name]
        entry.preEvolutionChain = preEvolutionChainByPokemonId[pokemon.name] ?? []
        return entry
      })
      .filter(Boolean)
      .sort((a, b) => a.pokedexNumber - b.pokedexNumber || a.name.localeCompare(b.name, locale))

    const profileSummaries = pokemonRaw
      .map((pokemon) => {
        const species = speciesByName.get(pokemon.species.name)
        if (!species) return null
        const effectiveData = resolveEffectivePokemonData(
          pokemon,
          species,
          pokemonByName,
          showdownOverlay,
          championsFormOverrides,
        )
        const generationId = generationIdFromName(species.generation?.name)
        const chainMembers = evolutionChainByPokemonId[pokemon.name] ?? [pokemon.name]
        const evolutionChain = chainMembers
          .map((memberId) => {
            const chainPokemon = pokemonByName.get(memberId)
            const chainSpecies = chainPokemon
              ? speciesByName.get(chainPokemon.species.name)
              : speciesByName.get(memberId)
            if (!chainSpecies) return null
            return {
              id: memberId,
              name: resolveLocalizedName(chainSpecies.names, locale, memberId),
              pokedexNumber: chainSpecies.id,
              variants: extractVariants(chainSpecies, locale),
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.pokedexNumber - b.pokedexNumber)

        return {
          id: pokemon.name,
          pokedexNumber: species.id,
          name: resolveLocalizedName(species.names, locale, pokemon.name),
          genus: resolveGenus(species.genera, locale),
          flavorText: resolveFlavorText(species.flavor_text_entries, locale),
          types: effectiveData.types,
          abilities: effectiveData.abilityEntries
            .slice()
            .sort((a, b) => a.slot - b.slot)
            .map((entry) => {
              const ability = abilityByName.get(entry.ability.name)
              const abilityOverride = championsFormOverrides.abilitiesById[entry.ability.name] ?? null
              const descriptionOverride = abilityDescriptionOverrides.abilitiesById[entry.ability.name] ?? null
              const showdownAbility = showdownOverlay.abilities[toShowdownId(entry.ability.name)]
              const resolvedAbility = resolveAbilityEntry(
                entry.ability.name,
                ability,
                abilityOverride,
                descriptionOverride,
                showdownAbility,
                locale,
              )
              return {
                ...resolvedAbility,
                isHidden: entry.is_hidden,
              }
            }),
          stats: effectiveData.stats,
          heightMeters: pokemon.height / 10,
          weightKg: pokemon.weight / 10,
          baseExperience: pokemon.base_experience ?? 0,
          captureRate: species.capture_rate ?? 0,
          baseHappiness: species.base_happiness ?? 0,
          habitat: species.habitat ? titleFromSlug(species.habitat.name) : 'Unknown',
          growthRate: species.growth_rate ? titleFromSlug(species.growth_rate.name) : 'Unknown',
          generation: species.generation ? titleFromSlug(species.generation.name) : 'Unknown',
          generationId,
          gameAvailability: resolveGameAvailability(species),
          eggGroups: (species.egg_groups ?? []).map((entry) => titleFromSlug(entry.name)),
          isLegendary: Boolean(species.is_legendary),
          isMythical: Boolean(species.is_mythical),
          evolutionChain,
          sprites: effectiveData.sprites,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.pokedexNumber - b.pokedexNumber || a.name.localeCompare(b.name, locale))

    const generationSummaries = new Map()
    for (const summary of profileSummaries) {
      if (!generationSummaries.has(summary.generationId)) {
        generationSummaries.set(summary.generationId, [])
      }
      generationSummaries.get(summary.generationId).push(summary)
    }

    const profilesByGeneration = new Map()
    for (const pokemon of pokemonRaw) {
      const species = speciesByName.get(pokemon.species.name)
      if (!species) continue
      const effectiveData = resolveEffectivePokemonData(
        pokemon,
        species,
        pokemonByName,
        showdownOverlay,
        championsFormOverrides,
      )
      const generationId = generationIdFromName(species.generation?.name)
      if (!profilesByGeneration.has(generationId)) profilesByGeneration.set(generationId, [])
      profilesByGeneration.get(generationId).push({
        id: pokemon.name,
        moves: buildMoveDetails(effectiveData.moveEntries, moveByName, locale),
      })
    }

    const catalog = {
      version: 'v1',
      locale,
      generatedAt,
      pokemon: pokemonEntries,
      moves: moveRaw
        .map((move) => moveEntryFromRaw(move, moveDescriptionOverrides.movesById[move.name] ?? null, locale))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
      items: itemRaw
        .map((item) => itemEntryFromRaw(item, locale))
        .concat(
          [...usedRequiredItemIds]
            .filter((itemId) => !itemRaw.some((item) => item.name === itemId))
            .map((itemId) => itemEntryFromShowdown(itemId, showdownOverlay.items[toShowdownId(itemId)], locale)),
        )
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
      abilities: abilityRaw
        .map((ability) =>
          resolveAbilityEntry(
            ability.name,
            ability,
            championsFormOverrides.abilitiesById[ability.name] ?? null,
            abilityDescriptionOverrides.abilitiesById[ability.name] ?? null,
            showdownOverlay.abilities[toShowdownId(ability.name)],
            locale,
          ),
        )
        .concat(
          [...usedAbilityIds]
            .filter((abilityId) => !abilityByName.has(abilityId))
            .map((abilityId) =>
              championsFormOverrides.abilitiesById[abilityId]
                ? resolveAbilityEntry(
                    abilityId,
                    null,
                    championsFormOverrides.abilitiesById[abilityId],
                    abilityDescriptionOverrides.abilitiesById[abilityId] ?? null,
                    showdownOverlay.abilities[toShowdownId(abilityId)],
                    locale,
                  )
                : resolveAbilityEntry(
                    abilityId,
                    null,
                    null,
                    abilityDescriptionOverrides.abilitiesById[abilityId] ?? null,
                    showdownOverlay.abilities[toShowdownId(abilityId)],
                    locale,
                  ),
            ),
        )
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
      formsByPokemonId,
    }

    const localeDir = path.join(outputRoot, locale)
    await mkdir(localeDir, { recursive: true })
    await writeSnapshotFile(path.join(localeDir, 'catalog.json'), catalog)

    for (let generationId = 1; generationId <= 9; generationId += 1) {
      const generationSnapshot = {
        version: 'v1',
        locale,
        generationId,
        generatedAt,
        profiles: [...(generationSummaries.get(generationId) ?? [])].sort(
          (a, b) => a.pokedexNumber - b.pokedexNumber || a.name.localeCompare(b.name, locale),
        ),
        detailBucketsByPokemonId: {},
      }

      const generationProfiles = (profilesByGeneration.get(generationId) ?? []).sort((a, b) => a.id.localeCompare(b.id))
      const detailBuckets = chunkItems(generationProfiles, DETAIL_BUCKET_SIZE)
      detailBuckets.forEach((bucketProfiles, bucketIndex) => {
        const bucketId = bucketIndex + 1
        for (const profile of bucketProfiles) {
          generationSnapshot.detailBucketsByPokemonId[profile.id] = bucketId
        }
      })

      await writeSnapshotFile(path.join(localeDir, `generation.gen${generationId}.json`), generationSnapshot)

      for (const [bucketIndex, bucketProfiles] of detailBuckets.entries()) {
        const bucketId = bucketIndex + 1
        const snapshot = {
          version: 'v1',
          locale,
          generationId,
          bucketId,
          generatedAt,
          profiles: bucketProfiles,
        }
        await writeSnapshotFile(
          path.join(localeDir, `profiles.gen${generationId}.bucket${bucketId}.json`),
          snapshot,
        )
      }
    }

    console.log(`Wrote snapshots for locale ${locale}`)
  }

  const championsDir = path.join(outputRoot, 'champions')
  await mkdir(championsDir, { recursive: true })
  await writeSnapshotFile(path.join(championsDir, 'availability.json'), championsAvailabilityOverlay)

  await syncChampionsRegulation()
  console.log('Dex snapshots generated successfully.')
}

async function writeSnapshotFile(targetPath, payload) {
  const json = JSON.stringify(payload, null, 2) + '\n'
  await writeFile(targetPath, json, 'utf8')
  await writeFile(`${targetPath}.gz`, gzipSync(Buffer.from(json, 'utf8'), { level: 9 }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
