import type {
  BattleMode,
  MoveEntry,
  PokemonEntry,
  Team,
  TeamMember,
  TeamRole,
  PokemonTypeKey,
} from '@/models/domain'
import type {
  EvaluateThreatContext,
  MemberThreatCheck,
  ThreatProfile,
  ThreatResponseRow,
  ThreatResponseStatus,
  ThreatResponseSummary,
} from '@/models/threats'
import { calculateBattleStats } from '@/utils/stat-calc'
import { calculateFavorableSpeedBenchmark } from '@/utils/speed-comparison'
import { effectivenessAgainstDual } from '@/models/type-chart'
import vgcThreatsRaw from '@/data/meta-threats.vgc.json'
import singlesThreatsRaw from '@/data/meta-threats.singles.json'

const MIN_PRESSURE_POWER = 70
const SPEED_CONTROL_MOVES = new Set([
  'tailwind',
  'trick-room',
  'icy-wind',
  'electroweb',
  'thunder-wave',
  'bulldoze',
  'string-shot',
  'quash',
])

const THREATS_BY_MODE: Record<BattleMode, ThreatProfile[]> = {
  vgc: vgcThreatsRaw as ThreatProfile[],
  singles: singlesThreatsRaw as ThreatProfile[],
}

type EvaluateThreatAgainstTeamParams = {
  mode: BattleMode
  team: Team
  threat: ThreatProfile
  dexResolver: (pokemonId: string) => PokemonEntry | undefined
  moveResolver: (moveId: string) => MoveEntry | undefined
  getThreatUsage?: (pokemonId: string) => number
}

type EvaluateThreatResponsesParams = Omit<EvaluateThreatAgainstTeamParams, 'threat'>

function battleLevelForMode(mode: BattleMode): number {
  return mode === 'singles' ? 100 : 50
}

function statusRank(status: ThreatResponseStatus): number {
  if (status === 'danger') return 0
  if (status === 'warning') return 1
  return 2
}

function hasSpeedControlTools(member: TeamMember, roles: TeamRole[]): boolean {
  if (roles.includes('speed-control')) return true
  return member.moves.some((moveId) => SPEED_CONTROL_MOVES.has(moveId))
}

function memberDefendingTypes(
  member: TeamMember,
  dexEntry: PokemonEntry | undefined,
): [PokemonTypeKey, PokemonTypeKey?] {
  if (member.teraType) return [member.teraType, undefined]
  return [dexEntry?.types[0] ?? 'normal', dexEntry?.types[1]]
}

function normalizeThreatTypes(threat: ThreatProfile, dexEntry?: PokemonEntry): [PokemonTypeKey, PokemonTypeKey?] {
  if (threat.defensiveTypes[0]) return [threat.defensiveTypes[0], threat.defensiveTypes[1]]
  if (dexEntry) return [dexEntry.types[0] ?? 'normal', dexEntry.types[1]]
  return ['normal', undefined]
}

function hasSevereWeakness(
  threatMoveTypes: PokemonTypeKey[],
  memberTypeA: PokemonTypeKey,
  memberTypeB?: PokemonTypeKey,
): boolean {
  return threatMoveTypes.some((attackType) => effectivenessAgainstDual(attackType, memberTypeA, memberTypeB) >= 2)
}

function hasStrongResist(
  threatMoveTypes: PokemonTypeKey[],
  memberTypeA: PokemonTypeKey,
  memberTypeB?: PokemonTypeKey,
): boolean {
  return threatMoveTypes.some((attackType) => effectivenessAgainstDual(attackType, memberTypeA, memberTypeB) <= 0.5)
}

function memberFinalSpeed(mode: BattleMode, member: TeamMember, dexEntry: PokemonEntry): number {
  const level = battleLevelForMode(mode)
  const stats = calculateBattleStats(dexEntry.baseStats, member.ivs, member.evs, level, member.natureId)
  const multiplier = member.itemId === 'choice-scarf' ? 1.5 : 1
  return Math.floor(stats.spe * multiplier)
}

function hasPressureAnswer(
  member: TeamMember,
  threatDefTypeA: PokemonTypeKey,
  threatDefTypeB: PokemonTypeKey | undefined,
  moveResolver: (moveId: string) => MoveEntry | undefined,
): boolean {
  for (const moveId of member.moves.filter(Boolean)) {
    const move = moveResolver(moveId)
    if (!move) continue
    if (move.category === 'status') continue
    if (move.power < MIN_PRESSURE_POWER) continue
    const factor = effectivenessAgainstDual(move.type, threatDefTypeA, threatDefTypeB)
    if (factor >= 2) return true
  }
  return false
}

function classifyMemberCheck(params: {
  defensiveAnswer: boolean
  speedAnswer: boolean
  pressureAnswer: boolean
  utilityAnswer: boolean
  severeWeakness: boolean
}): { level: 'solid' | 'soft' | 'none'; score: number } {
  const { defensiveAnswer, speedAnswer, pressureAnswer, utilityAnswer, severeWeakness } = params
  const anySignal = defensiveAnswer || speedAnswer || pressureAnswer || utilityAnswer
  if (!anySignal) return { level: 'none', score: 0 }

  const defensiveSupport = !severeWeakness || defensiveAnswer
  const solid =
    (defensiveAnswer && (pressureAnswer || speedAnswer || utilityAnswer)) ||
    (utilityAnswer && defensiveSupport && (pressureAnswer || speedAnswer))

  let score = 0
  if (defensiveAnswer) score += 2.2
  if (pressureAnswer) score += 1.6
  if (speedAnswer) score += 1.2
  if (utilityAnswer) score += 1.4
  if (severeWeakness) score -= 1.3
  if (solid) score += 2
  else score += 0.7

  return { level: solid ? 'solid' : 'soft', score: Math.max(0, score) }
}

