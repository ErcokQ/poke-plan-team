const baseUrl = import.meta.env.BASE_URL || '/'

export function resolvePublicAssetPath(relativePath: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = relativePath.replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}
