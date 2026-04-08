import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import {
  DEFAULT_WEIGHTS,
  TYPE_KEYS,
  type BattleMode,
  type MoveEntry,
  type PokemonEntry,
  type PokemonTypeKey,
  type ScoreWeights,
  type Team,
  type TeamMember,
} from '@/models/domain'
import type { ThreatResponseRow, ThreatResponseSummary } from '@/models/threats'
import { effectiveness, effectivenessAgainstDual } from '@/models/type-chart'
import { calculateBattleStats } from '@/utils/stat-calc'
import { useDexStore } from './dex'
import { useMetaUsageStore } from './meta-usage'
import { useTeamStore } from './team'
import { useUiStore } from './ui'
import {
  calculateMemberAnalytics,
  normalizeWeights,
  type MemberAnalytics,
} from '@/utils/analytics'
import { evaluateThreatSummary } from '@/utils/threat-response'

export type ScoreMetricKey = keyof ScoreWeights
export type WeightPresetKey = 'balanced' | 'offense' | 'defense' | 'speed'
export type SpeedBucketKey = 'slow' | 'mid' | 'fast' | 'veryFast'
export type SpeedProfileKey = SpeedBucketKey | 'mixed' | 'empty'
export type TeraDependencyLevel = 'unassigned' | 'autonomous' | 'improves' | 'critical'
export type PressureBand = 'none' | 'low' | 'medium' | 'high' | 'na'
export type TeraDependencyReason =
  | 'missing-tera'
  | 'none'
  | 'offense-spike'
  | 'defense-patch'
  | 'defense-critical'
  | 'mixed'

export interface TeamSpeedMapMember {
  slot: TeamMember['slot']
  pokemonId: string
  pokemonName: string
  baseSpeed: number
  finalSpeed: number
  effectiveSpeed: number
}

export interface TeamSpeedMapBucket {
  key: SpeedBucketKey
  count: number
  percent: number
  members: TeamSpeedMapMember[]
}

export interface TeamSpeedMap {
  level: number
  total: number
  profile: SpeedProfileKey
  buckets: Record<SpeedBucketKey, TeamSpeedMapBucket>
  hasTailwind: boolean
  hasTrickRoom: boolean
  speedControlCount: number
}

export interface TeamTeraDependencyMember {
  slot: TeamMember['slot']
  pokemonId: string
  pokemonName: string
  teraType?: PokemonTypeKey
  level: TeraDependencyLevel
  reason: TeraDependencyReason
  score: number | null
  hasTeraStabMove: boolean
  baseWeakCount: number
  teraWeakCount: number
  baseSevereCount: number
  teraSevereCount: number
}

export interface TeamTeraDependencySummary {
  total: number
  unassignedCount: number
  autonomousCount: number
  improvesCount: number
  criticalCount: number
  members: TeamTeraDependencyMember[]
  criticalMembers: TeamTeraDependencyMember[]
}

export interface OffensivePressureMember {
  slot: TeamMember['slot']
  pokemonId: string
  pokemonName: string
  isWincon: boolean
  isCloser: boolean
  isWinconCandidate: boolean
  isCloserCandidate: boolean
  setupTier: 'none' | 'minor' | 'major'
  isTRCleaner: boolean
  hasImmediateBoost: boolean
  hasSetup: boolean
  hasSpread: boolean
  hasPivot: boolean
  hasRedirection: boolean
  hasPriorityDamage: boolean
  stabCount: number
  damagingMoves: number
  highPowerMoves: number
  utilityStatusCount: number
  speedValue: number
  speedBenchmark: number
  speedDelta: number
  score: number
  threatScore: number
  winconScore: number
  closerScore: number
  contributions: Array<{
    key:
      | 'damageCoreVgc2'
      | 'damageCoreVgc1'
      | 'damageCoreVgc0'
      | 'damageCoreSingles3'
      | 'damageCoreSingles2setup'
      | 'damageCoreSinglesLow'
      | 'powerHi2'
      | 'powerHi1'
      | 'powerSpreadVgc'
      | 'powerStab'
      | 'turnFastVgc'
      | 'turnNearTailwindVgc'
      | 'turnPriority'
      | 'turnTRCleaner'
      | 'turnSlowNoTR'
      | 'turnFastSingles'
      | 'turnScarfSingles'
      | 'setupMajor'
      | 'setupMinor'
      | 'setupBodyPress'
      | 'boostImmediate'
      | 'consistencyProtectVgc'
      | 'consistencyRecoverySingles'
      | 'utilityBloatPenalty'
      | 'planSetup'
      | 'planConsistency'
      | 'planEnable'
      | 'planTerrainWeather'
      | 'closeTurnOrderVgc'
      | 'closeTurnOrderSingles'
      | 'closeHi2'
      | 'closeSimpleButton'
      | 'closeProtectVgc'
      | 'frictionSetupNoEnable'
      | 'frictionUtilityLowAtk'
      | 'frictionChoiceLock'
      | 'frictionAccuracyRisk'
      | 'frictionRecoilRisk'
      | 'frictionSelfDropRisk'
      | 'frictionOneButton'
    value: number
  }>
}

export interface OffensivePressureSummary {
  total: number
  winconCount: number
  closerCount: number
  spreadUsers: number
  spreadPressure: PressureBand
  pivotUsers: number
  pivoting: PressureBand
  redirectionUsers: number
  redirection: PressureBand
  members: OffensivePressureMember[]
  winconMembers: OffensivePressureMember[]
  closerMembers: OffensivePressureMember[]
}

export interface TeamScoreBreakdownRow {
  key: ScoreMetricKey
  metricValue: number
  weight: number
  weightedPoints: number
}

interface TeamAnalyticsExtended {
  totalScore: number
  offenseCoverage: number
  defenseCoverage: number
  roleBalance: number
  speedControl: number
  weaknesses: Record<PokemonTypeKey, number>
  resistances: Record<PokemonTypeKey, number>
  keyAlerts: string[]
  matchupScore: number
  matchupOffenseScore: number
  matchupDefenseBaseScore: number
  matchupDefenseTeraScore: number
  planScore: number
  tempoScore: number
  resourcesScore: number
  resourcesRisk: number
  baseWeaknesses: Record<PokemonTypeKey, number>
  baseResistances: Record<PokemonTypeKey, number>
  pillarDiagnostics: {
    plan: string
    tempo: string
    matchups: string
    resources: string
  }
}

interface ModeCacheEntry<T> {
  key: string
  value: T
}

const WEIGHT_PRESETS: Record<WeightPresetKey, ScoreWeights> = {
  balanced: {
    offenseCoverage: 25,
    defenseCoverage: 25,
    roleBalance: 25,
    speedControl: 25,
  },
  offense: {
    offenseCoverage: 45,
    defenseCoverage: 20,
    roleBalance: 20,
    speedControl: 15,
  },
  defense: {
    offenseCoverage: 20,
    defenseCoverage: 45,
    roleBalance: 20,
    speedControl: 15,
  },
  speed: {
    offenseCoverage: 20,
    defenseCoverage: 20,
    roleBalance: 20,
    speedControl: 40,
  },
}

const SPEED_CONTROL_MOVES = new Set([
  'tailwind',
  'trick-room',
  'icy-wind',
  'electroweb',
  'thunder-wave',
  'bulldoze',
  'string-shot',
  'quash',
  'scary-face',
])

const MAJOR_SETUP_MOVE_IDS = new Set([
  'swords-dance',
  'nasty-plot',
  'dragon-dance',
  'quiver-dance',
  'shell-smash',
  'belly-drum',
  'shift-gear',
  'agility',
])

const MINOR_SETUP_MOVE_IDS = new Set([
  'calm-mind',
  'bulk-up',
  'work-up',
  'howl',
  'trailblaze',
  'curse',
])

const BODY_PRESS_SETUP_HELPER_IDS = new Set(['iron-defense', 'curse'])

const OFFENSIVE_PRIORITY_MOVE_IDS = new Set([
  'sucker-punch',
  'extreme-speed',
  'grassy-glide',
  'jet-punch',
  'aqua-jet',
  'ice-shard',
  'shadow-sneak',
  'mach-punch',
  'bullet-punch',
  'accelerock',
  'vacuum-wave',
  'thunderclap',
  'first-impression',
])

const SPREAD_MOVE_IDS = new Set([
  'rock-slide',
  'earthquake',
  'heat-wave',
  'dazzling-gleam',
  'snarl',
  'icy-wind',
  'muddy-water',
  'discharge',
  'blizzard',
  'eruption',
  'surf',
  'hyper-voice',
  'make-it-rain',
  'bleakwind-storm',
  'sludge-wave',
  'boomburst',
])

const PIVOT_MOVE_IDS = new Set([
  'u-turn',
  'volt-switch',
  'flip-turn',
  'parting-shot',
  'teleport',
  'baton-pass',
  'chilly-reception',
])

const REDIRECTION_MOVE_IDS = new Set(['follow-me', 'rage-powder'])

const PROTECT_MOVE_IDS = new Set(['protect'])
const RECOVERY_MOVE_IDS = new Set([
  'recover',
  'roost',
  'slack-off',
  'soft-boiled',
  'moonlight',
  'synthesis',
  'morning-sun',
  'shore-up',
  'heal-order',
  'strength-sap',
  'milk-drink',
  'wish',
  'rest',
  'drain-punch',
  'giga-drain',
  'bitter-blade',
  'parabolic-charge',
])

const IMMEDIATE_BOOST_ITEM_IDS = new Set([
  'choice-band',
  'choice-specs',
  'choice-scarf',
  'life-orb',
  'booster-energy',
  'expert-belt',
  'muscle-band',
  'wise-glasses',
  'mystic-water',
  'charcoal',
  'magnet',
  'black-glasses',
  'spell-tag',
  'miracle-seed',
])
const CHOICE_LOCK_ITEM_IDS = new Set(['choice-band', 'choice-specs', 'choice-scarf'])

const SCREEN_MOVE_IDS = new Set(['reflect', 'light-screen', 'aurora-veil'])
const FAKE_OUT_MOVE_IDS = new Set(['fake-out'])
const WIDE_GUARD_MOVE_IDS = new Set(['wide-guard'])
const TERRAIN_MOVE_IDS = new Set(['electric-terrain', 'grassy-terrain', 'misty-terrain', 'psychic-terrain'])
const WEATHER_MOVE_IDS = new Set(['rain-dance', 'sunny-day', 'sandstorm', 'snowscape', 'hail'])
const WEATHER_ABILITY_IDS = new Set(['drizzle', 'drought', 'sand-stream', 'snow-warning'])
const TERRAIN_ABILITY_IDS = new Set(['electric-surge', 'grassy-surge', 'misty-surge', 'psychic-surge'])
const INTIMIDATE_ABILITY_IDS = new Set(['intimidate'])