export function threatStatusFromCounts(solidCount: number, softCount: number): ThreatResponseStatus {
  if (solidCount >= 2) return 'good'
  if (solidCount === 1 || softCount >= 2) return 'warning'
  return 'danger'
}

export function getThreatProfiles(mode: BattleMode): ThreatProfile[] {
  return THREATS_BY_MODE[mode].map((entry) => ({ ...entry }))
}

export function evaluateThreatAgainstTeam(
  params: EvaluateThreatAgainstTeamParams,
): ThreatResponseRow {
  const { mode, team, threat, dexResolver, moveResolver, getThreatUsage } = params
  const threatDexEntry = threat.pokemonId ? dexResolver(threat.pokemonId) : undefined
  const [threatDefTypeA, threatDefTypeB] = normalizeThreatTypes(threat, threatDexEntry)
  const threatMoveTypes = threat.threatMoveTypes.length > 0
    ? threat.threatMoveTypes
    : threatDexEntry?.types ?? []
  const expectedSpeed = threat.expectedSpeed > 0
    ? threat.expectedSpeed
    : threatDexEntry ? calculateFavorableSpeedBenchmark(threatDexEntry) : Number.POSITIVE_INFINITY
  const usage = threat.pokemonId ? getThreatUsage?.(threat.pokemonId) ?? 0 : 0

  const checks: MemberThreatCheck[] = []

  for (const member of team.members) {
    if (!member.pokemonId) continue
    const dexEntry = dexResolver(member.pokemonId)
    if (!dexEntry) continue

    const memberRoles = member.roleTags.length > 0 ? member.roleTags : dexEntry.roleTags
    const [memberTypeA, memberTypeB] = memberDefendingTypes(member, dexEntry)

    const severeWeakness = hasSevereWeakness(threatMoveTypes, memberTypeA, memberTypeB)
    const defensiveAnswer = hasStrongResist(threatMoveTypes, memberTypeA, memberTypeB) && !severeWeakness
    const speedAnswer =
      memberFinalSpeed(mode, member, dexEntry) >= expectedSpeed ||
      hasSpeedControlTools(member, memberRoles)
    const pressureAnswer = hasPressureAnswer(member, threatDefTypeA, threatDefTypeB, moveResolver)
    const utilityAnswer = member.moves.some((moveId) => threat.utilityCountersAny.includes(moveId))

    const classified = classifyMemberCheck({
      defensiveAnswer,
      speedAnswer,
      pressureAnswer,
      utilityAnswer,
      severeWeakness,
    })

    checks.push({
      slot: member.slot,
      pokemonId: member.pokemonId,
      pokemonName: dexEntry.name,
      level: classified.level,
      score: classified.score,
      signals: {
        defensiveAnswer,
        speedAnswer,
        pressureAnswer,
        utilityAnswer,
      },
    })
  }

  const solidCount = checks.filter((entry) => entry.level === 'solid').length
  const softCount = checks.filter((entry) => entry.level === 'soft').length
  const status = threatStatusFromCounts(solidCount, softCount)
  const topResponders = checks
    .filter((entry) => entry.level !== 'none')
    .sort((a, b) => b.score - a.score || a.slot - b.slot)
    .slice(0, 3)
    .map((entry) => ({
      slot: entry.slot,
      pokemonId: entry.pokemonId,
      pokemonName: entry.pokemonName,
      level: entry.level,
    }))

  return {
    threatId: threat.id,
    name: threat.name,
    kind: threat.kind,
    pokemonId: threat.pokemonId,
    solidCount,
    softCount,
    status,
    priority: threat.priority,
    usage,
    topResponders,
  }
}

export function evaluateThreatResponses(
  params: EvaluateThreatResponsesParams,
): ThreatResponseRow[] {
  const { mode, team, dexResolver, moveResolver, getThreatUsage } = params
  const profiles = getThreatProfiles(mode)
  return profiles
    .map((threat) =>
      evaluateThreatAgainstTeam({
        mode,
        team,
        threat,
        dexResolver,
        moveResolver,
        getThreatUsage,
      }),
    )
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.usage - a.usage ||
        a.priority - b.priority ||
        a.name.localeCompare(b.name),
    )
}

export function summarizeThreatResponses(rows: ThreatResponseRow[]): ThreatResponseSummary {
  const total = rows.length
  const goodCount = rows.filter((row) => row.status === 'good').length
  const warningCount = rows.filter((row) => row.status === 'warning').length
  const dangerCount = rows.filter((row) => row.status === 'danger').length
  const goodPercent = total > 0 ? Math.round((goodCount / total) * 100) : 0

  return {
    total,
    goodCount,
    warningCount,
    dangerCount,
    goodPercent,
    criticalThreats: rows.filter((row) => row.status === 'danger').slice(0, 3),
  }
}

export function evaluateThreatSummary(
  mode: BattleMode,
  team: Team,
  dexResolver: (pokemonId: string) => PokemonEntry | undefined,
  moveResolver: (moveId: string) => MoveEntry | undefined,
  context: EvaluateThreatContext = { mode },
): { rows: ThreatResponseRow[]; summary: ThreatResponseSummary } {
  const rows = evaluateThreatResponses({
    mode,
    team,
    dexResolver,
    moveResolver,
    getThreatUsage: context.getThreatUsage,
  })
  return {
    rows,
    summary: summarizeThreatResponses(rows),
  }
}
