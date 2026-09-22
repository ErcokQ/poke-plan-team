import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(repoRoot, 'data', 'champions', 'meta-usage.source.json')
const publicPath = path.join(repoRoot, 'public', 'meta-snapshots', 'champions', 'vgc-reg-mc.json')
const championsAvailabilitySourcePath = path.join(repoRoot, 'data', 'champions', 'availability.source.json')

const PIKALYTICS_CHAMPIONS_FORMAT = 'gen9championsvgc2026regmc'
const DEFAULT_SOURCE_URL = `https://www.pikalytics.com/pokedex/${PIKALYTICS_CHAMPIONS_FORMAT}`
const FORMAT_ID = 'champions-vgc-reg-mc'
const FORMAT_LABEL = 'Pokemon Champions VGC 2026 Regulation Set M-C'
const MAX_RANKING_ENTRIES = Number.parseInt(process.env.CHAMPIONS_META_RANKING_LIMIT ?? '20', 10)
const MAX_DETAIL_PAGES = Number.parseInt(process.env.CHAMPIONS_META_DETAIL_LIMIT ?? '20', 10)
const MAX_SUPPLEMENTAL_DETAIL_PAGES = Number.parseInt(process.env.CHAMPIONS_META_SUPPLEMENTAL_LIMIT ?? '0', 10)
const REQUEST_HEADERS = {
  'user-agent': 'poke-plan-team-meta-sync/1.0 (+local snapshot generator)',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}
const META_ID_ALIASES = {
  aegislash: 'aegislash-shield',
  basculegion: 'basculegion-male',
  charizard: 'charizard-mega-y',
  blastoise: 'blastoise-mega',
  aerodactyl: 'aerodactyl-mega',
  staraptor: 'staraptor-mega',
  swampert: 'swampert-mega',
  metagross: 'metagross-mega',
  floette_eternal: 'floette-mega',
  'floette-eternal': 'floette-mega',
  maushold: 'maushold-family-of-four',
  'indeedee-f': 'indeedee-female',
  'floette-eternal': 'floette-eternal',
}

function normalizeId(value) {
  const id = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return META_ID_ALIASES[id] ?? id
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function toRatio(percent) {
  const value = Number.parseFloat(String(percent ?? '').replace('%', '').trim())
  if (!Number.isFinite(value)) return 0
  return Number((value / 100).toFixed(6))
}

function absoluteUrl(href, sourceUrl) {
  return new URL(decodeHtml(href), sourceUrl).toString()
}

async function fetchText(url) {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS })
      if (response.ok) return response.text()
      lastError = new Error(`Champions meta request failed (${response.status}) for ${url}`)
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 800))
  }

  throw lastError ?? new Error(`Champions meta request failed for ${url}`)
}

function parseTopPokemon(html, sourceUrl) {
  const entries = []
  const cardPattern =
    /<a class="tournament-top20-card[^"]*" href="([^"]+)" data-name="([^"]+)" aria-label="Rank\s+(\d+)\s+[^,]+,\s+([\d.]+)\s+percent usage"[\s\S]*?<\/a>/g

  for (const match of html.matchAll(cardPattern)) {
    const name = decodeHtml(match[2]).trim()
    const id = normalizeId(name)
    if (!id) continue
    entries.push({
      id,
      name,
      rank: Number.parseInt(match[3], 10),
      usage: toRatio(match[4]),
      detailUrl: absoluteUrl(match[1], sourceUrl),
    })
  }

  return entries.sort((a, b) => a.rank - b.rank || b.usage - a.usage || a.name.localeCompare(b.name))
}