const RECOIL_OR_HP_COST_MOVE_IDS = new Set([
  'head-smash',
  'double-edge',
  'flare-blitz',
  'wild-charge',
  'wave-crash',
  'wood-hammer',
  'brave-bird',
  'take-down',
  'volt-tackle',
  'steel-beam',
  'chloroblast',
  'mind-blown',
  'head-charge',
])

const SELF_DROP_MOVE_IDS = new Set([
  'close-combat',
  'draco-meteor',
  'overheat',
  'leaf-storm',
  'superpower',
  'v-create',
  'armor-cannon',
  'make-it-rain',
])

const NON_BLOAT_UTILITY_MOVE_IDS = new Set([
  ...SPEED_CONTROL_MOVES,
  ...REDIRECTION_MOVE_IDS,
  ...SCREEN_MOVE_IDS,
  ...PROTECT_MOVE_IDS,
  'wide-guard',
  'quick-guard',
  'ally-switch',
  'fake-out',
  'taunt',
  'encore',
  'haze',
  'spore',
  'rage-powder',
  'follow-me',
])

const TYPE_THREAT_WEIGHTS: Record<BattleMode, Partial<Record<PokemonTypeKey, number>>> = {
  vgc: {
    rock: 1.25,
    fire: 1.2,
    fairy: 1.15,
    water: 1.1,
    grass: 1.08,
    dark: 1.08,
    normal: 1.06,
    electric: 1.1,
    ground: 1.12,
  },
  singles: {
    ice: 1.24,
    fairy: 1.18,
    ground: 1.16,
    fighting: 1.08,
    dark: 1.08,
    water: 1.06,
    steel: 1.04,
    ghost: 1.06,
  },
}

function battleLevelForMode(mode: BattleMode): number {
  return mode === 'singles' ? 100 : 50
}

function speedBucketFromBase(baseSpeed: number): SpeedBucketKey {
  if (baseSpeed < 70) return 'slow'
  if (baseSpeed <= 100) return 'mid'
  if (baseSpeed <= 130) return 'fast'
  return 'veryFast'
}

function defaultSpeedMapBucket(key: SpeedBucketKey): TeamSpeedMapBucket {
  return {
    key,
    count: 0,
    percent: 0,
    members: [],
  }
}

function weightedTypeSnapshot(
  mode: BattleMode,
  typeA: PokemonTypeKey,
  typeB?: PokemonTypeKey,
): {
  weakCount: number
  severeCount: number
  quadCount: number
  resistCount: number
  immunityCount: number
} {
  let weakCount = 0
  let severeCount = 0
  let quadCount = 0
  let resistCount = 0
  let immunityCount = 0

  for (const attackType of TYPE_KEYS) {
    const factor = effectivenessAgainstDual(attackType, typeA, typeB)
    const weight = TYPE_THREAT_WEIGHTS[mode][attackType] ?? 1
    if (factor > 1) weakCount += weight
    if (factor >= 2) severeCount += weight
    if (factor >= 4) quadCount += weight
    if (factor < 1) resistCount += weight
    if (factor === 0) immunityCount += weight
  }

  return {
    weakCount,
    severeCount,
    quadCount,
    resistCount,
    immunityCount,
  }
}

function hasDamagingMoveOfType(
  member: TeamMember,
  teraType: PokemonTypeKey,
  dexStore: ReturnType<typeof useDexStore>,
): boolean {
  return member.moves
    .filter(Boolean)
    .some((moveId) => {
      const move = dexStore.getMove(moveId)
      return Boolean(move && move.category !== 'status' && move.type === teraType)
    })
}

function teraLevelPriority(level: TeraDependencyLevel): number {
  if (level === 'critical') return 3
  if (level === 'improves') return 2
  if (level === 'autonomous') return 1
  return 0
}

