import type { LocaleCode } from '@/models/domain'
import type {
  DexCatalogSnapshot,
  DexChampionsAvailabilitySnapshot,
  DexGenerationSnapshot,
  DexProfileSnapshot,
} from '@/models/dex'
import { DEX_CACHE_VERSION } from '@/services/dex-cache-service'
import { resolvePublicAssetPath } from '@/utils/base-path'

const SNAPSHOT_FETCH_CACHE_MODE: RequestCache = import.meta.env.DEV ? 'no-store' : 'force-cache'

type DexSnapshotWorkerRequest = {
  id: number
  path: string
}

type DexSnapshotWorkerResponse =
  | {
      id: number
      ok: true
      payload: unknown
    }
  | {
      id: number
      ok: false
      error: string
    }

class DexSnapshotWorkerClient {
  private readonly worker: Worker
  private readonly pending = new Map<
    number,
    {
      resolve: (payload: unknown) => void
      reject: (error: Error) => void
    }
  >()
  private nextRequestId = 1

  constructor() {
    this.worker = new Worker(new URL('./dex-snapshot.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (event: MessageEvent<DexSnapshotWorkerResponse>) => {
      const pending = this.pending.get(event.data.id)
      if (!pending) return

      this.pending.delete(event.data.id)
      if (event.data.ok) {
        pending.resolve(event.data.payload)
        return
      }

      pending.reject(new Error(event.data.error))
    }
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Dex snapshot worker failed')
      this.failAll(error)
    }
    this.worker.onmessageerror = () => {
      this.failAll(new Error('Dex snapshot worker returned an unreadable payload'))
    }
  }

  request<T>(path: string): Promise<T> {
    const id = this.nextRequestId++
    const request: DexSnapshotWorkerRequest = { id, path }

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (payload) => resolve(payload as T),
        reject,
      })
      this.worker.postMessage(request)
    })
  }

  dispose() {
    this.failAll(new Error('Dex snapshot worker disposed'))
    this.worker.terminate()
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}

export class DexSnapshotService {
  private readonly catalogCache = new Map<LocaleCode, Promise<DexCatalogSnapshot>>()
  private championsAvailabilityCache: Promise<DexChampionsAvailabilitySnapshot> | null = null
  private readonly generationCache = new Map<string, Promise<DexGenerationSnapshot>>()
  private readonly profileCache = new Map<string, Promise<DexProfileSnapshot>>()
  private workerClient: DexSnapshotWorkerClient | null = null
  private workerDisabled = false

  async loadCatalog(locale: LocaleCode): Promise<DexCatalogSnapshot> {
    if (!this.catalogCache.has(locale)) {
      this.catalogCache.set(
        locale,
        this.requestJson<DexCatalogSnapshot>(
          this.versionedSnapshotPath(resolvePublicAssetPath(`dex-snapshots/${locale}/catalog.json`)),
        ),
      )
    }
    return this.catalogCache.get(locale)!
  }

  async loadProfiles(locale: LocaleCode, generationId: number): Promise<DexProfileSnapshot> {
    return this.loadProfileBucket(locale, generationId, 1)
  }

  async loadChampionsAvailability(): Promise<DexChampionsAvailabilitySnapshot> {
    if (!this.championsAvailabilityCache) {
      this.championsAvailabilityCache = this.requestJson<DexChampionsAvailabilitySnapshot>(
        this.versionedSnapshotPath(resolvePublicAssetPath('dex-snapshots/champions/availability.json')),
      )
    }
    return this.championsAvailabilityCache
  }

  async loadProfileBucket(
    locale: LocaleCode,
    generationId: number,
    bucketId: number,
  ): Promise<DexProfileSnapshot> {
    const key = `${locale}:${generationId}:${bucketId}`
    if (!this.profileCache.has(key)) {
      this.profileCache.set(
        key,
        this.requestJson<DexProfileSnapshot>(
          this.versionedSnapshotPath(
            resolvePublicAssetPath(`dex-snapshots/${locale}/profiles.gen${generationId}.bucket${bucketId}.json`),
          ),
        ),
      )
    }
    return this.profileCache.get(key)!
  }

  async loadGeneration(locale: LocaleCode, generationId: number): Promise<DexGenerationSnapshot> {
    const key = `${locale}:${generationId}`
    if (!this.generationCache.has(key)) {
      this.generationCache.set(
        key,
        this.requestJson<DexGenerationSnapshot>(
          this.versionedSnapshotPath(
            resolvePublicAssetPath(`dex-snapshots/${locale}/generation.gen${generationId}.json`),
          ),
        ),
      )
    }
    return this.generationCache.get(key)!
  }

  resetCache() {
    this.catalogCache.clear()
    this.championsAvailabilityCache = null
    this.generationCache.clear()
    this.profileCache.clear()
  }

  private async requestJson<T>(path: string): Promise<T> {
    const workerResult = await this.requestJsonWithWorker<T>(path)
    if (workerResult !== null) return workerResult

    const compressed = await this.requestCompressedJson<T>(this.toCompressedSnapshotPath(path))
    if (compressed) return compressed

    const response = await fetch(path, { cache: SNAPSHOT_FETCH_CACHE_MODE })
    if (!response.ok) {
      throw new Error(`Dex snapshot request failed (${response.status}) for ${path}`)
    }

    return this.parseJsonResponse<T>(response, path)
  }

  private async requestCompressedJson<T>(path: string): Promise<T | null> {
    if (typeof DecompressionStream === 'undefined') return null

    try {
      const response = await fetch(path, { cache: SNAPSHOT_FETCH_CACHE_MODE })
      if (!response.ok || !response.body) return null

      const contentEncoding = response.headers.get('content-encoding')?.toLowerCase() ?? ''
      if (contentEncoding.includes('gzip')) {
        return await this.parseJsonResponse<T>(response, path)
      }

      const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'))
      const text = await new Response(decompressedStream).text()
      return JSON.parse(text) as T
    } catch {
      return null
    }
  }

  private async requestJsonWithWorker<T>(path: string): Promise<T | null> {
    const client = this.getWorkerClient()
    if (!client) return null

    try {
      return await client.request<T>(path)
    } catch {
      this.workerDisabled = true
      this.workerClient?.dispose()
      this.workerClient = null
      return null
    }
  }

  private getWorkerClient(): DexSnapshotWorkerClient | null {
    if (this.workerDisabled) return null
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return null

    if (!this.workerClient) {
      try {
        this.workerClient = new DexSnapshotWorkerClient()
      } catch {
        this.workerDisabled = true
        return null
      }
    }

    return this.workerClient
  }

  private versionedSnapshotPath(path: string): string {
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}rev=${encodeURIComponent(DEX_CACHE_VERSION)}`
  }

  private toCompressedSnapshotPath(path: string): string {
    const [basePath, queryString = ''] = path.split('?')
    return `${basePath}.gz${queryString ? `?${queryString}` : ''}`
  }

  private async parseJsonResponse<T>(response: Response, path: string): Promise<T> {
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      const preview = text.slice(0, 80).trim()
      throw new Error(`Dex snapshot parse failed for ${path}: ${preview || 'empty response'}`)
    }
  }
}

export const dexSnapshotService = new DexSnapshotService()
