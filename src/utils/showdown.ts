import { z } from 'zod'
import type { StatKey, Team, TeamMember } from '@/models/domain'
import { MAX_EV_PER_STAT, MAX_IV_PER_STAT, STATS, TYPE_KEYS } from '@/models/domain'

const memberSchema: z.ZodType<TeamMember> = z.object({
  slot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  pokemonId: z.string(),
  teraType: z.enum(TYPE_KEYS).optional(),
  abilityId: z.string(),
  itemId: z.string().optional(),
  natureId: z.string(),
  evs: z.object({
    hp: z.number(),
    atk: z.number(),
    def: z.number(),
    spa: z.number(),
    spd: z.number(),
    spe: z.number(),
  }),
  ivs: z.object({
    hp: z.number(),
    atk: z.number(),
    def: z.number(),
    spa: z.number(),
    spd: z.number(),
    spe: z.number(),
  }),
  moves: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  roleTags: z.array(z.enum(['sweeper', 'support', 'pivot', 'wall', 'speed-control'])),
})

const teamSchema: z.ZodType<Team> = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(['vgc', 'singles']),
  members: z.array(memberSchema).length(6),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const importSchema = z.object({
  version: z.literal('v1'),
  team: teamSchema,
})

const compactImportSchema = z.object({
  version: z.literal('v1-share'),
  team: z.object({
    name: z.string().optional(),
    mode: z.enum(['vgc', 'singles']).optional(),
    members: z.array(memberSchema).length(6),
    notes: z.string().optional(),
  }),
})

const importUnionSchema = z.union([importSchema, compactImportSchema])

const showdownStatMap: Record<string, StatKey> = {
  hp: 'hp',
  atk: 'atk',
  attack: 'atk',
  def: 'def',
  defense: 'def',
  spa: 'spa',
  spatk: 'spa',
  specialattack: 'spa',
  spd: 'spd',
  spdef: 'spd',
  specialdefense: 'spd',
  spe: 'spe',
  speed: 'spe',
}

function normalizeId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const pokemonIdAliasMap: Record<string, string> = {
  aegislash: 'aegislash-shield',
  'calyrex-shadow': 'calyrex-shadow',
  'calyrex-shadow-rider': 'calyrex-shadow',
  'calyrex-shadowrider': 'calyrex-shadow',
  'calyrex-ice': 'calyrex-ice',
  'calyrex-ice-rider': 'calyrex-ice',
  'calyrex-icerider': 'calyrex-ice',
  'urshifu-rs': 'urshifu-rapid-strike',
  'urshifu-rapid': 'urshifu-rapid-strike',
  'urshifu-rapid-strike-style': 'urshifu-rapid-strike',
  'urshifu-ss': 'urshifu-single-strike',
  'urshifu-single': 'urshifu-single-strike',
  'urshifu-single-strike-style': 'urshifu-single-strike',
  'zacian-crowned-sword': 'zacian-crowned',
  'zamazenta-crowned-shield': 'zamazenta-crowned',
  'ogerpon-wellspring': 'ogerpon-wellspring-mask',
  'ogerpon-hearthflame': 'ogerpon-hearthflame-mask',
  'ogerpon-cornerstone': 'ogerpon-cornerstone-mask',
  maushold: 'maushold-family-of-four',
  'maushold-four': 'maushold-family-of-four',
  'maushold-three': 'maushold-family-of-three',
}

export function canonicalizePokemonId(value: string): string {
  const normalized = normalizeId(value)
  if (!normalized) return ''

  if (pokemonIdAliasMap[normalized]) return pokemonIdAliasMap[normalized]

  if (
    normalized.startsWith('maushold') ||
    normalized.startsWith('mousehold') ||
    normalized.startsWith('mausehold') ||
    normalized.startsWith('moushold')
  ) {
    if (/(?:^|-)(?:three|3)(?:-|$)/.test(normalized)) return 'maushold-family-of-three'
    return 'maushold-family-of-four'
  }

  if (normalized.startsWith('calyrex-shadow')) return 'calyrex-shadow'
  if (normalized.startsWith('calyrex-ice')) return 'calyrex-ice'
  if (normalized.includes('urshifu-rapid-strike')) return 'urshifu-rapid-strike'
  if (normalized.includes('urshifu-single-strike')) return 'urshifu-single-strike'
  if (normalized.startsWith('urshifu-rs')) return 'urshifu-rapid-strike'
  if (normalized.startsWith('urshifu-ss')) return 'urshifu-single-strike'

  return normalized
}

function parseStatKey(raw: string): StatKey | null {
  const key = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
  return showdownStatMap[key] ?? null
}

function parseSpreadLine(
  line: string,
  prefix: 'EVs:' | 'IVs:',
  defaults: Record<StatKey, number>,
  maxValue: number,
): Record<StatKey, number> {
  if (!line.startsWith(prefix)) return defaults
  const next = { ...defaults }
  const content = line.slice(prefix.length).trim()
  const chunks = content.split('/').map((entry) => entry.trim())

  for (const chunk of chunks) {
    const matched = chunk.match(/^(\d+)\s+(.+)$/)
    if (!matched) continue
    const [, rawValue, rawStat] = matched
    const statKey = parseStatKey(rawStat)
    if (!statKey) continue
    const value = Math.max(0, Math.min(maxValue, Number.parseInt(rawValue, 10)))
    next[statKey] = Number.isFinite(value) ? value : next[statKey]
  }

  return next
}

