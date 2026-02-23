import {
  TEAM_ROLES,
  TYPE_KEYS,
  type PokemonEntry,
  type PokemonTypeKey,
  type ScoreWeights,
  type Team,
  type TeamAnalytics,
  type TeamMember,
} from '@/models/domain'
import { effectiveness, effectivenessAgainstDual } from '@/models/type-chart'

export interface MemberAnalytics {
  offenseCoverage: number
  defenseCoverage: number
  weaknessTypes: PokemonTypeKey[]
  resistanceTypes: PokemonTypeKey[]
  recommendations: string[]
  score: number
  threatScore?: number
  closerScore?: number
  defenseBaseScore?: number
  defenseTeraScore?: number
  roleFitScore?: number
  strengths?: string[]
  risks?: string[]
  actions?: string[]
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const values = Object.values(weights)
  const sum = values.reduce((acc, current) => acc + current, 0)
  if (sum <= 0) {
    return {
      offenseCoverage: 25,
      defenseCoverage: 25,
      roleBalance: 25,
      speedControl: 25,
    }
  }

  return {
    offenseCoverage: (weights.offenseCoverage / sum) * 100,
    defenseCoverage: (weights.defenseCoverage / sum) * 100,
    roleBalance: (weights.roleBalance / sum) * 100,
    speedControl: (weights.speedControl / sum) * 100,
  }
}

export function getMemberTypes(member: TeamMember, dexEntry?: PokemonEntry): PokemonTypeKey[] {
  if (member.teraType) return [member.teraType]
  return dexEntry?.types ?? ['normal']
}

export function calculateOffenseCoverage(moveTypes: PokemonTypeKey[]): number {
  if (moveTypes.length === 0) return 0

  const perTarget: number[] = TYPE_KEYS.map((defendingType) => {
    const best = moveTypes.reduce((max, moveType) => {
      return Math.max(max, effectiveness(moveType, defendingType))
    }, 0)

    if (best >= 2) return 1
    if (best === 1) return 0.6
    if (best === 0.5) return 0.3
    return 0
  })

  const average = perTarget.reduce((acc, current) => acc + current, 0) / perTarget.length
  return clampScore(average * 100)
}

export function calculateDefensiveCoverage(defendingTypes: PokemonTypeKey[]): {
  score: number
  weaknesses: PokemonTypeKey[]
  resistances: PokemonTypeKey[]
} {
  const weaknesses: PokemonTypeKey[] = []
  const resistances: PokemonTypeKey[] = []

  for (const attackType of TYPE_KEYS) {
    const factor = effectivenessAgainstDual(attackType, defendingTypes[0], defendingTypes[1])
    if (factor > 1) weaknesses.push(attackType)
    if (factor < 1) resistances.push(attackType)
  }

  const score = clampScore(((resistances.length + 1) / (weaknesses.length + 1)) * 50)

  return { score, weaknesses, resistances }
}

export function calculateMemberAnalytics(
  member: TeamMember,
  dexEntry: PokemonEntry | undefined,
  moveTypeResolver: (moveId: string) => PokemonTypeKey | null,
  weights: ScoreWeights,
): MemberAnalytics {
  const moveTypes = member.moves
    .map((moveId) => moveTypeResolver(moveId))
    .filter((type): type is PokemonTypeKey => Boolean(type))

  const offenseCoverage = calculateOffenseCoverage(moveTypes)
  const defendingTypes = getMemberTypes(member, dexEntry)
  const defensive = calculateDefensiveCoverage(defendingTypes)

  const normalized = normalizeWeights(weights)

  const score = clampScore(
    (offenseCoverage * normalized.offenseCoverage + defensive.score * normalized.defenseCoverage) /
      (normalized.offenseCoverage + normalized.defenseCoverage),
  )

  const recommendations: string[] = []
  if (offenseCoverage < 55) recommendations.push('Increase move type variety to improve pressure.')
  if (defensive.weaknesses.length >= 6) recommendations.push('Too many defensive weaknesses, consider tera or item changes.')
  if (!member.moves.includes('protect') && member.moves.some(Boolean)) {
    recommendations.push('Protect can improve tempo and positioning in many matchups.')
  }

  return {
    offenseCoverage,
    defenseCoverage: defensive.score,
    weaknessTypes: defensive.weaknesses,
    resistanceTypes: defensive.resistances,
    recommendations,
    score,
  }
}

export function calculateTeamAnalytics(
  team: Team,
  dexResolver: (pokemonId: string) => PokemonEntry | undefined,
  moveTypeResolver: (moveId: string) => PokemonTypeKey | null,
  weights: ScoreWeights,
): TeamAnalytics {
  const weaknessBucket = Object.fromEntries(TYPE_KEYS.map((type) => [type, 0])) as Record<PokemonTypeKey, number>
  const resistanceBucket = Object.fromEntries(TYPE_KEYS.map((type) => [type, 0])) as Record<PokemonTypeKey, number>

  const moveTypes = new Set<PokemonTypeKey>()
  const roleSet = new Set<string>()
  let speedSignals = 0

  for (const member of team.members) {
    if (!member.pokemonId) continue
    const dexEntry = dexResolver(member.pokemonId)
    const memberTypes = getMemberTypes(member, dexEntry)
    const defensive = calculateDefensiveCoverage(memberTypes)
    defensive.weaknesses.forEach((type) => (weaknessBucket[type] += 1))
    defensive.resistances.forEach((type) => (resistanceBucket[type] += 1))

    member.moves.forEach((moveId) => {
      const type = moveTypeResolver(moveId)
      if (type) moveTypes.add(type)
      if (moveId === 'tailwind' || moveId === 'icy-wind' || moveId === 'rapid-spin') {
        speedSignals += 1
      }
    })

    ;(member.roleTags.length ? member.roleTags : dexEntry?.roleTags ?? []).forEach((role) => roleSet.add(role))
    if ((member.roleTags.length ? member.roleTags : dexEntry?.roleTags ?? []).includes('speed-control')) {
      speedSignals += 1
    }
  }

  const offenseCoverage = calculateOffenseCoverage([...moveTypes])

  const totalWeaknessCount = Object.values(weaknessBucket).reduce((acc, current) => acc + current, 0)
  const totalResistanceCount = Object.values(resistanceBucket).reduce((acc, current) => acc + current, 0)
  const defenseCoverage = clampScore(((totalResistanceCount + 1) / (totalWeaknessCount + 1)) * 55)

  const roleBalance = clampScore((roleSet.size / TEAM_ROLES.length) * 100)
  const speedControl = clampScore(Math.min(100, speedSignals * 18))

  const normalized = normalizeWeights(weights)
  const totalScore = clampScore(
    (offenseCoverage * normalized.offenseCoverage +
      defenseCoverage * normalized.defenseCoverage +
      roleBalance * normalized.roleBalance +
      speedControl * normalized.speedControl) /
      100,
  )

  const keyAlerts: string[] = []
  const highSharedWeaknesses = TYPE_KEYS.filter((type) => weaknessBucket[type] >= 3)
  if (highSharedWeaknesses.length) {
    keyAlerts.push(`Shared weaknesses detected: ${highSharedWeaknesses.join(', ')}`)
  }
  if (speedControl < 40) {
    keyAlerts.push('Low speed control detected.')
  }
  if (offenseCoverage < 50) {
    keyAlerts.push('Limited offensive coverage across team moves.')
  }

  return {
    totalScore,
    offenseCoverage,
    defenseCoverage,
    roleBalance,
    speedControl,
    weaknesses: weaknessBucket,
    resistances: resistanceBucket,
    keyAlerts,
  }
}
