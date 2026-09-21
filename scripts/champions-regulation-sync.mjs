import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (file) => JSON.parse(await readFile(path.join(repo, file), 'utf8'))

// Apply reviewed editorial data to existing snapshots without refetching the whole Dex.
// dex-sync also calls this after a full rebuild, so the regulation survives regeneration.
export async function syncChampionsRegulation() {
  const regulation = await readJson('data/champions/regulation-m-c.source.json')
  const availability = await readJson('data/champions/availability.source.json')
  const forms = await readJson('data/champions/form-overrides.source.json')
  const regulationPokemonIds = new Set([...regulation.newPokemonIds, ...regulation.newMegaIds])
  const itemIds = new Set(regulation.availableItemIds)
  const formAbilities = new Map(forms.entries.map((entry) => [entry.formId, entry.abilityIds]))
  const pending = []
  for (const locale of ['es', 'en']) {
    const folder = `public/dex-snapshots/${locale}`
    const catalog = await readJson(`${folder}/catalog.json`)
    const moveMap = new Map(catalog.moves.map((move) => [move.id, move]))
    const pokemonMap = new Map(catalog.pokemon.map((pokemon) => [pokemon.id, pokemon]))
    for (const id of regulationPokemonIds) {
      if (!pokemonMap.has(id)) throw new Error(`Missing Pokemon in ${locale}: ${id}`)
    }
    for (const ability of forms.abilities) {
      const entry = {
        id: ability.id,
        name: ability[locale === 'es' ? 'nameEs' : 'nameEn'],
        shortEffect: ability[locale === 'es' ? 'shortEffectEs' : 'shortEffectEn'],
        effect: ability[locale === 'es' ? 'effectEs' : 'effectEn'],
      }
      const index = catalog.abilities.findIndex((existing) => existing.id === entry.id)
      if (index < 0) catalog.abilities.push(entry)
      else catalog.abilities[index] = entry
    }
    const abilityMap = new Map(catalog.abilities.map((ability) => [ability.id, ability]))
    for (const pokemon of catalog.pokemon) {
      if (regulation.newMegaIds.includes(pokemon.id)) {
        pokemon.abilities = formAbilities.get(pokemon.id)
        if (!pokemon.requiredItemId || !itemIds.has(pokemon.requiredItemId)) {
          throw new Error(`Missing legal Mega Stone for ${pokemon.id}`)
        }
      }
      const learnset = regulation.learnsets[pokemon.id]
      if (learnset) {
        for (const id of learnset) if (!moveMap.has(id)) throw new Error(`Missing move: ${id}`)
        pokemon.championsLearnsetMoves = learnset
      }
    }
    for (const move of catalog.moves) {
      Object.assign(move, regulation.moveOverrides[move.id] ?? {})
      move.tags = [...new Set([...move.tags, ...(regulation.moveFlags[move.id] ?? [])])]
    }
    for (const item of catalog.items) item.championsAvailable = itemIds.has(item.id)
    pending.push([`${folder}/catalog.json`, catalog])
    for (const file of await readdir(path.join(repo, folder))) {
      if (!/^generation\..*\.json$/.test(file)) continue
      const snapshot = await readJson(`${folder}/${file}`)
      let changed = false
      for (const profile of snapshot.profiles) {
        if (regulationPokemonIds.has(profile.id)) {
          profile.gameAvailability = [
            ...new Set([...profile.gameAvailability, 'pokemon-champions']),
          ]
          changed = true
        }
        if (regulation.newMegaIds.includes(profile.id)) {
          profile.abilities = formAbilities.get(profile.id).map((id) => {
            if (!abilityMap.has(id)) throw new Error(`Missing ability: ${id}`)
            return { ...abilityMap.get(id), isHidden: false }
          })
        }
      }
      if (changed) pending.push([`${folder}/${file}`, snapshot])
    }
  }
  pending.push([
    'public/dex-snapshots/champions/availability.json',
    {
      ...availability,
      version: 'v1',
      generatedAt: regulation.reviewedAt + 'T00:00:00.000Z',
    },
  ])
  // Validate both locales before writing anything. Write matching JSON/gzip payloads.
  for (const [file, payload] of pending) {
    const target = path.join(repo, file)
    const content = `${JSON.stringify(payload, null, 2)}\n`
    await writeFile(target, content)
    await writeFile(`${target}.gz`, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }))
  }
  console.log(
    `Champions M-C: ${regulation.newPokemonIds.length} forms, ${regulation.newMegaIds.length} Megas; ${pending.length} snapshots updated.`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncChampionsRegulation().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
