import type { BattleMode } from '@/models/domain'
import type {
  MetaFormatKey,
  MetaBenchmarkTemplate,
  MetaTeamTemplate,
  MetaTemplateDataset,
  MetaTemplateMember,
  MetaTemplateSet,
} from '@/models/meta'
import { MODE_META_MAP } from '@/models/meta'
import type { PokemonTypeKey, StatKey } from '@/models/domain'
import { TYPE_KEYS } from '@/models/domain'
import { normalizeMetaId } from '@/services/meta-usage-service'

import vgcRaw from '@/data/meta-templates.vgc.json'
import singlesRaw from '@/data/meta-templates.singles.json'

const datasets: Record<BattleMode, MetaTemplateDataset> = {
  vgc: vgcRaw as MetaTemplateDataset,
  singles: singlesRaw as MetaTemplateDataset,
}

const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
const SUPPORTED_NATURES = new Set([
  'adamant',
  'jolly',
  'timid',
  'modest',
  'careful',
  'bold',
  'calm',
  'impish',
  'sassy',
  'naive',
])

interface RawTeamTemplateMember {
  species?: string
  item?: string
  ability?: string
  teraType?: string
  evs?: Partial<Record<StatKey, number>>
  ivs?: Partial<Record<StatKey, number>>
  nature?: string
  moves?: string[]
  level?: number
}

interface RawTeamTemplateEntry {
  name?: string
  author?: string
  data?: RawTeamTemplateMember[]
}

interface RawUsageRatio {
  raw?: number
  real?: number
  weighted?: number
}

interface RawUsagePokemonEntry {
  usage?: RawUsageRatio
  items?: Record<string, number>
  moves?: Record<string, number>
  teammates?: Record<string, number>
  abilities?: Record<string, number>
  spreads?: Record<string, number>
  teraTypes?: Record<string, number>
}

interface RawUsagePayload {
  pokemon?: Record<string, RawUsagePokemonEntry>
}

function emptyEvs(): Record<StatKey, number> {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function perfectIvs(): Record<StatKey, number> {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
}

function normalizeNature(raw?: string): string {
  const normalized = normalizeMetaId(raw || 'jolly') || 'jolly'
  return SUPPORTED_NATURES.has(normalized) ? normalized : 'jolly'
}

function normalizeType(raw?: string): PokemonTypeKey | undefined {
  if (!raw) return undefined
  const id = normalizeMetaId(raw)
  return TYPE_KEYS.includes(id as PokemonTypeKey) ? (id as PokemonTypeKey) : undefined
}

function normalizeStatBlock(
  source: Partial<Record<StatKey, number>> | undefined,
  defaultValue: number,
): Record<StatKey, number> {
  const base = defaultValue === 0 ? emptyEvs() : perfectIvs()
  const max = defaultValue === 0 ? 252 : 31
  if (!source) return base
  const next = { ...base }
  for (const key of STAT_KEYS) {
    const value = source[key]
    if (Number.isFinite(value)) next[key] = Math.max(0, Math.min(max, Math.floor(value as number)))
  }
  return next
}

function usageWeight(entry: RawUsagePokemonEntry): number {
  if (!entry.usage) return 0
  if (typeof entry.usage.weighted === 'number') return entry.usage.weighted
  if (typeof entry.usage.real === 'number') return entry.usage.real
  if (typeof entry.usage.raw === 'number') return entry.usage.raw
  return 0
}

function topKeys(entries: Record<string, number> | undefined, limit: number): string[] {
  if (!entries) return []
  return Object.entries(entries)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([raw]) => normalizeMetaId(raw))
    .filter((id) => id.length > 0)
}

function parseSpread(
  spreadRaw: string | undefined,
): { natureId: string; evs: Record<StatKey, number> } | null {
  if (!spreadRaw) return null
  const [natureRaw, evsRaw] = spreadRaw.split(':')
  if (!natureRaw || !evsRaw) return null
  const chunks = evsRaw.split('/')
  if (chunks.length !== 6) return null

  const parsed = chunks.map((value) => Number(value))
  if (parsed.some((value) => !Number.isFinite(value))) return null

  return {
    natureId: normalizeNature(natureRaw),
    evs: {
      hp: Math.max(0, Math.floor(parsed[0] ?? 0)),
      atk: Math.max(0, Math.floor(parsed[1] ?? 0)),
      def: Math.max(0, Math.floor(parsed[2] ?? 0)),
      spa: Math.max(0, Math.floor(parsed[3] ?? 0)),
      spd: Math.max(0, Math.floor(parsed[4] ?? 0)),
      spe: Math.max(0, Math.floor(parsed[5] ?? 0)),
    },
  }
}