function parseShowdownHeader(header: string): { pokemonId: string; itemId: string } {
  const [rawPokemon, rawItem] = header.split('@').map((part) => part.trim())
  let pokemonName = rawPokemon.replace(/\s+\((M|F)\)$/i, '').trim()

  const nicknameMatch = pokemonName.match(/\(([^()]+)\)\s*$/)
  if (nicknameMatch?.[1]) {
    pokemonName = nicknameMatch[1].trim()
  }

  return {
    pokemonId: canonicalizePokemonId(pokemonName),
    itemId: rawItem ? normalizeId(rawItem) : '',
  }
}

export function parseTeamImportPayload(
  raw: string,
  mode: Team['mode'],
): { team: Team; source: 'full' | 'compact' } {
  const json = JSON.parse(raw)
  const parsed = importUnionSchema.parse(json)
  const now = new Date().toISOString()

  if (parsed.version === 'v1') {
    return {
      source: 'full',
      team: {
        ...structuredClone(parsed.team),
        mode,
      },
    }
  }

  return {
    source: 'compact',
    team: {
      id: crypto.randomUUID(),
      name: parsed.team.name?.trim() || (mode === 'vgc' ? 'Imported VGC Team' : 'Imported Singles Team'),
      mode,
      members: structuredClone(parsed.team.members),
      notes: parsed.team.notes ?? '',
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function exportTeamAsFullJson(team: Team): string {
  return JSON.stringify({ version: 'v1', team }, null, 2)
}

export function exportTeamAsShareJson(team: Team): string {
  return JSON.stringify(
    {
      version: 'v1-share',
      team: {
        name: team.name,
        mode: team.mode,
        members: team.members,
        notes: team.notes ?? '',
      },
    },
    null,
    2,
  )
}

export function exportTeamAsShowdown(team: Team): string {
  const chunks = team.members
    .filter((member) => member.pokemonId)
    .map((member) => {
      const itemLine = member.itemId ? ` @ ${member.itemId}` : ''
      const lines = [
        `${member.pokemonId}${itemLine}`,
        `Ability: ${member.abilityId || 'unknown'}`,
        `Tera Type: ${member.teraType || 'none'}`,
        `EVs: ${STATS.map((stat) => `${member.evs[stat]} ${stat.toUpperCase()}`).join(' / ')}`,
        `IVs: ${STATS.map((stat) => `${member.ivs[stat]} ${stat.toUpperCase()}`).join(' / ')}`,
        `Nature: ${member.natureId}`,
        ...member.moves.filter(Boolean).map((move) => `- ${move}`),
      ]
      return lines.join('\n')
    })

  return chunks.join('\n\n')
}

export function importTeamFromShowdown(
  source: string,
  mode: Team['mode'],
  template: Team,
): Team {
  const blocks = source
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)

  const next = structuredClone(template)
  next.mode = mode

  blocks.slice(0, 6).forEach((block, index) => {
    const lines = block.split('\n').map((line) => line.trim())
    const [header, ...rest] = lines
    if (!header) return

    const parsedHeader = parseShowdownHeader(header)
    const member = next.members[index]
    member.pokemonId = parsedHeader.pokemonId
    member.itemId = parsedHeader.itemId

    const moves: string[] = []
    let evs = { ...member.evs }
    let ivs = { ...member.ivs }

    for (const line of rest) {
      if (line.startsWith('Ability:')) {
        member.abilityId = normalizeId(line.replace('Ability:', '').trim())
      }
      if (line.startsWith('Tera Type:')) {
        const tera = line.replace('Tera Type:', '').trim().toLowerCase()
        if (TYPE_KEYS.includes(tera as (typeof TYPE_KEYS)[number])) {
          member.teraType = tera as (typeof TYPE_KEYS)[number]
        }
      }
      if (line.startsWith('Nature:') || line.toLowerCase().endsWith(' nature')) {
        const rawNature = line.startsWith('Nature:')
          ? line.replace('Nature:', '').trim()
          : line.replace(/\s+nature$/i, '').trim()
        member.natureId = normalizeId(rawNature)
      }
      evs = parseSpreadLine(line, 'EVs:', evs, MAX_EV_PER_STAT)
      ivs = parseSpreadLine(line, 'IVs:', ivs, MAX_IV_PER_STAT)
      if (line.startsWith('Level:')) {
        continue
      }
      if (line.startsWith('- ')) {
        moves.push(normalizeId(line.replace('- ', '').trim()))
      }
    }

    while (moves.length < 4) moves.push('')
    member.evs = evs
    member.ivs = ivs
    member.moves = [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? '']
  })

  next.updatedAt = new Date().toISOString()
  return next
}
