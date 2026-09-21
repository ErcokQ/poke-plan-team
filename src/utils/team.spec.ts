import { describe, expect, it } from 'vitest'
import type { TeamMember } from '@/models/domain'
import { createEmptyMember, legacyEvToStatPoints, normalizeEvs } from './team'

describe('team stat point normalization', () => {
  it('converts legacy 252 EV spreads into Champions stat points', () => {
    const member: TeamMember = {
      ...createEmptyMember(1),
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    }

    expect(normalizeEvs(member).evs).toEqual({ hp: 1, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 })
  })

  it('keeps native Champions 32/32/2 spreads unchanged', () => {
    const member: TeamMember = {
      ...createEmptyMember(1),
      evs: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    }

    expect(normalizeEvs(member).evs).toEqual({ hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 })
  })

  it('caps stat points at 66 total', () => {
    const member: TeamMember = {
      ...createEmptyMember(1),
      evs: { hp: 32, atk: 32, def: 32, spa: 0, spd: 0, spe: 0 },
    }

    expect(normalizeEvs(member).evs).toEqual({ hp: 2, atk: 32, def: 32, spa: 0, spd: 0, spe: 0 })
  })

  it('maps 252 legacy EVs to 32 stat points', () => {
    expect(legacyEvToStatPoints(252)).toBe(32)
    expect(legacyEvToStatPoints(4)).toBe(1)
  })
})