function fallbackSet(mode: BattleMode): MetaTemplateSet {
  const level = mode === 'vgc' ? 50 : 100
  return {
    abilityId: '',
    itemId: '',
    natureId: 'jolly',
    teraType: undefined,
    moves: ['', '', '', ''],
    evs: emptyEvs(),
    ivs: perfectIvs(),
    level,
  }
}

function cloneSet(set: MetaTemplateSet): MetaTemplateSet {
  return {
    abilityId: set.abilityId,
    itemId: set.itemId,
    natureId: set.natureId,
    teraType: set.teraType,
    moves: [...set.moves] as [string, string, string, string],
    evs: { ...set.evs },
    ivs: { ...set.ivs },
    level: set.level,
  }
}

function cloneMember(member: MetaTemplateMember): MetaTemplateMember {
  return {
    slot: member.slot,
    pokemonId: member.pokemonId,
    ...cloneSet(member),
  }
}

export class MetaTemplateService {
  private readonly dynamicTeamsCache = new Map<BattleMode, Promise<MetaTeamTemplate[]>>()

  private defaultLevel(mode: BattleMode): number {
    return mode === 'vgc' ? 50 : 100
  }

  private setFromRawMember(mode: BattleMode, raw: RawTeamTemplateMember): MetaTemplateSet {
    const base = fallbackSet(mode)
    const normalizedMoves = [...(raw.moves ?? [])]
      .slice(0, 4)
      .map((move) => normalizeMetaId(move))
      .filter((id) => id.length > 0)
    while (normalizedMoves.length < 4) normalizedMoves.push('')

    const ivs = normalizeStatBlock(raw.ivs, 31)
    const evs = normalizeStatBlock(raw.evs, 0)

    return {
      abilityId: normalizeMetaId(raw.ability ?? ''),
      itemId: normalizeMetaId(raw.item ?? ''),
      natureId: normalizeNature(raw.nature ?? base.natureId),
      teraType: normalizeType(raw.teraType),
      moves: [
        normalizedMoves[0] ?? '',
        normalizedMoves[1] ?? '',
        normalizedMoves[2] ?? '',
        normalizedMoves[3] ?? '',
      ],
      evs,
      ivs,
      level: Number.isFinite(raw.level) ? Math.max(1, Math.min(100, Math.floor(raw.level!))) : this.defaultLevel(mode),
    }
  }

  private parseRemoteTeams(mode: BattleMode, rawTeams: RawTeamTemplateEntry[]): MetaTeamTemplate[] {
    const parsed: MetaTeamTemplate[] = []

    rawTeams.forEach((team, index) => {
      const membersRaw = (team.data ?? []).slice(0, 6)
      if (membersRaw.length < 4) return

      const members: MetaTemplateMember[] = membersRaw
        .map((rawMember, memberIndex) => {
          const pokemonId = normalizeMetaId(rawMember.species ?? '')
          if (!pokemonId) return null
          return {
            slot: (memberIndex + 1) as MetaTemplateMember['slot'],
            pokemonId,
            ...this.setFromRawMember(mode, rawMember),
          }
        })
        .filter((value): value is MetaTemplateMember => Boolean(value))

      if (members.length < 4) return
      const title = (team.name || `Team ${index + 1}`).trim()
      const author = (team.author || '').trim()
      const idSeed = normalizeMetaId(`${title}-${author}-${index + 1}`) || `team-${index + 1}`
      parsed.push({
        id: `pkmn-cc-${mode}-${idSeed}`,
        name: author ? `${title} (${author})` : title,
        members,
      })
    })

    return parsed
  }

  private setFromUsage(mode: BattleMode, pokemonEntry: RawUsagePokemonEntry): MetaTemplateSet {
    const base = fallbackSet(mode)
    const moves = topKeys(pokemonEntry.moves, 4)
    while (moves.length < 4) moves.push('')

    const bestSpreadRaw = Object.entries(pokemonEntry.spreads ?? {})
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    const parsedSpread = parseSpread(bestSpreadRaw)

    const ivs = perfectIvs()
    const physicalCount = moves.filter((id) => ['close-combat', 'earthquake', 'knock-off', 'iron-head', 'flare-blitz'].includes(id)).length
    const specialCount = moves.filter((id) => ['moonblast', 'shadow-ball', 'draco-meteor', 'make-it-rain', 'heat-wave'].includes(id)).length
    if (specialCount > physicalCount) ivs.atk = 0

    return {
      abilityId: topKeys(pokemonEntry.abilities, 1)[0] ?? '',
      itemId: topKeys(pokemonEntry.items, 1)[0] ?? '',
      natureId: parsedSpread?.natureId ?? base.natureId,
      teraType: normalizeType(topKeys(pokemonEntry.teraTypes, 1)[0]),
      moves: [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''],
      evs: parsedSpread?.evs ?? base.evs,
      ivs,
      level: this.defaultLevel(mode),
    }
  }