function parseRankedPokemonList(html, sourceUrl) {
  const entries = []
  const seenIds = new Set()
  const listStart = html.indexOf('id="min_list"')
  const listHtml = listStart >= 0 ? html.slice(listStart) : html
  const entryBlocks = listHtml.split(/<a\s+/).slice(1)

  for (const block of entryBlocks) {
    if (!block.includes('pokedex_entry')) continue

    const hrefMatch = block.match(/href="([^"]*\/pokedex\/gen9championsvgc2026regmc\/([^"?]+)(?:\?l=en)?)[^"]*"/)
    const nameMatch = block.match(/data-name="([^"]+)"/)
    const rankMatch = block.match(/<span class="float-right margin-right-20">#?(\d+)<\/span>/)
    if (!hrefMatch || !nameMatch) continue

    const name = decodeHtml(nameMatch[1]).trim()
    const id = normalizeId(name)
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    entries.push({
      id,
      name,
      rank: rankMatch ? Number.parseInt(rankMatch[1], 10) : entries.length + 1,
      usage: 0,
      detailUrl: absoluteUrl(hrefMatch[1], sourceUrl),
    })
  }

  return entries.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
}

function sectionHtml(html, wrapperId) {
  const start = html.indexOf(`id="${wrapperId}"`)
  if (start < 0) return ''
  const nextSection = html.indexOf('<div class="inline-block pokemon-stat-container"', start + wrapperId.length)
  return html.slice(start, nextSection > start ? nextSection : html.length)
}

function parseWeightedEntries(section, { teammate = false } = {}) {
  const entries = {}
  const blocks = teammate
    ? section.split('<a class="teammate_entry').slice(1)
    : section.split('<div class="pokedex-move-entry-new">').slice(1)
  const textPattern = teammate
    ? /data-name="([^"]+)"/
    : /<div class="pokedex-inline-text(?:-offset)?">(?:\s*<span>)?([^<]+)/
  const percentPattern = /<div class="pokedex-inline-right">([\d.]+)%<\/div>/

  for (const block of blocks) {
    const textMatch = block.match(textPattern)
    const percentMatch = block.match(percentPattern)
    if (!textMatch || !percentMatch) continue

    const id = normalizeId(decodeHtml(textMatch[1]).trim())
    const weight = toRatio(percentMatch[1])
    if (id && weight > 0) entries[id] = weight
  }

  return entries
}

function parseUsageFromDetail(html) {
  const match = html.match(/<div class="pokemon-ind-summary-title">Usage Percent<\/div>\s*<div class="pokemon-ind-summary-text gold-font">([\d.]+)/)
  return match ? toRatio(match[1]) : 0
}

