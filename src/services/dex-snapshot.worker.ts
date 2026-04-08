/// <reference lib="webworker" />

type DexSnapshotWorkerRequest = {
  id: number
  path: string
}

type DexSnapshotWorkerSuccessResponse = {
  id: number
  ok: true
  payload: unknown
}

type DexSnapshotWorkerErrorResponse = {
  id: number
  ok: false
  error: string
}

type DexSnapshotWorkerResponse =
  | DexSnapshotWorkerSuccessResponse
  | DexSnapshotWorkerErrorResponse

declare const self: DedicatedWorkerGlobalScope
const SNAPSHOT_FETCH_CACHE_MODE: RequestCache = import.meta.env.DEV ? 'no-store' : 'force-cache'

self.onmessage = async (event: MessageEvent<DexSnapshotWorkerRequest>) => {
  const { id, path } = event.data

  try {
    const payload = await requestJson(path)
    const response: DexSnapshotWorkerSuccessResponse = {
      id,
      ok: true,
      payload,
    }
    self.postMessage(response satisfies DexSnapshotWorkerResponse)
  } catch (error) {
    const response: DexSnapshotWorkerErrorResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Dex snapshot worker request failed',
    }
    self.postMessage(response satisfies DexSnapshotWorkerResponse)
  }
}

async function requestJson(path: string): Promise<unknown> {
  const compressed = await requestCompressedJson(`${path}.gz`)
  if (compressed) return compressed

  const response = await fetch(path, { cache: SNAPSHOT_FETCH_CACHE_MODE })
  if (!response.ok) {
    throw new Error(`Dex snapshot request failed (${response.status}) for ${path}`)
  }
  return response.json()
}

async function requestCompressedJson(path: string): Promise<unknown | null> {
  try {
    const response = await fetch(path, { cache: SNAPSHOT_FETCH_CACHE_MODE })
    if (!response.ok || !response.body) return null

    const contentEncoding = response.headers.get('content-encoding')?.toLowerCase() ?? ''
    if (contentEncoding.includes('gzip')) {
      return response.json()
    }

    if (typeof DecompressionStream === 'undefined') return null

    const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'))
    const text = await new Response(decompressedStream).text()
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export {}