function pressureBandFromCount(count: number, total: number): PressureBand {
  if (total <= 0) return 'none'
  if (count <= 0) return 'none'
  const ratio = count / total
  if (count >= 3 || ratio >= 0.5) return 'high'
  if (count >= 2 || ratio >= 0.34) return 'medium'
  return 'low'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampScore(value: number): number {
  return clampNumber(Math.round(value), 0, 100)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function offensiveSpeedBenchmark(mode: BattleMode): number {
  const level = battleLevelForMode(mode)
  return calculateBattleStats(
    { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 100 },
    { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 252 },
    level,
    'hardy',
  ).spe
}

interface TeamEnableSnapshot {
  hasTailwind: boolean
  hasTrickRoom: boolean
  hasRedirection: boolean
  hasScreens: boolean
  hasTerrainWeather: boolean
  hasSpeedControl: boolean
  hasFakeOut: boolean
  hasWideGuard: boolean
  hasIntimidate: boolean
  hardEnableCount: number
  softEnableCount: number
  hasHardEnable: boolean
  hasSoftEnable: boolean
}

function countSharedTypes(
  moveType: PokemonTypeKey,
  baseTypes: PokemonTypeKey[],
  teraType?: PokemonTypeKey,
): number {
  let matches = baseTypes.includes(moveType) ? 1 : 0
  if (teraType && teraType === moveType && !baseTypes.includes(moveType)) {
    matches += 1
  }
  return matches
}

function estimatedEffectivePower(
  move: MoveEntry,
  mode: BattleMode,
  params: {
    hasBodyPressSetup: boolean
    highDefenseProfile: boolean
  },
): number {
  if (move.category === 'status') return 0
  let value = Math.max(0, move.power ?? 0)

  if (move.id === 'body-press') {
    if (params.hasBodyPressSetup || params.highDefenseProfile) return 95
    return 80
  }

  const fixedHitMultipliers: Record<string, number> = {
    'surging-strikes': 3,
    'triple-axel': 3,
    'triple-kick': 3,
    'population-bomb': 4,
    'scale-shot': 3,
  }
  if (fixedHitMultipliers[move.id]) {
    value *= fixedHitMultipliers[move.id]
  }

  const variableEstimates: Record<string, number> = {
    'electro-ball': 85,
    'gyro-ball': 90,
    'water-spout': 95,
    'eruption': 95,
    'flail': 90,
    'reversal': 90,
    'stored-power': 85,
    'power-trip': 85,
  }
  if (variableEstimates[move.id]) {
    value = variableEstimates[move.id]
  }

  if (mode === 'vgc' && SPREAD_MOVE_IDS.has(move.id)) {
    value += 10
  }
  return value
}

function detectTeamEnable(mode: BattleMode, members: TeamMember[]): TeamEnableSnapshot {
  const moveIds = members.flatMap((member) => member.moves.filter(Boolean))
  const abilityIds = members.map((member) => member.abilityId).filter(Boolean)

  const hasTailwind = moveIds.includes('tailwind')
  const hasTrickRoom = moveIds.includes('trick-room')
  const hasRedirection = moveIds.some((moveId) => REDIRECTION_MOVE_IDS.has(moveId))
  const hasScreens = moveIds.some((moveId) => SCREEN_MOVE_IDS.has(moveId))
  const hasTerrainWeather =
    moveIds.some((moveId) => TERRAIN_MOVE_IDS.has(moveId) || WEATHER_MOVE_IDS.has(moveId)) ||
    abilityIds.some((abilityId) => TERRAIN_ABILITY_IDS.has(abilityId) || WEATHER_ABILITY_IDS.has(abilityId))
  const hasSpeedControl =
    hasTailwind || hasTrickRoom || moveIds.some((moveId) => SPEED_CONTROL_MOVES.has(moveId))
  const hasFakeOut = moveIds.some((moveId) => FAKE_OUT_MOVE_IDS.has(moveId))
  const hasWideGuard = moveIds.some((moveId) => WIDE_GUARD_MOVE_IDS.has(moveId))
  const hasIntimidate = abilityIds.some((abilityId) => INTIMIDATE_ABILITY_IDS.has(abilityId))
  const hardEnableCount = [
    hasRedirection,
    hasScreens,
    hasFakeOut,
    hasWideGuard,
    hasIntimidate,
  ].filter(Boolean).length
  const softEnableCount = [hasTailwind, hasTrickRoom, hasSpeedControl, hasTerrainWeather].filter(
    Boolean,
  ).length
  const hasHardEnable = hardEnableCount > 0
  const hasSoftEnable = !hasHardEnable && softEnableCount > 0

  if (mode === 'singles') {
    return {
      hasTailwind,
      hasTrickRoom,
      hasRedirection: false,
      hasScreens,
      hasTerrainWeather,
      hasSpeedControl,
      hasFakeOut,
      hasWideGuard,
      hasIntimidate,
      hardEnableCount,
      softEnableCount,
      hasHardEnable,
      hasSoftEnable,
    }
  }

  return {
    hasTailwind,
    hasTrickRoom,
    hasRedirection,
    hasScreens,
    hasTerrainWeather,
    hasSpeedControl,
    hasFakeOut,
    hasWideGuard,
    hasIntimidate,
    hardEnableCount,
    softEnableCount,
    hasHardEnable,
    hasSoftEnable,
  }
}

interface TeamDefenseTypeProfileEntry {
  weak2: number
  weak4: number
  res: number
  imm: number
}

interface TeamDefenseSnapshot {
  score: number
  riskTotal: number
  weaknesses: Record<PokemonTypeKey, number>
  resistances: Record<PokemonTypeKey, number>
  sharedWeaknesses: PokemonTypeKey[]
  severeSharedWeaknesses: PokemonTypeKey[]
}

interface TeamOffenseSnapshot {
  score: number
}

const SUPPORT_ROLE_MOVE_IDS = new Set([
  'tailwind',
  'trick-room',
  'fake-out',
  'follow-me',
  'rage-powder',
  'icy-wind',
  'electroweb',
  'thunder-wave',
  'taunt',
  'encore',
  'reflect',
  'light-screen',
  'aurora-veil',
  'wide-guard',
  'quick-guard',
  'parting-shot',
  'snarl',
])

const WALL_ROLE_MOVE_IDS = new Set([
  'recover',
  'roost',
  'slack-off',
  'soft-boiled',
  'moonlight',
  'synthesis',
  'morning-sun',
  'shore-up',
  'wish',
  'protect',
  'iron-defense',
  'curse',
])

function emptyTypeCounter(): Record<PokemonTypeKey, number> {
  return Object.fromEntries(TYPE_KEYS.map((type) => [type, 0])) as Record<PokemonTypeKey, number>
}

function emptyDefenseTypeProfile(): Record<PokemonTypeKey, TeamDefenseTypeProfileEntry> {
  return Object.fromEntries(
    TYPE_KEYS.map((type) => [type, { weak2: 0, weak4: 0, res: 0, imm: 0 }]),
  ) as Record<PokemonTypeKey, TeamDefenseTypeProfileEntry>
}

function offenseTierFromMultiplier(multiplier: number): number {
  if (multiplier >= 2) return 1
  if (multiplier === 1) return 0.4
  if (multiplier > 0 && multiplier < 1) return 0.15
  return 0
}

function moveQualityForMatchup(
  move: MoveEntry,
  mode: BattleMode,
  member: TeamMember,
  pokemon: PokemonEntry,
): number {
  if (move.category === 'status') return 0
  const hasBodyPressSetup =
    member.moves.includes('body-press') &&
    member.moves.some((moveId) => BODY_PRESS_SETUP_HELPER_IDS.has(moveId))
  const effectivePower = estimatedEffectivePower(move, mode, {
    hasBodyPressSetup,
    highDefenseProfile: pokemon.baseStats.def >= 120,
  })
  let quality = 1
  if (pokemon.types.includes(move.type) || member.teraType === move.type) quality += 0.2
  if (effectivePower >= 85) quality += 0.15
  if ((move.accuracy ?? 100) < 85) quality -= 0.2
  if (mode === 'vgc' && SPREAD_MOVE_IDS.has(move.id)) quality += 0.15
  return clampNumber(quality, 0.55, 1.4)
}

function calculateTeamOffenseSnapshot(
  mode: BattleMode,
  team: Team,
  dexResolver: (pokemonId: string) => PokemonEntry | undefined,
  moveResolver: (moveId: string) => MoveEntry | undefined,
): TeamOffenseSnapshot {
  const evaluatedMoves: Array<{ type: PokemonTypeKey; quality: number }> = []

  for (const member of team.members) {
    if (!member.pokemonId) continue
    const pokemon = dexResolver(member.pokemonId)
    if (!pokemon) continue
    for (const moveId of member.moves.filter(Boolean)) {
      const move = moveResolver(moveId)
      if (!move || move.category === 'status') continue
      evaluatedMoves.push({
        type: move.type,
        quality: moveQualityForMatchup(move, mode, member, pokemon),
      })
    }
  }

  if (evaluatedMoves.length === 0) return { score: 0 }

  const perTarget = TYPE_KEYS.map((targetType) => {
    let best = 0
    for (const move of evaluatedMoves) {
      const multiplier = effectiveness(move.type, targetType)
      const baseTier = offenseTierFromMultiplier(multiplier)
      const weighted = clampNumber(baseTier * move.quality, 0, 1.35)
      if (weighted > best) best = weighted
    }
    return best
  })

  const averageTier = average(perTarget)
  return {
    score: clampScore((averageTier / 1.1) * 100),
  }
}

function calculateTeamDefenseSnapshot(
  mode: BattleMode,
  team: Team,
  dexResolver: (pokemonId: string) => PokemonEntry | undefined,
  useTera: boolean,
): TeamDefenseSnapshot {
  const weaknesses = emptyTypeCounter()
  const resistances = emptyTypeCounter()
  const profiles = emptyDefenseTypeProfile()
  let activeMembers = 0

  for (const member of team.members) {
    if (!member.pokemonId) continue
    const pokemon = dexResolver(member.pokemonId)
    if (!pokemon) continue
    activeMembers += 1
    const baseA = pokemon.types[0] ?? 'normal'
    const baseB = pokemon.types[1]
    const typeA = useTera && member.teraType ? member.teraType : baseA
    const typeB = useTera && member.teraType ? undefined : baseB

    for (const attackType of TYPE_KEYS) {
      const factor = effectivenessAgainstDual(attackType, typeA, typeB)
      if (factor >= 4) {
        profiles[attackType].weak4 += 1
        weaknesses[attackType] += 1
      } else if (factor > 1) {
        profiles[attackType].weak2 += 1
        weaknesses[attackType] += 1
      }

      if (factor === 0) {
        profiles[attackType].imm += 1
        resistances[attackType] += 1
      } else if (factor < 1) {
        profiles[attackType].res += 1
        resistances[attackType] += 1
      }
    }
  }

  const sharedWeaknesses: PokemonTypeKey[] = []
  const severeSharedWeaknesses: PokemonTypeKey[] = []
  let riskTotal = 0
  for (const attackType of TYPE_KEYS) {
    const profile = profiles[attackType]
    const weakCount = profile.weak2 + profile.weak4
    const risk =
      1.0 * profile.weak2 +
      2.4 * profile.weak4 -
      0.6 * profile.res -
      1.2 * profile.imm
    riskTotal += Math.max(0, risk)
    if (weakCount >= 3) sharedWeaknesses.push(attackType)
    if (profile.weak4 >= 1 && weakCount >= 2) severeSharedWeaknesses.push(attackType)
  }

  const normalizedRisk = riskTotal / Math.max(1, activeMembers * TYPE_KEYS.length)
  const score = clampScore(100 - normalizedRisk * (mode === 'vgc' ? 150 : 135))

  return {
    score,
    riskTotal,
    weaknesses,
    resistances,
    sharedWeaknesses,
    severeSharedWeaknesses,
  }
}

function inferRoleSignalsForSet(
  member: TeamMember,
  pokemon: PokemonEntry | undefined,
  moveResolver: (moveId: string) => MoveEntry | undefined,
): Set<string> {
  const roles = new Set<string>()
  const moveIds = member.moves.filter(Boolean)
  const moveEntries = moveIds
    .map((moveId) => moveResolver(moveId))
    .filter((entry): entry is MoveEntry => Boolean(entry))
  const damagingCount = moveEntries.filter((entry) => entry.category !== 'status').length
  const setupCount = moveIds.filter(
    (moveId) => MAJOR_SETUP_MOVE_IDS.has(moveId) || MINOR_SETUP_MOVE_IDS.has(moveId),
  ).length
  const supportCount = moveIds.filter((moveId) => SUPPORT_ROLE_MOVE_IDS.has(moveId)).length
  const wallCount = moveIds.filter((moveId) => WALL_ROLE_MOVE_IDS.has(moveId)).length
  const speedControlCount = moveIds.filter((moveId) => SPEED_CONTROL_MOVES.has(moveId)).length

  if (damagingCount >= 3 || setupCount > 0) roles.add('sweeper')
  if (moveIds.some((moveId) => PIVOT_MOVE_IDS.has(moveId))) roles.add('pivot')
  if (supportCount >= 2 || (supportCount >= 1 && damagingCount <= 2)) roles.add('support')
  if (wallCount >= 2 || (wallCount >= 1 && damagingCount <= 2 && setupCount === 0)) roles.add('wall')
  if (speedControlCount > 0) roles.add('speed-control')

  if (roles.size === 0) {
    if (pokemon && Math.max(pokemon.baseStats.atk, pokemon.baseStats.spa) >= 115) roles.add('sweeper')
    else if (pokemon && pokemon.baseStats.hp + pokemon.baseStats.def + pokemon.baseStats.spd >= 270) roles.add('wall')
    else roles.add('support')
  }

  return roles
}

export const useAnalyticsStore = defineStore('analytics', () => {
  const weights = useStorage<ScoreWeights>('pokeplan.v1.weights', DEFAULT_WEIGHTS)
  const teamStore = useTeamStore()
  const dexStore = useDexStore()
  const metaUsageStore = useMetaUsageStore()
  const uiStore = useUiStore()

  const normalizedWeights = computed(() => normalizeWeights(weights.value))
  const teamAnalyticsCache = new Map<BattleMode, ModeCacheEntry<TeamAnalyticsExtended>>()
  const offensivePressureCache = new Map<BattleMode, ModeCacheEntry<OffensivePressureSummary>>()
  const teraDependencyCache = new Map<BattleMode, ModeCacheEntry<TeamTeraDependencySummary>>()
  const speedMapCache = new Map<BattleMode, ModeCacheEntry<TeamSpeedMap>>()
  const threatEvaluationCache = new Map<BattleMode, ModeCacheEntry<ReturnType<typeof evaluateThreatSummary>>>()

  function teamSnapshotKey(mode: BattleMode, extras: string[] = []): { team: Team; key: string } {
    const team = teamStore.getActiveTeam(mode)
    return {
      team,
      key: [mode, team.id, team.updatedAt, ...extras].join('|'),
    }
  }

  function normalizedWeightsKey(): string {
    const value = normalizedWeights.value
    return [
      value.offenseCoverage.toFixed(3),
      value.defenseCoverage.toFixed(3),
      value.roleBalance.toFixed(3),
      value.speedControl.toFixed(3),
    ].join(':')
  }

  function setWeight(key: keyof ScoreWeights, value: number) {
    weights.value[key] = Math.max(0, Math.min(100, Math.round(value)))
  }

  function applyWeightPreset(preset: WeightPresetKey) {
    const target = WEIGHT_PRESETS[preset]
    if (!target) return
    weights.value = { ...target }
  }

  function getTeamAnalytics(mode: BattleMode): TeamAnalyticsExtended {
    const { team, key } = teamSnapshotKey(mode, [uiStore.locale, normalizedWeightsKey()])
    const cached = teamAnalyticsCache.get(mode)
    if (cached && cached.key === key) return cached.value

    const locale = uiStore.locale
    const teamMembers = team.members.filter((member) => Boolean(member.pokemonId))
    const teamEnable = detectTeamEnable(mode, teamMembers)
    const offenseSnapshot = calculateTeamOffenseSnapshot(
      mode,
      team,
      (pokemonId) => dexStore.getPokemon(mode, pokemonId),
      (moveId) => dexStore.getMove(moveId),
    )
    const defenseBaseSnapshot = calculateTeamDefenseSnapshot(
      mode,
      team,
      (pokemonId) => dexStore.getPokemon(mode, pokemonId),
      false,
    )
    const defenseTeraSnapshot = calculateTeamDefenseSnapshot(
      mode,
      team,
      (pokemonId) => dexStore.getPokemon(mode, pokemonId),
      true,
    )
    const offensivePressure = getOffensivePressureSummary(mode)
    const teraDependency = getTeamTeraDependency(mode)

    const matchupScore = clampScore(offenseSnapshot.score * 0.55 + defenseTeraSnapshot.score * 0.45)
    const protectCount = team.members.filter((member) => member.moves.includes('protect')).length
    const moveIds = team.members.flatMap((member) => member.moves.filter(Boolean))
    const speedSignals =
      (moveIds.includes('tailwind') ? 2 : 0) +
      (moveIds.includes('trick-room') ? 2 : 0) +
      Math.min(
        4,
        moveIds.filter((moveId) =>
          ['icy-wind', 'electroweb', 'thunder-wave', 'bulldoze', 'string-shot', 'quash', 'scary-face'].includes(
            moveId,
          ),
        ).length,
      )
    const turnBuySignals =
      Math.min(4, protectCount * 0.6) +
      (teamEnable.hasFakeOut ? 2 : 0) +
      (teamEnable.hasRedirection ? 2 : 0) +
      (teamEnable.hasScreens ? 2 : 0)
    const mitigationSignals =
      (teamEnable.hasIntimidate ? 1.5 : 0) +
      (moveIds.includes('parting-shot') ? 1 : 0) +
      (moveIds.includes('snarl') ? 1 : 0) +
      (teamEnable.hasWideGuard ? 1 : 0) +
      Math.min(
        2,
        moveIds.filter((moveId) => ['u-turn', 'volt-switch', 'flip-turn'].includes(moveId)).length * 0.5,
      )
    let tempoScore = clampScore(Math.min(100, 10 * speedSignals + 6 * turnBuySignals + 4 * mitigationSignals))
    if (speedSignals > 0 && offensivePressure.closerCount > 0) tempoScore = clampScore(tempoScore + 10)
    if (mode === 'vgc' && speedSignals > 0 && protectCount < 2) tempoScore = clampScore(tempoScore - 10)

    const topWincons = offensivePressure.winconMembers
      .slice(0, 2)
      .map((entry) => clampNumber(entry.winconScore / 8, 0, 1))
    const topClosers = offensivePressure.closerMembers
      .slice(0, 2)
      .map((entry) => clampNumber(entry.closerScore / 8, 0, 1))
    const avgTopWincon = average(topWincons)
    const avgTopCloser = average(topClosers)
    const breakerPresence =
      offensivePressure.members.some(
        (entry) =>
          !entry.isWincon &&
          !entry.isCloser &&
          entry.damagingMoves >= 2 &&
          entry.highPowerMoves >= 2 &&
          !entry.hasSetup,
      )
        ? 1
        : 0
    const enableCoverage = clampNumber(
      (teamEnable.hardEnableCount * 1.2 + teamEnable.softEnableCount * 0.6) / 4,
      0,
      1,
    )
    const keySlots = new Set(
      [...offensivePressure.winconMembers, ...offensivePressure.closerMembers].map((entry) => entry.slot),
    )
    const keyCriticalCount = teraDependency.members.filter(
      (entry) => entry.level === 'critical' && keySlots.has(entry.slot),
    ).length
    const teraContention = keyCriticalCount >= 2 ? 1 : keyCriticalCount === 1 ? 0.4 : 0
    const planScore = clampScore(
      (0.38 * avgTopWincon +
        0.28 * avgTopCloser +
        0.18 * breakerPresence +
        0.16 * enableCoverage) *
        100 -
        20 * teraContention,
    )

    const totalMembers = Math.max(1, teraDependency.total)
    const criticalRatio = teraDependency.criticalCount / totalMembers
    const unassignedRatio = teraDependency.unassignedCount / totalMembers
    const supportDependency = keySlots.size > 0 && !teamEnable.hasHardEnable ? 1 : 0
    const resourcesRisk = clampNumber(
      criticalRatio * 55 + unassignedRatio * 25 + (keyCriticalCount >= 2 ? 20 : 0) + supportDependency * 15,
      0,
      100,
    )
    const resourcesScore = clampScore(100 - resourcesRisk)

    const totalScore = clampScore(
      (matchupScore * normalizedWeights.value.offenseCoverage +
        resourcesScore * normalizedWeights.value.defenseCoverage +
        planScore * normalizedWeights.value.roleBalance +
        tempoScore * normalizedWeights.value.speedControl) /
        100,
    )

    const keyAlerts: string[] = []
    if (defenseTeraSnapshot.severeSharedWeaknesses.length > 0) {
      const types = defenseTeraSnapshot.severeSharedWeaknesses.join(', ')
      keyAlerts.push(
        locale === 'es'
          ? `Debilidad fuerte compartida (x4/x2): ${types}.`
          : `Strong shared weakness (x4/x2): ${types}.`,
      )
    } else if (defenseTeraSnapshot.sharedWeaknesses.length > 0) {
      const types = defenseTeraSnapshot.sharedWeaknesses.join(', ')
      keyAlerts.push(
        locale === 'es'
          ? `Debilidad compartida: ${types}.`
          : `Shared weakness: ${types}.`,
      )
    }
    if (tempoScore < 45) {
      keyAlerts.push(
        locale === 'es'
          ? 'Tempo bajo: falta control de turnos (Protect/Fake Out/Speed control).'
          : 'Low tempo: missing turn-buying tools (Protect/Fake Out/Speed control).',
      )
    }
    if (planScore < 45) {
      keyAlerts.push(
        locale === 'es'
          ? 'Plan incompleto: faltan wincons/closers o enables fuertes.'
          : 'Plan is incomplete: missing strong wincons/closers or enables.',
      )
    }
    if (resourcesRisk >= 55) {
      keyAlerts.push(
        locale === 'es'
          ? 'Riesgo de recursos alto: conflicto de Tera o demasiadas piezas dependientes.'
          : 'High resource risk: Tera contention or too many dependent pieces.',
      )
    }

    const diagnostics = {
      plan:
        locale === 'es'
          ? planScore >= 60
            ? 'Plan claro con piezas de cierre y enables.'
            : 'Plan inestable: refuerza wincon + enable.'
          : planScore >= 60
            ? 'Clear game plan with closers and enables.'
            : 'Unstable plan: reinforce wincon + enable.',
      tempo:
        locale === 'es'
          ? tempoScore >= 60
            ? 'Buen control de turnos y ritmo de partida.'
            : 'Te falta control de ritmo (turn-buying).'
          : tempoScore >= 60
            ? 'Good turn control and battle pace.'
            : 'Missing turn-buying tempo tools.',
      matchups:
        locale === 'es'
          ? matchupScore >= 60
            ? 'Cobertura de matchup saludable.'
            : 'Cobertura de matchup limitada, revisa daño fiable.'
          : matchupScore >= 60
            ? 'Healthy matchup coverage.'
            : 'Limited matchup coverage; review reliable damage buttons.',
      resources:
        locale === 'es'
          ? resourcesRisk <= 40
            ? 'Uso de recursos estable, poca fricción de Tera.'
            : 'Riesgo de recursos alto: varias piezas compiten por Tera.'
          : resourcesRisk <= 40
            ? 'Stable resource usage with low Tera friction.'
            : 'High resource risk: multiple pieces compete for Tera.',
    }

    const result: TeamAnalyticsExtended = {
      totalScore,
      offenseCoverage: matchupScore,
      defenseCoverage: resourcesScore,
      roleBalance: planScore,
      speedControl: tempoScore,
      weaknesses: defenseTeraSnapshot.weaknesses,
      resistances: defenseTeraSnapshot.resistances,
      keyAlerts,
      matchupScore,
      matchupOffenseScore: offenseSnapshot.score,
      matchupDefenseBaseScore: defenseBaseSnapshot.score,
      matchupDefenseTeraScore: defenseTeraSnapshot.score,
      planScore,
      tempoScore,
      resourcesScore,
      resourcesRisk,
      baseWeaknesses: defenseBaseSnapshot.weaknesses,
      baseResistances: defenseBaseSnapshot.resistances,
      pillarDiagnostics: diagnostics,
    }
    teamAnalyticsCache.set(mode, { key, value: result })
    return result
  }

  function getMemberAnalytics(mode: BattleMode, slot: TeamMember['slot']): MemberAnalytics | null {
    const team = teamStore.getActiveTeam(mode)
    const member = team.members.find((entry) => entry.slot === slot)
    if (!member || !member.pokemonId) return null
    const locale = uiStore.locale
    const pokemon = dexStore.getPokemon(mode, member.pokemonId)
    if (!pokemon) return null

    const base = calculateMemberAnalytics(
      member,
      pokemon,
      (moveId) => dexStore.getMoveType(moveId),
      normalizedWeights.value,
    )
    const offenseSingle = calculateTeamOffenseSnapshot(
      mode,
      {
        ...team,
        members: [member],
      },
      () => pokemon,
      (moveId) => dexStore.getMove(moveId),
    ).score
    const baseDefense = calculateTeamDefenseSnapshot(
      mode,
      { ...team, members: [{ ...member, teraType: undefined }] },
      () => pokemon,
      false,
    ).score
    const teraDefense = calculateTeamDefenseSnapshot(
      mode,
      { ...team, members: [member] },
      () => pokemon,
      true,
    ).score

    const offensivePressureBySlot = new Map(
      getOffensivePressureSummary(mode).members.map((entry) => [entry.slot, entry]),
    )
    const slotPressure = offensivePressureBySlot.get(slot)
    const teraBySlot = new Map(getTeamTeraDependency(mode).members.map((entry) => [entry.slot, entry]))
    const slotTera = teraBySlot.get(slot)

    const expectedRoles = new Set(member.roleTags.length > 0 ? member.roleTags : pokemon.roleTags)
    const actualRoles = inferRoleSignalsForSet(member, pokemon, (moveId) => dexStore.getMove(moveId))
    const overlap = expectedRoles.size
      ? [...expectedRoles].filter((role) => actualRoles.has(role)).length / expectedRoles.size
      : 0
    let roleFit = clampScore(overlap * 100)
    const moveEntries = member.moves
      .filter(Boolean)
      .map((moveId) => dexStore.getMove(moveId))
      .filter((entry): entry is MoveEntry => Boolean(entry))
    const damagingCount = moveEntries.filter((entry) => entry.category !== 'status').length
    if (expectedRoles.has('sweeper') && damagingCount <= 1) roleFit = clampScore(roleFit - 20)
    if (expectedRoles.has('wall') && !member.moves.some((moveId) => RECOVERY_MOVE_IDS.has(moveId))) {
      roleFit = clampScore(roleFit - 10)
    }

    const strengths: string[] = []
    const risks: string[] = []
    const actions: string[] = []

    if (slotPressure?.hasPriorityDamage) {
      strengths.push(locale === 'es' ? 'Tiene prioridad para rematar.' : 'Has priority to secure KOs.')
    }
    if (slotPressure && slotPressure.stabCount >= 2) {
      strengths.push(locale === 'es' ? 'Buen STAB spam para presionar.' : 'Strong STAB spam pressure.')
    }
    if (member.moves.includes('protect') && mode === 'vgc') {
      strengths.push(locale === 'es' ? 'Protect presente para comprar turnos.' : 'Protect helps buy turns.')
    }

    if (mode === 'vgc' && !member.moves.includes('protect')) {
      risks.push(locale === 'es' ? 'Sin Protect en VGC.' : 'Missing Protect in VGC.')
    }
    if (slotTera?.level === 'critical') {
      risks.push(
        locale === 'es'
          ? 'Depende de Tera para ejecutar su plan.'
          : 'Relies heavily on Tera to execute its plan.',
      )
    }
    if (damagingCount <= 1) {
      risks.push(locale === 'es' ? 'Solo 1 move de daño fiable.' : 'Only one reliable damaging move.')
    }

    if (risks.some((risk) => risk.includes('Protect'))) {
      actions.push(locale === 'es' ? 'Agrega Protect para subir consistencia.' : 'Add Protect to improve consistency.')
    }
    if (slotTera?.level === 'critical' && slotTera.reason !== 'offense-spike') {
      actions.push(
        locale === 'es'
          ? 'Busca alternativa defensiva para reducir dependencia de Tera.'
          : 'Look for a defensive alternative to reduce Tera dependency.',
      )
    }
    if (damagingCount <= 1) {
      actions.push(
        locale === 'es'
          ? 'Sube a 2-3 moves de daño para no perder presión.'
          : 'Move to 2-3 damaging moves to keep pressure.',
      )
    }

    return {
      ...base,
      offenseCoverage: offenseSingle,
      defenseCoverage: teraDefense,
      threatScore: slotPressure?.threatScore ?? 0,
      closerScore: slotPressure?.closerScore ?? 0,
      defenseBaseScore: baseDefense,
      defenseTeraScore: teraDefense,
      roleFitScore: roleFit,
      strengths: strengths.slice(0, 3),
      risks: risks.slice(0, 3),
      actions: actions.slice(0, 2),
      recommendations: actions.slice(0, 2),
      score: clampScore((offenseSingle * 0.35 + teraDefense * 0.35 + roleFit * 0.3)),
    }
  }

  function getTeamScoreBreakdown(mode: BattleMode): TeamScoreBreakdownRow[] {
    const analytics = getTeamAnalytics(mode)
    const rows: TeamScoreBreakdownRow[] = [
      {
        key: 'offenseCoverage',
        metricValue: analytics.offenseCoverage,
        weight: normalizedWeights.value.offenseCoverage,
        weightedPoints: (analytics.offenseCoverage * normalizedWeights.value.offenseCoverage) / 100,
      },
      {
        key: 'defenseCoverage',
        metricValue: analytics.defenseCoverage,
        weight: normalizedWeights.value.defenseCoverage,
        weightedPoints: (analytics.defenseCoverage * normalizedWeights.value.defenseCoverage) / 100,
      },
      {
        key: 'roleBalance',
        metricValue: analytics.roleBalance,
        weight: normalizedWeights.value.roleBalance,
        weightedPoints: (analytics.roleBalance * normalizedWeights.value.roleBalance) / 100,
      },
      {
        key: 'speedControl',
        metricValue: analytics.speedControl,
        weight: normalizedWeights.value.speedControl,
        weightedPoints: (analytics.speedControl * normalizedWeights.value.speedControl) / 100,
      },
    ]

    return rows
  }

  function getThreatEvaluation(mode: BattleMode): ReturnType<typeof evaluateThreatSummary> {
    const { team, key } = teamSnapshotKey(mode, [uiStore.locale, metaUsageStore.getModeStatus(mode)])
    const cached = threatEvaluationCache.get(mode)
    if (cached && cached.key === key) return cached.value

    const value = evaluateThreatSummary(
      mode,
      team,
      (pokemonId) => dexStore.getPokemon(mode, pokemonId),
      (moveId) => dexStore.getMove(moveId),
      {
        mode,
        getThreatUsage: (pokemonId) => metaUsageStore.getPokemonMeta(mode, pokemonId)?.usage ?? 0,
      },
    )
    threatEvaluationCache.set(mode, { key, value })
    return value
  }

  function getThreatResponses(mode: BattleMode): ThreatResponseRow[] {
    return getThreatEvaluation(mode).rows
  }

  function getThreatResponseSummary(mode: BattleMode): ThreatResponseSummary {
    return getThreatEvaluation(mode).summary
  }

  function getThreatAlerts(mode: BattleMode): string[] {
    const rows = getThreatResponses(mode)
    const summary = getThreatResponseSummary(mode)
    const critical = rows.filter((row) => row.status === 'danger').slice(0, 3)
    const locale = uiStore.locale
    const alerts: string[] = []

    if (critical.length > 0) {
      const names = critical.map((row) => row.name).join(', ')
      alerts.push(
        locale === 'es' ? `Sin respuesta clara a: ${names}` : `No clear answers to: ${names}`,
      )
    }

    if (summary.total > 0 && summary.goodPercent < 40) {
      alerts.push(
        locale === 'es'
          ? `Cobertura meta baja: ${summary.goodPercent}% de amenazas con respuesta solida.`
          : `Low meta coverage: ${summary.goodPercent}% threats with solid responses.`,
      )
    }

    if (summary.warningCount > 0 && summary.dangerCount === 0) {
      alerts.push(
        locale === 'es'
          ? 'Hay amenazas con checks parciales; considera reforzar lineas de respuesta.'
          : 'Some threats only have partial checks; consider reinforcing your response lines.',
      )
    }

    return alerts
  }

  function getTeamTeraDependency(mode: BattleMode): TeamTeraDependencySummary {
    const { team, key } = teamSnapshotKey(mode, [uiStore.locale])
    const cached = teraDependencyCache.get(mode)
    if (cached && cached.key === key) return cached.value

    const teamMembers = team.members.filter((member) => Boolean(member.pokemonId))
    const teamEnable = detectTeamEnable(mode, teamMembers)
    const offensiveBySlot = new Map(
      getOffensivePressureSummary(mode).members.map((entry) => [entry.slot, entry]),
    )
    const members: TeamTeraDependencyMember[] = []

    for (const member of team.members) {
      if (!member.pokemonId) continue
      const pokemon = dexStore.getPokemon(mode, member.pokemonId)
      if (!pokemon) continue

      const primary = pokemon.types[0] ?? 'normal'
      const secondary = pokemon.types[1]
      const base = weightedTypeSnapshot(mode, primary, secondary)
      const teraType = member.teraType
      const slotPressure = offensiveBySlot.get(member.slot)
      const moveEntries = member.moves
        .filter(Boolean)
        .map((moveId) => dexStore.getMove(moveId))
        .filter((entry): entry is MoveEntry => Boolean(entry))
      const damagingMoves = moveEntries.filter((entry) => entry.category !== 'status')
      const moves = member.moves.filter(Boolean)
      const hasBodyPressSetup =
        moves.includes('body-press') &&
        moves.some((moveId) => BODY_PRESS_SETUP_HELPER_IDS.has(moveId))
      const effectivePowers = damagingMoves.map((move) =>
        estimatedEffectivePower(move, mode, {
          hasBodyPressSetup,
          highDefenseProfile: pokemon.baseStats.def >= 120,
        }),
      )
      const atkCount = damagingMoves.length
      const hiCount = effectivePowers.filter((power) => power >= 85).length
      const hasSetup =
        moves.some((moveId) => MAJOR_SETUP_MOVE_IDS.has(moveId) || MINOR_SETUP_MOVE_IDS.has(moveId)) ||
        hasBodyPressSetup
      const hasImmediateBoost = Boolean(member.itemId && IMMEDIATE_BOOST_ITEM_IDS.has(member.itemId))
      const supportRole =
        member.roleTags.includes('support') || member.roleTags.includes('wall')
      const offensiveRole =
        member.roleTags.includes('sweeper') || member.roleTags.includes('speed-control')
      const supportPure = !offensiveRole && supportRole && atkCount <= 1 && !hasSetup && !hasImmediateBoost
      const isBreaker = mode === 'singles' && atkCount >= 2 && hiCount >= 2 && !hasSetup
      const isCoreOffense =
        Boolean(
          slotPressure?.isWincon ||
            slotPressure?.isCloser ||
            slotPressure?.isWinconCandidate ||
            slotPressure?.isCloserCandidate,
        ) || isBreaker
      const roleMultiplier = supportPure ? 0.6 : isCoreOffense ? 1.2 : 1

      let defensiveNeed =
        0.25 * base.weakCount + 0.9 * base.severeCount + 1.6 * base.quadCount
      if (mode === 'vgc') {
        if (teamEnable.hasHardEnable) defensiveNeed *= 0.88
        else if (teamEnable.hasSoftEnable) defensiveNeed *= 0.94
      }

      if (!teraType) {
        members.push({
          slot: member.slot,
          pokemonId: member.pokemonId,
          pokemonName: pokemon.name,
          teraType: undefined,
          level: 'unassigned',
          reason: 'missing-tera',
          score: null,
          hasTeraStabMove: false,
          baseWeakCount: base.weakCount,
          teraWeakCount: base.weakCount,
          baseSevereCount: base.severeCount,
          teraSevereCount: base.severeCount,
        })
        continue
      }

      const tera = weightedTypeSnapshot(mode, teraType)
      const hasTeraStabMove = hasDamagingMoveOfType(member, teraType, dexStore)
      const weakDelta = base.weakCount - tera.weakCount
      const severeDelta = base.severeCount - tera.severeCount
      const quadDelta = base.quadCount - tera.quadCount
      const resistDelta = tera.resistCount - base.resistCount
      const immunityDelta = tera.immunityCount - base.immunityCount

      let gain =
        0.25 * Math.max(weakDelta, 0) +
        0.9 * Math.max(severeDelta, 0) +
        1.6 * Math.max(quadDelta, 0)
      let risk =
        0.25 * Math.max(-weakDelta, 0) +
        1.2 * Math.max(-severeDelta, 0) +
        2.0 * Math.max(-quadDelta, 0)

      if (resistDelta > 0) gain += resistDelta * 0.18
      if (resistDelta < 0) risk += Math.abs(resistDelta) * 0.2
      if (immunityDelta > 0) gain += immunityDelta * 0.7
      if (immunityDelta < 0) risk += Math.abs(immunityDelta) * 0.8
      if (tera.quadCount > base.quadCount) {
        risk += (tera.quadCount - base.quadCount) * 0.8
      }

      let bestMoveType: PokemonTypeKey | null = null
      let bestMovePower = -1
      for (let index = 0; index < damagingMoves.length; index += 1) {
        const power = effectivePowers[index]
        if (power > bestMovePower) {
          bestMovePower = power
          bestMoveType = damagingMoves[index].type
        }
      }

      const hasTeraBlast = moves.includes('tera-blast')
      const teraGivesNewStabToBestMove =
        bestMoveType === teraType && !pokemon.types.includes(teraType)
      const teraAddsStabToBestMoveExisting =
        bestMoveType === teraType && pokemon.types.includes(teraType)

      let offGain = 0
      if (hasTeraBlast) offGain += 1.0
      else if (teraGivesNewStabToBestMove) offGain += 1.0
      else if (hasTeraStabMove) offGain += teraAddsStabToBestMoveExisting ? 0.4 : 0.8
      offGain *= roleMultiplier

      const defPart = defensiveNeed * 0.8 + gain * 1.3 - risk * 1.4
      const score = defPart + offGain
      const gainMinusRisk = gain - risk

      const criticalDefense =
        (defensiveNeed >= 2.6 && gainMinusRisk >= 1.6) ||
        (quadDelta >= 1 && defensiveNeed >= 1.8)
      const criticalOffense = score >= 6.0 && offGain >= 1.2 && isCoreOffense
      const isCritical = criticalDefense || criticalOffense
      const isImproves =
        !isCritical && (score >= 2.0 || gainMinusRisk >= 1.0 || offGain >= 0.8)

      const level: TeraDependencyLevel = isCritical
        ? 'critical'
        : isImproves
          ? 'improves'
          : 'autonomous'
      const reason: TeraDependencyReason = isCritical
        ? criticalDefense
          ? 'defense-critical'
          : offGain >= 1.2 && gainMinusRisk >= 1
            ? 'mixed'
            : 'offense-spike'
        : isImproves
          ? gainMinusRisk >= 1.0 && offGain >= 0.8
            ? 'mixed'
            : gainMinusRisk >= 1.0
              ? 'defense-patch'
              : offGain >= 0.8
                ? 'offense-spike'
                : 'none'
          : 'none'

      members.push({
        slot: member.slot,
        pokemonId: member.pokemonId,
        pokemonName: pokemon.name,
        teraType,
        level,
        reason,
        score: Math.round(score * 100) / 100,
        hasTeraStabMove,
        baseWeakCount: Math.round(base.weakCount * 10) / 10,
        teraWeakCount: Math.round(tera.weakCount * 10) / 10,
        baseSevereCount: Math.round(base.severeCount * 10) / 10,
        teraSevereCount: Math.round(tera.severeCount * 10) / 10,
      })
    }

    const sortedMembers = [...members].sort(
      (a, b) =>
        teraLevelPriority(b.level) - teraLevelPriority(a.level) ||
        (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY) ||
        a.slot - b.slot,
    )
    const unassignedCount = sortedMembers.filter((entry) => entry.level === 'unassigned').length
    const autonomousCount = sortedMembers.filter((entry) => entry.level === 'autonomous').length
    const improvesCount = sortedMembers.filter((entry) => entry.level === 'improves').length
    const criticalCount = sortedMembers.filter((entry) => entry.level === 'critical').length

    const result: TeamTeraDependencySummary = {
      total: sortedMembers.length,
      unassignedCount,
      autonomousCount,
      improvesCount,
      criticalCount,
      members: sortedMembers,
      criticalMembers: sortedMembers.filter((entry) => entry.level === 'critical').slice(0, 3),
    }
    teraDependencyCache.set(mode, { key, value: result })
    return result
  }

  function getTeraDependencyAlerts(mode: BattleMode): string[] {
    const summary = getTeamTeraDependency(mode)
    const locale = uiStore.locale
    const alerts: string[] = []
    if (summary.total === 0) return alerts

    if (summary.unassignedCount > 0) {
      alerts.push(
        locale === 'es'
          ? `Hay ${summary.unassignedCount} slot(s) sin tera asignado; la dependencia aun no se evalua completa.`
          : `${summary.unassignedCount} slot(s) have no assigned Tera; dependency is not fully evaluated yet.`,
      )
    }

    if (summary.criticalCount >= 2) {
      alerts.push(
        locale === 'es'
          ? 'Conflicto de Tera: varios slots dependen criticamente del mismo recurso.'
          : 'Tera contention: multiple slots critically depend on the same resource.',
      )
    }

    if (summary.criticalCount >= 3) {
      alerts.push(
        locale === 'es'
          ? 'Alta dependencia de Tera: demasiados slots criticos compiten por un solo Teracristalizado.'
          : 'High Tera dependency: too many critical slots compete for one Terastallization.',
      )
    } else if (summary.criticalCount > 0) {
      const names = summary.criticalMembers.map((entry) => entry.pokemonName).join(', ')
      alerts.push(
        locale === 'es'
          ? `Dependencia critica de Tera en: ${names}.`
          : `Critical Tera dependency on: ${names}.`,
      )
    }

    return alerts
  }

  function getOffensivePressureSummary(mode: BattleMode): OffensivePressureSummary {
    const { team, key } = teamSnapshotKey(mode)
    const cached = offensivePressureCache.get(mode)
    if (cached && cached.key === key) return cached.value

    const speedBenchmark = offensiveSpeedBenchmark(mode)
    const teamMembers = team.members.filter((member) => Boolean(member.pokemonId))
    const teamEnable = detectTeamEnable(mode, teamMembers)
    type RawOffensivePressureMember = Omit<OffensivePressureMember, 'isWincon' | 'isCloser'> & {
      winconCandidate: boolean
      closerCandidate: boolean
      _supportPure: boolean
      _bulkDecent: boolean
      _hasProtect: boolean
      _hasRecovery: boolean
      _hasNearTailwindWindow: boolean
      _atkCount: number
      _hiCount: number
      _spreadCount: number
      _isBreaker: boolean
    }
    const rawMembers: RawOffensivePressureMember[] = []

    for (const member of teamMembers) {
      if (!member.pokemonId) continue
      const pokemon = dexStore.getPokemon(mode, member.pokemonId)
      if (!pokemon) continue

      const moves = member.moves.filter(Boolean)
      const moveEntries = moves
        .map((moveId) => dexStore.getMove(moveId))
        .filter((entry): entry is MoveEntry => Boolean(entry))
      const baseTypes = pokemon.types
      const nonDamagingMoves = moveEntries.filter((entry) => entry.category === 'status')
      const damagingMoves = moveEntries.filter((entry) => entry.category !== 'status')

      const hasBodyPress = moves.includes('body-press')
      const hasBodyPressSetup = hasBodyPress && moves.some((moveId) => BODY_PRESS_SETUP_HELPER_IDS.has(moveId))
      const setupTier: OffensivePressureMember['setupTier'] = moves.some((moveId) =>
        MAJOR_SETUP_MOVE_IDS.has(moveId),
      )
        ? 'major'
        : moves.some((moveId) => MINOR_SETUP_MOVE_IDS.has(moveId))
          ? 'minor'
          : 'none'
      const hasSetup = setupTier !== 'none' || hasBodyPressSetup
      const highDefenseProfile = pokemon.baseStats.def >= 120

      const effectivePowers = damagingMoves.map((move) =>
        estimatedEffectivePower(move, mode, { hasBodyPressSetup, highDefenseProfile }),
      )
      const atkCount = damagingMoves.length
      const hiCount = effectivePowers.filter((power) => power >= 85).length
      const spreadCount = mode === 'vgc' ? damagingMoves.filter((move) => SPREAD_MOVE_IDS.has(move.id)).length : 0
      const damagingTypeCount = new Set(damagingMoves.map((move) => move.type)).size
      const stabCount = damagingMoves.filter(
        (move) => countSharedTypes(move.type, baseTypes, member.teraType) > 0,
      ).length

      const hasPriorityDamage = damagingMoves.some(
        (entry) => OFFENSIVE_PRIORITY_MOVE_IDS.has(entry.id) || (entry.priority ?? 0) > 0,
      )
      const hasPivot = moves.some(
        (moveId) => PIVOT_MOVE_IDS.has(moveId) || dexStore.getMove(moveId)?.tags.includes('pivot'),
      )
      const hasRedirection = mode === 'vgc' && moves.some((moveId) => REDIRECTION_MOVE_IDS.has(moveId))
      const hasProtect = mode === 'vgc' && moves.some((moveId) => PROTECT_MOVE_IDS.has(moveId))
      const hasRecovery = mode === 'singles' && moves.some((moveId) => RECOVERY_MOVE_IDS.has(moveId))
      const hasImmediateBoost = Boolean(member.itemId && IMMEDIATE_BOOST_ITEM_IDS.has(member.itemId))
      const isChoiceLockItem = Boolean(member.itemId && CHOICE_LOCK_ITEM_IDS.has(member.itemId))

      const utilityStatusCount = nonDamagingMoves.filter(
        (entry) =>
          entry.tags.includes('support') ||
          entry.tags.includes('pivot') ||
          entry.tags.includes('speed-control') ||
          NON_BLOAT_UTILITY_MOVE_IDS.has(entry.id),
      ).length
      const utilityNonEnablingCount = nonDamagingMoves.filter((entry) => {
        if (NON_BLOAT_UTILITY_MOVE_IDS.has(entry.id)) return false
        if (MAJOR_SETUP_MOVE_IDS.has(entry.id) || MINOR_SETUP_MOVE_IDS.has(entry.id)) return false
        return true
      }).length
      const isUtilityBloat = utilityNonEnablingCount >= 3

      const finalStats = calculateBattleStats(
        pokemon.baseStats,
        member.ivs,
        member.evs,
        battleLevelForMode(mode),
        member.natureId,
      )
      const scarfActive = member.itemId === 'choice-scarf'
      const speedValue = Math.floor(finalStats.spe * (scarfActive ? 1.5 : 1))
      const speedDelta = speedValue - speedBenchmark
      const isTRCleaner =
        teamEnable.hasTrickRoom && mode === 'vgc' && speedValue <= speedBenchmark - 35
      const verySlowNoTR = mode === 'vgc' && speedValue <= speedBenchmark - 35 && !teamEnable.hasTrickRoom
      const hasNearTailwindWindow = mode === 'vgc' && teamEnable.hasTailwind && speedDelta >= -15 && speedDelta < 10
      const bulkDecent = pokemon.baseStats.hp + pokemon.baseStats.def + pokemon.baseStats.spd >= 255
      const supportPure =
        atkCount <= 1 && !hasSetup && !hasImmediateBoost && (hasRedirection || utilityStatusCount >= 2)

      let threatScore = 0
      const contributions: OffensivePressureMember['contributions'] = []

      // Damage core
      if (mode === 'vgc') {
        if (atkCount >= 2) {
          threatScore += 1.4
          contributions.push({ key: 'damageCoreVgc2', value: 1.4 })
        } else if (atkCount === 1 && (spreadCount >= 1 || hasImmediateBoost)) {
          threatScore += 0.7
          contributions.push({ key: 'damageCoreVgc1', value: 0.7 })
        } else if (atkCount === 0) {
          threatScore -= 1.2
          contributions.push({ key: 'damageCoreVgc0', value: -1.2 })
        }
      } else {
        if (atkCount >= 3) {
          threatScore += 1.8
          contributions.push({ key: 'damageCoreSingles3', value: 1.8 })
        } else if (atkCount === 2 && hasSetup) {
          threatScore += 1
          contributions.push({ key: 'damageCoreSingles2setup', value: 1 })
        } else if (atkCount <= 1 && !hasSetup) {
          threatScore -= 1
          contributions.push({ key: 'damageCoreSinglesLow', value: -1 })
        }
      }

      // Power quality
      if (hiCount >= 2) {
        threatScore += 0.8
        contributions.push({ key: 'powerHi2', value: 0.8 })
      } else if (hiCount === 1) {
        threatScore += 0.4
        contributions.push({ key: 'powerHi1', value: 0.4 })
      }
      if (mode === 'vgc' && spreadCount >= 1) {
        threatScore += 0.5
        contributions.push({ key: 'powerSpreadVgc', value: 0.5 })
      }
      if (stabCount >= 1) {
        threatScore += 0.3
        contributions.push({ key: 'powerStab', value: 0.3 })
      }

      // Turn order
      if (mode === 'vgc') {
        if (speedDelta >= 10) {
          threatScore += 1.2
          contributions.push({ key: 'turnFastVgc', value: 1.2 })
        } else if (hasNearTailwindWindow) {
          threatScore += 0.6
          contributions.push({ key: 'turnNearTailwindVgc', value: 0.6 })
        }
        if (hasPriorityDamage) {
          threatScore += 1
          contributions.push({ key: 'turnPriority', value: 1 })
        }
        if (isTRCleaner) {
          threatScore += 1.2
          contributions.push({ key: 'turnTRCleaner', value: 1.2 })
        } else if (verySlowNoTR) {
          threatScore -= 0.6
          contributions.push({ key: 'turnSlowNoTR', value: -0.6 })
        }
      } else {
        if (speedDelta >= 15) {
          threatScore += 1.4
          contributions.push({ key: 'turnFastSingles', value: 1.4 })
        }
        if (hasPriorityDamage) {
          threatScore += 1.2
          contributions.push({ key: 'turnPriority', value: 1.2 })
        }
        if (scarfActive) {
          threatScore += 0.6
          contributions.push({ key: 'turnScarfSingles', value: 0.6 })
        }
      }

      // Setup / immediate pressure
      if (setupTier === 'major') {
        threatScore += 1.6
        contributions.push({ key: 'setupMajor', value: 1.6 })
      } else if (setupTier === 'minor') {
        threatScore += 0.9
        contributions.push({ key: 'setupMinor', value: 0.9 })
      }
      if (hasBodyPressSetup) {
        threatScore += 1.6
        contributions.push({ key: 'setupBodyPress', value: 1.6 })
      }
      if (hasImmediateBoost) {
        threatScore += 0.8
        contributions.push({ key: 'boostImmediate', value: 0.8 })
      }

      // Consistency
      if (mode === 'vgc' && hasProtect) {
        threatScore += 0.8
        contributions.push({ key: 'consistencyProtectVgc', value: 0.8 })
      }
      if (mode === 'singles' && hasRecovery) {
        threatScore += 0.8
        contributions.push({ key: 'consistencyRecoverySingles', value: 0.8 })
      }

      // Utility bloat penalty
      if (isUtilityBloat && !hasSetup && !hasImmediateBoost) {
        threatScore -= 0.8
        contributions.push({ key: 'utilityBloatPenalty', value: -0.8 })
      }

      // Wincon score (plan-aware)
      let planBonus = 0
      if (hasSetup || hasBodyPressSetup) {
        planBonus += 1.2
        contributions.push({ key: 'planSetup', value: 1.2 })
      }
      if ((mode === 'vgc' && hasProtect) || (mode === 'singles' && hasRecovery)) {
        planBonus += 0.8
        contributions.push({ key: 'planConsistency', value: 0.8 })
      }
      const hasEnableDirect =
        teamEnable.hasHardEnable ||
        (teamEnable.hasTrickRoom && isTRCleaner) ||
        (teamEnable.hasTailwind && speedDelta < 10)
      if (teamEnable.hasHardEnable) {
        planBonus += 1
        contributions.push({ key: 'planEnable', value: 1 })
      } else if (teamEnable.hasSoftEnable || hasEnableDirect) {
        planBonus += 0.4
        contributions.push({ key: 'planEnable', value: 0.4 })
      }
      if (teamEnable.hasTerrainWeather && (hasPriorityDamage || hasImmediateBoost || stabCount >= 2)) {
        planBonus += 0.4
        contributions.push({ key: 'planTerrainWeather', value: 0.4 })
      }
      const winconScore = threatScore + planBonus

      // Closer score
      let closeBonus = 0
      const turnOrderReadyVgc = speedDelta >= 10 || hasPriorityDamage || isTRCleaner
      const turnOrderReadySingles = speedDelta >= 15 || hasPriorityDamage
      if (mode === 'vgc' && turnOrderReadyVgc) {
        closeBonus += 1
        contributions.push({ key: 'closeTurnOrderVgc', value: 1 })
      }
      if (mode === 'singles' && turnOrderReadySingles) {
        closeBonus += 1
        contributions.push({ key: 'closeTurnOrderSingles', value: 1 })
      }
      if (hiCount >= 2) {
        closeBonus += 0.8
        contributions.push({ key: 'closeHi2', value: 0.8 })
      }
      const hasSimpleButton =
        mode === 'vgc'
          ? spreadCount >= 1 || (stabCount >= 1 && hiCount >= 1)
          : hasPriorityDamage || (stabCount >= 1 && hiCount >= 2)
      if (hasSimpleButton) {
        closeBonus += 0.6
        contributions.push({ key: 'closeSimpleButton', value: 0.6 })
      }
      if (mode === 'vgc' && hasProtect) {
        closeBonus += 0.6
        contributions.push({ key: 'closeProtectVgc', value: 0.6 })
      }

      let frictionPenalty = 0
      if (setupTier === 'major' && !hasEnableDirect) {
        frictionPenalty += 0.8
        contributions.push({ key: 'frictionSetupNoEnable', value: -0.8 })
      }
      if (isUtilityBloat && atkCount <= 1) {
        frictionPenalty += 0.6
        contributions.push({ key: 'frictionUtilityLowAtk', value: -0.6 })
      }
      const oneButtonBadCoverage = damagingTypeCount <= 1 || (atkCount <= 2 && hiCount <= 1)
      if (isChoiceLockItem && (stabCount === 0 || oneButtonBadCoverage)) {
        frictionPenalty += 0.4
        contributions.push({ key: 'frictionChoiceLock', value: -0.4 })
      }
      const hasAccuracyRisk = damagingMoves.some(
        (move, index) => effectivePowers[index] >= 85 && (move.accuracy ?? 100) < 90,
      )
      if (hasAccuracyRisk) {
        frictionPenalty += 0.3
        contributions.push({ key: 'frictionAccuracyRisk', value: -0.3 })
      }
      if (damagingMoves.some((move) => RECOIL_OR_HP_COST_MOVE_IDS.has(move.id))) {
        frictionPenalty += 0.2
        contributions.push({ key: 'frictionRecoilRisk', value: -0.2 })
      }
      if (damagingMoves.some((move) => SELF_DROP_MOVE_IDS.has(move.id))) {
        frictionPenalty += 0.2
        contributions.push({ key: 'frictionSelfDropRisk', value: -0.2 })
      }
      if (!isChoiceLockItem && oneButtonBadCoverage && atkCount >= 2 && !hasSetup && !hasImmediateBoost) {
        frictionPenalty += 0.3
        contributions.push({ key: 'frictionOneButton', value: -0.3 })
      }
      const closerScore = threatScore + closeBonus - frictionPenalty

      const breakerScore =
        threatScore +
        (atkCount >= 3 ? 0.7 : 0) +
        (hiCount >= 2 ? 0.8 : 0) +
        (hasImmediateBoost ? 0.6 : 0) +
        (stabCount >= 1 ? 0.3 : 0)
      const isBreaker = mode === 'singles' && atkCount >= 2 && !hasSetup && breakerScore >= 5.2

      rawMembers.push({
        slot: member.slot,
        pokemonId: member.pokemonId,
        pokemonName: pokemon.name,
        isWinconCandidate: false,
        isCloserCandidate: false,
        setupTier,
        isTRCleaner,
        hasImmediateBoost,
        hasSetup,
        hasSpread: spreadCount > 0,
        hasPivot,
        hasRedirection,
        hasPriorityDamage,
        stabCount,
        damagingMoves: atkCount,
        highPowerMoves: hiCount,
        utilityStatusCount,
        speedValue,
        speedBenchmark,
        speedDelta,
        score: threatScore,
        threatScore,
        winconScore,
        closerScore,
        winconCandidate: false,
        closerCandidate: false,
        _supportPure: supportPure,
        _bulkDecent: bulkDecent,
        _hasProtect: hasProtect,
        _hasRecovery: hasRecovery,
        _hasNearTailwindWindow: hasNearTailwindWindow,
        _atkCount: atkCount,
        _hiCount: hiCount,
        _spreadCount: spreadCount,
        _isBreaker: isBreaker,
        contributions,
      })
    }

    const candidatePool = rawMembers.filter((entry) => !entry._supportPure && entry._atkCount > 0)
    const baseWinconThreshold = mode === 'vgc' ? 6.2 : 6.5
    const baseCloserThreshold = mode === 'vgc' ? 6.0 : 6.4
    const avgWinconScore = average(candidatePool.map((entry) => entry.winconScore))
    const avgCloserScore = average(candidatePool.map((entry) => entry.closerScore))
    const dynamicWinconThreshold = clampNumber(
      avgWinconScore + (mode === 'vgc' ? 0.45 : 0.55),
      baseWinconThreshold - 0.35,
      baseWinconThreshold + 0.55,
    )
    const dynamicCloserThreshold = clampNumber(
      avgCloserScore + (mode === 'vgc' ? 0.35 : 0.45),
      baseCloserThreshold - 0.35,
      baseCloserThreshold + 0.55,
    )
    const dynamicTrCloserThreshold = Math.max(5.5, dynamicCloserThreshold - 0.3)

    for (const entry of rawMembers) {
      if (entry._supportPure || entry._atkCount === 0) {
        entry.winconCandidate = false
        entry.closerCandidate = false
        continue
      }

      if (mode === 'vgc') {
        const winconRule =
          entry.hasSetup || entry.isTRCleaner || (entry.hasImmediateBoost && entry._spreadCount > 0)
        entry.winconCandidate = winconRule && entry.winconScore >= dynamicWinconThreshold
      } else {
        const winconRule =
          entry.hasSetup &&
          entry.threatScore >= 5.5 &&
          (entry._hasRecovery || entry._bulkDecent)
        entry.winconCandidate = winconRule && entry.winconScore >= dynamicWinconThreshold
      }

      if (mode === 'vgc') {
        const turnOrder =
          entry.speedDelta >= 10 ||
          entry.hasPriorityDamage ||
          entry.isTRCleaner ||
          entry._hasNearTailwindWindow
        entry.closerCandidate =
          entry._atkCount >= 2 && turnOrder && entry.closerScore >= dynamicCloserThreshold
        if (
          !entry.closerCandidate &&
          entry.isTRCleaner &&
          entry._atkCount >= 2 &&
          (entry._hasProtect || entry._bulkDecent)
        ) {
          entry.closerCandidate = entry.closerScore >= dynamicTrCloserThreshold
        }
        if (entry._atkCount === 1) {
          entry.closerCandidate =
            entry._spreadCount >= 1 &&
            entry.hasImmediateBoost &&
            turnOrder &&
            entry.closerScore >= dynamicCloserThreshold + 0.2
        }
      } else {
        const highSpeed = entry.speedDelta >= 15
        entry.closerCandidate =
          (entry.hasPriorityDamage || highSpeed) &&
          entry.threatScore >= 5.8 &&
          entry.closerScore >= dynamicCloserThreshold
        if (entry._atkCount <= 1) {
          entry.closerCandidate =
            entry.hasPriorityDamage &&
            entry.hasImmediateBoost &&
            entry._hiCount >= 1 &&
            entry.closerScore >= dynamicCloserThreshold + 0.8
        }
        if (entry.closerCandidate && entry._isBreaker && !entry.hasPriorityDamage && entry.speedDelta < 15) {
          entry.closerCandidate = false
        }
      }
    }

    const ranked = [...rawMembers].sort((a, b) => b.threatScore - a.threatScore || a.slot - b.slot)
    const maxWincons = mode === 'singles' ? 2 : 3
    const maxClosers = 2
    const selectedWincons = ranked
      .filter((entry) => entry.winconCandidate)
      .sort((a, b) => b.winconScore - a.winconScore || b.threatScore - a.threatScore)
      .slice(0, maxWincons)
    const selectedClosers = ranked
      .filter((entry) => entry.closerCandidate)
      .sort((a, b) => b.closerScore - a.closerScore || b.threatScore - a.threatScore)
      .slice(0, maxClosers)

    // Fallback: if no explicit wincon candidate exists, keep one highest-offense anchor only.
    if (selectedWincons.length === 0 && ranked.length > 0 && ranked[0].threatScore >= 6.8 && ranked[0].damagingMoves >= 2) {
      selectedWincons.push(ranked[0])
    }
    if (selectedClosers.length === 0 && ranked.length > 0 && ranked[0].closerScore >= 6.6 && ranked[0].damagingMoves >= 2) {
      selectedClosers.push(ranked[0])
    }

    const winconKey = new Set(selectedWincons.map((entry) => `${entry.slot}:${entry.pokemonId}`))
    const closerKey = new Set(selectedClosers.map((entry) => `${entry.slot}:${entry.pokemonId}`))
    const members: OffensivePressureMember[] = ranked.map((entry) => ({
      slot: entry.slot,
      pokemonId: entry.pokemonId,
      pokemonName: entry.pokemonName,
      isWincon: winconKey.has(`${entry.slot}:${entry.pokemonId}`),
      isCloser: closerKey.has(`${entry.slot}:${entry.pokemonId}`),
      hasSetup: entry.hasSetup,
      hasSpread: entry.hasSpread,
      hasPivot: entry.hasPivot,
      hasRedirection: entry.hasRedirection,
      setupTier: entry.setupTier,
      isTRCleaner: entry.isTRCleaner,
      hasImmediateBoost: entry.hasImmediateBoost,
      hasPriorityDamage: entry.hasPriorityDamage,
      stabCount: entry.stabCount,
      damagingMoves: entry.damagingMoves,
      highPowerMoves: entry.highPowerMoves,
      utilityStatusCount: entry.utilityStatusCount,
      speedValue: entry.speedValue,
      speedBenchmark: entry.speedBenchmark,
      speedDelta: entry.speedDelta,
      score: Math.round(entry.score * 100) / 100,
      threatScore: Math.round(entry.threatScore * 100) / 100,
      winconScore: Math.round(entry.winconScore * 100) / 100,
      closerScore: Math.round(entry.closerScore * 100) / 100,
      isWinconCandidate: entry.winconCandidate,
      isCloserCandidate: entry.closerCandidate,
      contributions: [...entry.contributions].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    }))

    const total = members.length
    const winconMembers = members.filter((entry) => entry.isWincon)
    const closerMembers = members.filter((entry) => entry.isCloser)
    const spreadUsers = members.filter((entry) => entry.hasSpread).length
    const pivotUsers = members.filter((entry) => entry.hasPivot).length
    const redirectionUsers = members.filter((entry) => entry.hasRedirection).length

    const result: OffensivePressureSummary = {
      total,
      winconCount: winconMembers.length,
      closerCount: closerMembers.length,
      spreadUsers,
      spreadPressure: mode === 'singles' ? 'na' : pressureBandFromCount(spreadUsers, total),
      pivotUsers,
      pivoting: pressureBandFromCount(pivotUsers, total),
      redirectionUsers,
      redirection: mode === 'singles' ? 'na' : pressureBandFromCount(redirectionUsers, total),
      members,
      winconMembers,
      closerMembers,
    }
    offensivePressureCache.set(mode, { key, value: result })
    return result
  }

  function getOffensivePressureAlerts(mode: BattleMode): string[] {
    const summary = getOffensivePressureSummary(mode)
    const locale = uiStore.locale
    const alerts: string[] = []
    if (summary.total === 0) return alerts

    if (summary.winconCount === 0) {
      alerts.push(
        locale === 'es'
          ? 'No se detecta una wincon clara en el equipo actual.'
          : 'No clear win condition detected in the current team.',
      )
    }
    if (summary.closerCount === 0) {
      alerts.push(
        locale === 'es'
          ? 'Falta un cerrador consistente para el late game.'
          : 'A consistent late-game closer is missing.',
      )
    }
    if (
      mode === 'vgc' &&
      summary.spreadPressure === 'none' &&
      (summary.pivoting === 'none' || summary.pivoting === 'low')
    ) {
      alerts.push(
        locale === 'es'
          ? 'Presion de tempo baja: poco spread y poco pivoting.'
          : 'Low tempo pressure: little spread and little pivoting.',
      )
    }

    return alerts
  }

  function getTeamSpeedMap(mode: BattleMode): TeamSpeedMap {
    const { team, key } = teamSnapshotKey(mode, [uiStore.locale])
    const cached = speedMapCache.get(mode)
    if (cached && cached.key === key) return cached.value

    const level = battleLevelForMode(mode)
    const buckets: Record<SpeedBucketKey, TeamSpeedMapBucket> = {
      slow: defaultSpeedMapBucket('slow'),
      mid: defaultSpeedMapBucket('mid'),
      fast: defaultSpeedMapBucket('fast'),
      veryFast: defaultSpeedMapBucket('veryFast'),
    }

    let hasTailwind = false
    let hasTrickRoom = false
    let speedControlCount = 0

    for (const member of team.members) {
      if (!member.pokemonId) continue
      const pokemon = dexStore.getPokemon(mode, member.pokemonId)
      if (!pokemon) continue

      if (member.moves.includes('tailwind')) hasTailwind = true
      if (member.moves.includes('trick-room')) hasTrickRoom = true
      if (
        member.moves.some((moveId) => SPEED_CONTROL_MOVES.has(moveId)) ||
        member.roleTags.includes('speed-control')
      ) {
        speedControlCount += 1
      }

      const finalStats = calculateBattleStats(
        pokemon.baseStats,
        member.ivs,
        member.evs,
        level,
        member.natureId,
      )
      const scarfMultiplier = member.itemId === 'choice-scarf' ? 1.5 : 1
      const mapMember: TeamSpeedMapMember = {
        slot: member.slot,
        pokemonId: member.pokemonId,
        pokemonName: pokemon.name,
        baseSpeed: pokemon.baseStats.spe,
        finalSpeed: finalStats.spe,
        effectiveSpeed: Math.floor(finalStats.spe * scarfMultiplier),
      }

      const bucketKey = speedBucketFromBase(mapMember.baseSpeed)
      buckets[bucketKey].members.push(mapMember)
    }

    const allMembers = (
      Object.values(buckets).flatMap((bucket) => bucket.members) as TeamSpeedMapMember[]
    ).sort((a, b) => a.slot - b.slot)

    const total = allMembers.length
    for (const key of ['slow', 'mid', 'fast', 'veryFast'] as const) {
      const count = buckets[key].members.length
      buckets[key].count = count
      buckets[key].percent = total > 0 ? Math.round((count / total) * 100) : 0
    }

    const orderedByCount = (['slow', 'mid', 'fast', 'veryFast'] as const)
      .map((key) => ({ key, count: buckets[key].count }))
      .sort((a, b) => b.count - a.count)

    let profile: SpeedProfileKey = 'empty'
    if (total > 0) {
      const top = orderedByCount[0]
      const second = orderedByCount[1]
      profile = top.count > 0 && top.count > second.count ? top.key : 'mixed'
    }

    const result: TeamSpeedMap = {
      level,
      total,
      profile,
      buckets,
      hasTailwind,
      hasTrickRoom,
      speedControlCount,
    }
    speedMapCache.set(mode, { key, value: result })
    return result
  }

  return {
    weights,
    normalizedWeights,
    setWeight,
    applyWeightPreset,
    getTeamAnalytics,
    getMemberAnalytics,
    getTeamScoreBreakdown,
    getThreatResponses,
    getThreatResponseSummary,
    getThreatAlerts,
    getOffensivePressureSummary,
    getOffensivePressureAlerts,
    getTeamSpeedMap,
    getTeamTeraDependency,
    getTeraDependencyAlerts,
    WEIGHT_PRESETS,
  }
})
