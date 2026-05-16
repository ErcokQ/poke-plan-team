import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function normalizeWindowsPath(value) {
  if (!value) return value
  return String(value).replace(/^\\\\\?\\/, '')
}

const targetCwd = normalizeWindowsPath(process.env.INIT_CWD) || normalizeWindowsPath(repoRoot)
process.chdir(targetCwd)
process.argv = [process.argv[0], 'vite', ...process.argv.slice(1)]

const viteCliPath = path.resolve(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
await import(pathToFileURL(viteCliPath).href)
