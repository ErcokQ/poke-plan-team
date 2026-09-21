import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { DexCatalogSnapshot, DexChampionsAvailabilitySnapshot } from '@/models/dex'
import { getEffectiveLearnsetMoveIds } from '@/utils/move-legality'

const root = path.resolve('public/dex-snapshots')
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T
const expectedMegas = {
  'absol-mega-z': ['sharpness', 'absolite-z'],
  'salamence-mega': ['aerilate', 'salamencite'],
  'garchomp-mega-z': ['levitate', 'garchompite-z'],
  'lucario-mega-z': ['aura-guard', 'lucarionite-z'],
  'golisopod-mega': ['tough-claws', 'golisopite'],
  'baxcalibur-mega': ['thermal-exchange', 'baxcalibrite'],
} as const

describe('Champions regulation M-C snapshots', () => {
  const availability = read<DexChampionsAvailabilitySnapshot>('champions/availability.json')
  const additions = availability.entries.filter((entry) => entry.introducedIn === 'regulation-m-c')
  it('adds the full roster including alternate forms without removing previous regulations', () => {
    expect(additions).toHaveLength(35)
    expect(additions.filter((entry) => entry.formId)).toHaveLength(6)
    expect(availability.entries.some((entry) => entry.pokemonId === 'venusaur')).toBe(true)
    expect(availability.entries.some((entry) => entry.pokemonId === 'raichu' && entry.formId === 'raichu-mega-x')).toBe(true)
    expect(new Set(availability.entries.map((entry) => entry.formId || entry.pokemonId)).size).toBe(availability.entries.length)
  })
  for (const locale of ['es', 'en']) {
    const catalog = read<DexCatalogSnapshot>(`${locale}/catalog.json`)
    const pokemon = new Map(catalog.pokemon.map((entry) => [entry.id, entry]))
    const moves = new Map(catalog.moves.map((entry) => [entry.id, entry]))
    const items = new Map(catalog.items.map((entry) => [entry.id, entry]))
    it(`${locale}: resolves every new Pokemon, legal movepool, ability and Mega Stone`, () => {
      for (const entry of additions) {
        const mon = pokemon.get(entry.formId || entry.pokemonId)
        expect(mon).toBeDefined()
        expect(mon!.championsLearnsetMoves!.length).toBeGreaterThan(0)
        for (const id of mon!.championsLearnsetMoves!) expect(moves.has(id)).toBe(true)
        for (const id of mon!.abilities) expect(catalog.abilities.some((ability) => ability.id === id)).toBe(true)
      }
      for (const [id, [ability, stone]] of Object.entries(expectedMegas)) {
        expect(pokemon.get(id)?.abilities).toEqual([ability])
        expect(pokemon.get(id)?.requiredItemId).toBe(stone)
        expect(items.get(stone)?.championsAvailable).toBe(true)
      }
      expect(items.get('choice-band')?.championsAvailable).toBe(false)
      expect(items.get('terrain-extender')?.championsAvailable).toBe(true)
    })
    it(`${locale}: uses current balance data and does not reintroduce forbidden moves through pre-evolutions`, () => {
      expect(moves.get('first-impression')?.power).toBe(100)
      expect(moves.get('snipe-shot')?.power).toBe(85)
      expect(moves.get('meteor-assault')?.power).toBe(170)
      expect(moves.get('slash')?.power).toBe(80)
      expect(moves.get('wish')?.pp).toBe(8)
      expect(moves.get('strength-sap')?.pp).toBe(8)
      expect(moves.get('double-shock')?.accuracy).toBeNull()
      const archaludon = getEffectiveLearnsetMoveIds(pokemon.get('archaludon'), (id) => pokemon.get(id))
      expect(archaludon).not.toContain('mirror-coat')
      expect(archaludon).not.toContain('metal-burst')
      expect(archaludon).not.toContain('body-press')
      expect(getEffectiveLearnsetMoveIds(pokemon.get('politoed'), (id) => pokemon.get(id))).not.toContain('pound')
      expect(getEffectiveLearnsetMoveIds(pokemon.get('rillaboom'), (id) => pokemon.get(id))).toContain('grassy-glide')
      expect(moves.get('slash')?.tags).toContain('slicing')
      expect(moves.get('aura-sphere')?.tags).not.toContain('contact')
    })
    it(`${locale}: serves identical JSON and compressed catalogs`, () => {
      expect(gunzipSync(readFileSync(path.join(root, `${locale}/catalog.json.gz`))).toString()).toBe(readFileSync(path.join(root, `${locale}/catalog.json`), 'utf8'))
    })
  }
})