function parseRankFromDetail(html) {
  const match = html.match(/<div class="pokemon-ind-summary-title">(?:Monthly Rank|Tournament Rank)<\/div>\s*<div class="pokemon-ind-summary-text purple-font"><span[^>]*>#<\/span>(\d+)/)
  return match ? Number.parseInt(match[1], 10) : 0
}

async function parsePokemonDetails(entry) {
  const html = await fetchText(entry.detailUrl)
  const detailRank = parseRankFromDetail(html)
  const rank = detailRank || entry.rank
  const usage = entry.usage || parseUsageFromDetail(html)

  return {
    ...entry,
    rank,
    usage,
    moves: parseWeightedEntries(sectionHtml(html, 'moves_wrapper')),
    items: parseWeightedEntries(sectionHtml(html, 'items_wrapper')),
    abilities: parseWeightedEntries(sectionHtml(html, 'abilities_wrapper')),
    teammates: parseWeightedEntries(sectionHtml(html, 'teammate_wrapper'), { teammate: true }),
  }
}

function titleFromPokemonId(pokemonId) {
  return String(pokemonId)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
}

function pikalyticsNameFromAvailabilityEntry(entry) {
  const id = String(entry?.formId ?? entry?.pokemonId ?? '')
  if (!id) return ''

  const aliases = {
    'aegislash-shield': 'Aegislash',
    'basculegion-male': 'Basculegion',
    'basculegion-female': 'Basculegion',
    'floette-mega': 'Floette-Eternal',
    'maushold-family-of-four': 'Maushold',
    'maushold-family-of-three': 'Maushold',
    'pyroar-male': 'Pyroar',
    'sinistcha-masterpiece': 'Sinistcha-Masterpiece',
  }
  if (aliases[id]) return aliases[id]

  return titleFromPokemonId(
    id
      .replace(/-mega(?:-[xy])?$/, '')
      .replace(/-gmax$/, ''),
  )
}

async function loadSupplementalCandidates(sourceUrl, seenIds) {
  const limit =
    Number.isFinite(MAX_SUPPLEMENTAL_DETAIL_PAGES) && MAX_SUPPLEMENTAL_DETAIL_PAGES > 0
      ? MAX_SUPPLEMENTAL_DETAIL_PAGES
      : 0
  if (limit === 0) return []

  try {
    const raw = JSON.parse(await readFile(championsAvailabilitySourcePath, 'utf8'))
    const entries = Array.isArray(raw?.entries) ? raw.entries : []
    const candidates = []
    const seenNames = new Set()

    for (const entry of entries) {
      if (entry?.availability !== 'available' && entry?.availability !== 'limited') continue
      const name = pikalyticsNameFromAvailabilityEntry(entry)
      const id = normalizeId(name)
      if (!name || !id || seenIds.has(id) || seenNames.has(name)) continue
      seenNames.add(name)
      candidates.push({
        id,
        name,
        rank: 9999,
        usage: 0,
        detailUrl: absoluteUrl(`/pokedex/${PIKALYTICS_CHAMPIONS_FORMAT}/${encodeURIComponent(name)}?l=en`, sourceUrl),
      })
      if (candidates.length >= limit) break
    }

    return candidates
  } catch (error) {
    console.warn(`[ChampionsMeta] Supplemental candidates unavailable: ${error.message}`)
    return []
  }
}

function fallbackPokemonDetails(entry) {
  return {
    ...entry,
    moves: {},
    items: {},
    abilities: {},
    teammates: {},
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function toPayload(entries, generatedAt, sourceUrl) {
  const pokemon = {}

  for (const entry of entries) {
    pokemon[entry.id] = {
      name: entry.name,
      rank: entry.rank,
      usage: {
        weighted: entry.usage,
        raw: entry.usage,
      },
      items: entry.items,
      moves: entry.moves,
      abilities: entry.abilities,
      teammates: entry.teammates,
    }
  }

  return {
    version: 1,
    format: FORMAT_ID,
    label: FORMAT_LABEL,
    generatedAt,
    source: {
      name: 'Pikalytics Champions',
      url: sourceUrl,
      note: 'Usage percentages reported on the public Champions Regulation M-C pages. Missing percentages are not estimated.',
    },
    pokemon,
  }
}

async function writeJsonWithGzip(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const json = `${JSON.stringify(payload, null, 2)}\n`
  await writeFile(filePath, json, 'utf8')
  await writeFile(`${filePath}.gz`, gzipSync(json))
}

async function main() {
  const sourceUrl = process.env.CHAMPIONS_META_SOURCE_URL || DEFAULT_SOURCE_URL
  const generatedAt = new Date().toISOString()

  console.log(`Fetching Champions meta index: ${sourceUrl}`)
  const html = await fetchText(sourceUrl)
  const topCards = parseTopPokemon(html, sourceUrl)
  const topPokemon = topCards.length > 0 ? topCards : parseRankedPokemonList(html, sourceUrl)
  if (topPokemon.length === 0) {
    throw new Error('No Champions usage cards were found in the source page')
  }
  const rankingLimit = Number.isFinite(MAX_RANKING_ENTRIES) && MAX_RANKING_ENTRIES > 0 ? MAX_RANKING_ENTRIES : 50
  const rankingEntries = topPokemon.slice(0, rankingLimit)
  const supplementalEntries = await loadSupplementalCandidates(
    sourceUrl,
    new Set(rankingEntries.map((entry) => entry.id)),
  )

  const detailLimit = Number.isFinite(MAX_DETAIL_PAGES) && MAX_DETAIL_PAGES > 0 ? MAX_DETAIL_PAGES : rankingEntries.length
  const detailCandidates = [...rankingEntries.slice(0, detailLimit), ...supplementalEntries]

  console.log(`Fetching Champions Pokemon details: ${detailCandidates.length}`)
  const detailedEntries = await mapWithConcurrency(detailCandidates, 3, async (entry) => {
    try {
      return await parsePokemonDetails(entry)
    } catch (error) {
      console.warn(`[ChampionsMeta] Detail fallback for ${entry.name}: ${error.message}`)
      return fallbackPokemonDetails(entry)
    }
  })
  const rankedEntries = detailedEntries
    .filter((entry) => entry.rank > 0 && entry.rank < 9999 && entry.usage > 0)
    .sort((a, b) => a.rank - b.rank || b.usage - a.usage || a.name.localeCompare(b.name))
  if (rankedEntries.length === 0) {
    throw new Error('No verified Champions usage percentages were found; refusing to overwrite the snapshot')
  }
  if (!rankedEntries.some((entry) => Object.keys(entry.moves).length > 0 && Object.keys(entry.items).length > 0)) {
    throw new Error('No Champions move and item usage was found; refusing to overwrite the snapshot')
  }
  const payload = toPayload(rankedEntries, generatedAt, sourceUrl)

  await writeJsonWithGzip(sourcePath, payload)
  await writeJsonWithGzip(publicPath, payload)
  console.log(`Wrote ${Object.keys(payload.pokemon).length} Champions meta entries`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
