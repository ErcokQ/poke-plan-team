import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const directories = ['public/dex-snapshots', 'public/meta-snapshots']
let checked = 0

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await checkDirectory(path)
      continue
    }
    if (!entry.name.endsWith('.json')) continue

    const plain = await readFile(path)
    const compressed = await readFile(`${path}.gz`)
    if (!gunzipSync(compressed).equals(plain)) {
      throw new Error(`Snapshot comprimido desactualizado: ${path}.gz`)
    }
    JSON.parse(plain.toString('utf8'))
    checked += 1
  }
}

await checkDirectory(directories[0])
try {
  await checkDirectory(directories[1])
} catch (error) {
  if (error.code !== 'ENOENT' || error.path !== directories[1]) throw error
}
if (checked === 0) throw new Error('No se encontraron snapshots JSON')
console.log(`${checked} snapshots JSON/GZ verificados`)
