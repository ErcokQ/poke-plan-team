import { MAX_EV_PER_STAT, STATS, type StatBlock, type StatKey } from '@/models/domain'

type NatureModifier = {
  up: StatKey | null
  down: StatKey | null
}

const NEUTRAL: NatureModifier = { up: null, down: null }

const NATURE_MODIFIERS: Record<string, NatureModifier> = {
  hardy: NEUTRAL,
  lonely: { up: 'atk', down: 'def' },
  brave: { up: 'atk', down: 'spe' },
  adamant: { up: 'atk', down: 'spa' },
  naughty: { up: 'atk', down: 'spd' },

  bold: { up: 'def', down: 'atk' },
  docile: NEUTRAL,
  relaxed: { up: 'def', down: 'spe' },
  impish: { up: 'def', down: 'spa' },
  lax: { up: 'def', down: 'spd' },

  timid: { up: 'spe', down: 'atk' },
  hasty: { up: 'spe', down: 'def' },
  serious: NEUTRAL,
  jolly: { up: 'spe', down: 'spa' },
  naive: { up: 'spe', down: 'spd' },

  modest: { up: 'spa', down: 'atk' },
  mild: { up: 'spa', down: 'def' },
  quiet: { up: 'spa', down: 'spe' },
  bashful: NEUTRAL,
  rash: { up: 'spa', down: 'spd' },

  calm: { up: 'spd', down: 'atk' },
  gentle: { up: 'spd', down: 'def' },
  sassy: { up: 'spd', down: 'spe' },
  careful: { up: 'spd', down: 'spa' },
  quirky: NEUTRAL,
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function getNatureModifier(natureId: string): NatureModifier {
  return NATURE_MODIFIERS[natureId.toLowerCase()] ?? NEUTRAL
}

export function getNatureMultiplier(natureId: string, stat: StatKey): number {
  const modifier = getNatureModifier(natureId)
  if (modifier.up === stat) return 1.1
  if (modifier.down === stat) return 0.9
  return 1
}

export function calculateBattleStats(
  baseStats: StatBlock,
  ivs: Record<StatKey, number>,
  evs: Record<StatKey, number>,
  level: number,
  natureId: string,
): StatBlock {
  const safeLevel = clamp(level, 1, 100)
  const result = {} as StatBlock

  for (const stat of STATS) {
    const base = clamp(baseStats[stat], 1, 255)
    const iv = clamp(ivs[stat], 0, 31)
    const statPoints = clamp(evs[stat], 0, MAX_EV_PER_STAT)
    const scaled = Math.floor(((2 * base + iv + statPoints * 2) * safeLevel) / 100)

    if (stat === 'hp') {
      // Shedinja always has 1 HP regardless of IV/EV.
      result.hp = base === 1 ? 1 : scaled + safeLevel + 10
      continue
    }

    const raw = scaled + 5
    result[stat] = Math.floor(raw * getNatureMultiplier(natureId, stat))
  }

  return result
}