  private buildUsageTeams(
    mode: BattleMode,
    payload: RawUsagePayload,
    limit = 8,
  ): MetaTeamTemplate[] {
    const pokemonEntries = Object.entries(payload.pokemon ?? {}).map(([name, entry]) => ({
      name,
      id: normalizeMetaId(name),
      usage: usageWeight(entry),
      entry,
    }))
    const sorted = pokemonEntries
      .filter((row) => row.id.length > 0 && row.usage > 0)
      .sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name))

    if (sorted.length === 0) return []

    const topIds = sorted.map((row) => row.id)
    const usageById = new Map(sorted.map((row) => [row.id, row.entry]))
    const nameById = new Map(sorted.map((row) => [row.id, row.name]))
    const teams: MetaTeamTemplate[] = []

    for (let index = 0; index < Math.min(limit, topIds.length); index += 1) {
      const seedId = topIds[index]
      const seedEntry = usageById.get(seedId)
      if (!seedEntry) continue

      const candidateIds: string[] = [seedId]
      for (const teammateId of topKeys(seedEntry.teammates, 12)) {
        if (!candidateIds.includes(teammateId)) candidateIds.push(teammateId)
        if (candidateIds.length >= 6) break
      }
      for (const fallbackId of topIds) {
        if (!candidateIds.includes(fallbackId)) candidateIds.push(fallbackId)
        if (candidateIds.length >= 6) break
      }

      const members: MetaTemplateMember[] = candidateIds.slice(0, 6).map((pokemonId, memberIndex) => ({
        slot: (memberIndex + 1) as MetaTemplateMember['slot'],
        pokemonId,
        ...this.setFromUsage(mode, usageById.get(pokemonId) ?? {}),
      }))

      const seedName = nameById.get(seedId) ?? seedId
      teams.push({
        id: `pkmn-usage-${mode}-${index + 1}-${seedId}`,
        name: `Meta ${mode.toUpperCase()} #${index + 1} (${seedName})`,
        members,
      })
    }

    return teams
  }

  private async fetchRemoteTeamsByFormat(mode: BattleMode, format: MetaFormatKey): Promise<MetaTeamTemplate[]> {
    const response = await fetch(`https://data.pkmn.cc/teams/${format}.json`)
    if (!response.ok) return []
    const payload = (await response.json()) as RawTeamTemplateEntry[]
    const parsed = this.parseRemoteTeams(mode, payload)
    return parsed.slice(0, 80)
  }

  private async fetchUsageTeamsByFormat(mode: BattleMode, format: MetaFormatKey): Promise<MetaTeamTemplate[]> {
    const response = await fetch(`https://data.pkmn.cc/stats/${format}.json`)
    if (!response.ok) return []
    const payload = (await response.json()) as RawUsagePayload
    return this.buildUsageTeams(mode, payload)
  }

  getTeamTemplates(mode: BattleMode): MetaTeamTemplate[] {
    return (datasets[mode]?.teams ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      members: team.members.map(cloneMember),
    }))
  }

  getBenchmarks(mode: BattleMode): MetaBenchmarkTemplate[] {
    return (datasets[mode]?.benchmarks ?? []).map((entry) => ({
      id: entry.id,
      pokemonId: entry.pokemonId,
      set: cloneSet(entry.set),
    }))
  }

  getTeamTemplate(mode: BattleMode, templateId: string): MetaTeamTemplate | undefined {
    return this.getTeamTemplates(mode).find((entry) => entry.id === templateId)
  }

  getBenchmarkById(mode: BattleMode, benchmarkId: string): MetaBenchmarkTemplate | undefined {
    return this.getBenchmarks(mode).find((entry) => entry.id === benchmarkId)
  }

  getBenchmarkByPokemon(mode: BattleMode, pokemonId: string): MetaBenchmarkTemplate | undefined {
    return this.getBenchmarks(mode).find((entry) => entry.pokemonId === pokemonId)
  }

  async getDynamicTeamTemplates(mode: BattleMode): Promise<MetaTeamTemplate[]> {
    if (this.dynamicTeamsCache.has(mode)) return this.dynamicTeamsCache.get(mode)!

    const task = (async () => {
      const format = MODE_META_MAP[mode]
      if (!format) return []

      const [remoteTeams, usageTeams] = await Promise.all([
        this.fetchRemoteTeamsByFormat(mode, format).catch(() => []),
        this.fetchUsageTeamsByFormat(mode, format).catch(() => []),
      ])

      const merged: MetaTeamTemplate[] = []
      const usedIds = new Set<string>()
      for (const team of [...remoteTeams, ...usageTeams]) {
        if (usedIds.has(team.id)) continue
        usedIds.add(team.id)
        merged.push(team)
      }

      return merged
    })()

    this.dynamicTeamsCache.set(mode, task)
    return task
  }

  resetDynamicCache() {
    this.dynamicTeamsCache.clear()
  }
}

export const metaTemplateService = new MetaTemplateService()
