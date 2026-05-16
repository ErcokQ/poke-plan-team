import { describe, expect, it } from 'vitest'
import { createEmptyTeam } from './team'
import { importTeamFromShowdown } from './showdown'

const SAMPLE_TEAM = `Aerodactyl @ Aerodactylite
Ability: Unnerve
Jolly Nature
EVs: 2 HP / 32 Atk / 32 Spe
- Rock Slide
- Dual Wingbeat
- Tailwind
- Protect

Farigiraf @ Sitrus Berry
Ability: Armor Tail
Quiet Nature
EVs: 32 HP / 28 SpA / 6 SpD
- Trick Room
- Hyper Voice
- Psychic
- Protect

Rotom-Wash @ Sitrus Berry
Ability: Levitate
Calm Nature
EVs: 32 HP / 32 SpD / 2 Spe
- Thunderbolt
- Hydro Pump
- Will-O-Wisp
- Protect

Aegislash @ Spell Tag
Ability: Stance Change
Quiet Nature
EVs: 32 HP / 20 Atk / 12 SpA / 2 SpD
- King's Shield
- Sacred Sword
- Shadow Ball
- Flash Cannon

Garchomp @ Focus Sash
Ability: Rough Skin
Jolly Nature
EVs: 2 HP / 32 Atk / 32 Spe
- Earthquake
- Dragon Claw
- Rock Slide
- Protect

Sinistcha @ Mental Herb
Ability: Hospitality
Calm Nature
EVs: 32 HP / 17 Def / 17 SpD
- Matcha Gotcha
- Rage Powder
- Trick Room
- Imprison`

describe('showdown import', () => {
  it('imports EVs, default IVs and form aliases from a showdown paste', () => {
    const team = importTeamFromShowdown(SAMPLE_TEAM, 'vgc', createEmptyTeam('vgc', 'Imported VGC Team'))

    expect(team.members[0]?.pokemonId).toBe('aerodactyl')
    expect(team.members[0]?.itemId).toBe('aerodactylite')
    expect(team.members[0]?.natureId).toBe('jolly')
    expect(team.members[0]?.evs).toEqual({ hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 })
    expect(team.members[0]?.ivs).toEqual({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 })

    expect(team.members[1]?.pokemonId).toBe('farigiraf')
    expect(team.members[1]?.evs).toEqual({ hp: 32, atk: 0, def: 0, spa: 28, spd: 6, spe: 0 })

    expect(team.members[2]?.pokemonId).toBe('rotom-wash')
    expect(team.members[2]?.evs).toEqual({ hp: 32, atk: 0, def: 0, spa: 0, spd: 32, spe: 2 })

    expect(team.members[3]?.pokemonId).toBe('aegislash-shield')
    expect(team.members[3]?.abilityId).toBe('stance-change')
    expect(team.members[3]?.evs).toEqual({ hp: 32, atk: 20, def: 0, spa: 12, spd: 2, spe: 0 })
    expect(team.members[3]?.moves).toEqual(['kings-shield', 'sacred-sword', 'shadow-ball', 'flash-cannon'])

    expect(team.members[4]?.pokemonId).toBe('garchomp')
    expect(team.members[5]?.pokemonId).toBe('sinistcha')
    expect(team.members[5]?.evs).toEqual({ hp: 32, atk: 0, def: 17, spa: 0, spd: 17, spe: 0 })
  })
})
