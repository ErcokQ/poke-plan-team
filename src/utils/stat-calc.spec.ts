import { describe, expect, it } from 'vitest'
import { calculateBattleStats } from './stat-calc'

describe('stat calculator', () => {
  it('uses Pokemon Champions stat points instead of classic 252 EV scaling at level 50', () => {
    const result = calculateBattleStats(
      { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
      { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
      50,
      'adamant',
    )

    expect(result.hp).toBe(207)
    expect(result.atk).toBe(167)
    expect(result.spe).toBe(152)
  })
})
