import { clear, createStore, del, get, set } from 'idb-keyval'
import type { LocaleCode } from '@/models/domain'

export interface DexCacheEnvelope<T> {
  version: 'v3'
  locale: LocaleCode
  createdAt: number
  ttlMs: number
  payload: T
}

const CACHE_VERSION = 'v3'
const CACHE_PREFIX = 'pokeplan.v3.dex'
const dexCacheStore = createStore('pokeplan-cache', 'dex-catalog')

function isLocaleCode(value: string): value is LocaleCode {
  return value === 'es' || value === 'en'
}

export function makeDexCacheKey(
  locale: LocaleCode,
  section: 'pokemon' | 'moves' | 'items',
): string {
  return `${CACHE_PREFIX}.${locale}.${section}`
}

export function isCacheValid<T>(
  envelope: DexCacheEnvelope<T> | null | undefined,
  now = Date.now(),
): envelope is DexCacheEnvelope<T> {
  if (!envelope) return false
  if (envelope.version !== CACHE_VERSION) return false
  if (!isLocaleCode(envelope.locale)) return false
  if (!Number.isFinite(envelope.createdAt) || envelope.createdAt <= 0) return false
  if (!Number.isFinite(envelope.ttlMs) || envelope.ttlMs <= 0) return false
  return now - envelope.createdAt < envelope.ttlMs
}

export async function getCached<T>(key: string): Promise<DexCacheEnvelope<T> | null> {
  try {
    const value = await get<DexCacheEnvelope<T>>(key, dexCacheStore)
    return value ?? null
  } catch {
    return null
  }
}

export async function setCached<T>(key: string, envelope: DexCacheEnvelope<T>): Promise<void> {
  await set(key, envelope, dexCacheStore)
}

export async function deleteCached(key: string): Promise<void> {
  await del(key, dexCacheStore)
}

export async function clearDexCache(): Promise<void> {
  await clear(dexCacheStore)
}
