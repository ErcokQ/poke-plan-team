import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(repoRoot, 'data', 'champions', 'meta-usage.source.json')
const publicPath = path.join(repoRoot, 'public', 'meta-snapshots', 'champions', 'vgc-reg-mc.json')
const threatsPath = path.join(repoRoot, 'src', 'data', 'meta-threats.vgc.json')
const catalogPath = path.join(repoRoot, 'public', 'dex-snapshots', 'en', 'catalog.json')
const feedUrl = 'https://eurekaffeine.github.io/pokemon-champions-scraper/battle_meta.json'
const mappingUrl = 'https://raw.githubusercontent.com/eurekaffeine/pokemon-champions-scraper/main/src/data/name_mappings.json'
const formatCode = 'gen9championsvgc2026regmc'

const pokemonAliases = {
  basculegion: 'basculegion-male',
  'basculegion-f': 'basculegion-female',
  indeedee: 'indeedee-male',
  'indeedee-f': 'indeedee-female',
  maushold: 'maushold-family-of-four',
  lycanroc: 'lycanroc-midday',
  sirfetchd: 'sirfetchd',
  aegislash: 'aegislash-shield',
  toxtricity: 'toxtricity-amped',
  palafin: 'palafin-zero',
  meowstic: 'meowstic-male',
  'meowstic-f': 'meowstic-female',
  pyroar: 'pyroar-male',
  squawkabilly: 'squawkabilly-green-plumage',
  mimikyu: 'mimikyu-disguised',
  'tauros-paldea-aqua': 'tauros-paldea-aqua-breed',
  'tauros-paldea-blaze': 'tauros-paldea-blaze-breed',
  'farfetchd': 'farfetchd',
  gourgeist: 'gourgeist-average',
  morpeko: 'morpeko-full-belly',
}

function normalizeId(value) {
  const id = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return pokemonAliases[id] ?? id
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Meta sync request failed (${response.status}) for ${url}`)
  return response.json()
}

function numericIdMap(namesById) {
  const result = new Map()
  for (const [name, id] of Object.entries(namesById)) {
    if (Number.isInteger(id)) result.set(id, name)
  }
  return result
}

function rankedUsages(entries, idsByNumber, allowedIds) {
  const ranked = {}
  for (const entry of entries ?? []) {
    const id = idsByNumber.get(entry.id)
    if (id && allowedIds.has(id) && Number.isFinite(entry.usage) && entry.usage > 0) {
      ranked[id] = entry.usage
    }
  }
  return ranked
}

function teammateUsages(entries, pokemonIdsByNumber) {
  const ranked = {}
  for (const entry of entries ?? []) {
    const id = pokemonIdsByNumber.get(entry.id)
    if (id && Number.isFinite(entry.usage) && entry.usage > 0) ranked[id] = entry.usage
  }
  return ranked
}

async function writeSnapshot(filePath, payload) {
  const json = `${JSON.stringify(payload, null, 2)}\n`
  await writeFile(filePath, json, 'utf8')
  await writeFile(`${filePath}.gz`, gzipSync(json))
}

async function main() {
  const [feed, mappings, catalog] = await Promise.all([
    fetchJson(feedUrl),
    fetchJson(mappingUrl),
    readFile(catalogPath, 'utf8').then(JSON.parse),
  ])
  if (feed.season?.format_code !== formatCode || !Array.isArray(feed.pokemon_usage)) {
    throw new Error('The Champions meta feed is not Regulation M-C')
  }

  const pokemonIds = new Set(catalog.pokemon.map((pokemon) => pokemon.id))
  const moveIds = new Set(catalog.moves.map((move) => move.id))
  const itemIds = new Set(catalog.items.map((item) => item.id))
  const movesByNumber = numericIdMap(mappings.moves)
  const itemsByNumber = numericIdMap(mappings.items)
  const pokemonIdsByNumber = new Map()
  const unknownPokemon = []

  for (const entry of feed.pokemon_usage) {
    const pokemonId = normalizeId(entry.name)
    if (!pokemonIds.has(pokemonId)) {
      unknownPokemon.push(entry.name)
      continue
    }
    pokemonIdsByNumber.set(entry.dex_id, pokemonId)
  }
  if (unknownPokemon.length > 0) {
    throw new Error(`Unknown Champions Pokemon in meta feed: ${unknownPokemon.join(', ')}`)
  }

  const pokemon = {}
  for (const entry of feed.pokemon_usage) {
    const id = pokemonIdsByNumber.get(entry.dex_id)
    if (pokemon[id]) throw new Error(`Duplicate Champions meta id: ${id}`)
    pokemon[id] = {
      name: entry.name,
      rank: entry.rank,
      usage: { weighted: entry.usage_rate, raw: entry.usage_rate },
      moves: rankedUsages(entry.top_moves, movesByNumber, moveIds),
      items: rankedUsages(entry.top_items, itemsByNumber, itemIds),
      teammates: teammateUsages(entry.top_teammates, pokemonIdsByNumber),
    }
  }

  const entries = Object.values(pokemon)
  const withMoves = entries.filter((entry) => Object.keys(entry.moves).length > 0).length
  const withItems = entries.filter((entry) => Object.keys(entry.items).length > 0).length
  if (entries.length < 200 || withMoves < 200 || withItems < 200) {
    throw new Error(`Incomplete Champions meta feed: ${entries.length} Pokemon, ${withMoves} moves, ${withItems} items`)
  }

  const payload = {
    version: 1,
    format: 'champions-vgc-reg-mc',
    label: 'Pokemon Champions VGC 2026 Regulation Set M-C',
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Pokemon Champions Scraper / Pikalytics',
      url: feedUrl,
      note: `Regulation M-C usage feed updated ${feed.updated_at}; numeric move and item ids resolved offline with the publisher's mapping. Missing values are not estimated.`,
    },
    pokemon,
  }
  const threats = Object.entries(pokemon)
    .sort(([, a], [, b]) => a.rank - b.rank)
    .slice(0, 12)
    .map(([pokemonId, entry]) => ({
      id: pokemonId,
      name: entry.name,
      kind: 'pokemon',
      pokemonId,
      defensiveTypes: [],
      threatMoveTypes: [],
      expectedSpeed: 0,
      utilityCountersAny: [],
      priority: entry.rank,
    }))
  await Promise.all([
    writeSnapshot(sourcePath, payload),
    writeSnapshot(publicPath, payload),
    writeFile(threatsPath, `${JSON.stringify(threats, null, 2)}\n`, 'utf8'),
  ])
  console.log(`Wrote ${entries.length} Champions meta entries (${withMoves} with moves, ${withItems} with items)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
