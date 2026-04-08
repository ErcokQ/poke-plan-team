# Arquitectura

## Objetivo
La aplicacion ahora opera en modo `runtime local-first`. El navegador ya no depende de `PokeAPI` para cargar catalogo, generaciones o perfiles base durante el uso normal. `PokeAPI` queda relegada al flujo de sincronizacion de datos.

## Capas principales

### Runtime
- `src/stores/dex.ts`
  Punto unico de acceso a datos Dex en runtime.
- `src/services/dex-snapshot-service.ts`
  Carga artefactos JSON locales versionados por locale y por generacion.
- `src/services/dex-snapshot.worker.ts`
  Hace `fetch`, descompresion `gzip` y parseo JSON fuera del hilo principal cuando el navegador soporta `Worker`.
- `src/services/dex-cache-service.ts`
  Persiste snapshots en IndexedDB con TTL para evitar recargas innecesarias.
- `src/features/*`
  Las vistas consumen `dexStore`; no deben llamar `dexService` directamente.

### Sync / mantenimiento
- `scripts/dex-sync.mjs`
  Consulta `PokeAPI`, aplica un overlay conservador desde Pokemon Showdown para datos faltantes o inconsistentes y genera snapshots locales.
- `src/services/dex-service.ts`
  Se mantiene como fuente de compatibilidad y modo explicito `api`, con cache acotado por TTL/LRU. No debe ser el camino principal de runtime.

## Fuentes de datos

### Snapshots locales
Ubicacion:
- `public/dex-snapshots/es/catalog.json`
- `public/dex-snapshots/en/catalog.json`
- `public/dex-snapshots/{locale}/generation.gen{1-9}.json`
- `public/dex-snapshots/{locale}/profiles.gen{1-9}.bucket{k}.json`

Artefactos de red:
- cada snapshot se publica tambien como `*.json.gz`
- el runtime intenta usar primero la variante comprimida y hace fallback al JSON plano
- en navegadores compatibles, el parseo ocurre en un `Web Worker`; si no, el servicio cae al camino principal sin cambiar contratos

Contratos:
- `DexCatalogSnapshot`
- `DexGenerationSnapshot`
- `DexProfileSnapshot`

Contenido:
- catalogo core para builder/analytics/damage calc
- catalogo de moves/items/abilities localizados
- summaries Dex por generacion
- detalles de learnset separados por generacion y bucket

### Mock
Se usa para desarrollo y offline real cuando `VITE_DEX_SOURCE=mock`.

### API
Se conserva solo para mantenimiento y debug. No debe usarse como configuracion por defecto.

### Overlay de Showdown
Se usa solo en el flujo de `dex:sync` para rellenar huecos cuando `PokeAPI` todavia no trae habilidades, sprites o consistencia suficiente en formas nuevas.

### Overlay editorial de Champions
`Pokemon Champions` se mantiene como dataset separado del pipeline base de `PokeAPI`.

Ubicacion de fuente:
- `data/champions/availability.source.json`

Ubicacion reservada para runtime:
- `public/dex-snapshots/champions/availability.json`

Motivo:
- la disponibilidad de `Champions` no tiene hoy una fuente publica y estable equivalente a `PokeAPI`
- el dato se mantiene como overlay curado por el proyecto
- esto evita introducir una API propia antes de que haga falta

Integracion:
- `scripts/dex-sync.mjs` genera el snapshot de `Champions` desde `data/champions/availability.source.json`
- `dexSnapshotService` lo carga como artefacto separado
- `dexStore` lo fusiona sobre `gameAvailability` para exponerlo en la Dex sin contaminar el pipeline base de `PokeAPI`

## Flujo runtime

1. `ModeLayout` llama `dexStore.ensureCatalogLoaded(locale)`.
2. `dexStore` intenta resolver catalogo desde IndexedDB.
3. Si no existe o expiro, carga `catalog.json` local via `dexSnapshotService`.
4. La ruta Dex carga `generation.genN.json` solo para la generacion visible.
5. Al abrir un Pokemon, la vista renderiza el resumen inmediato ya cargado.
6. El learnset detallado se carga bajo demanda desde `profiles.genN.bucketK.json`.
7. Si el navegador soporta `Worker`, la carga y el parseo del snapshot se hacen fuera del hilo principal.

## Politica de cache y fallback

### Dex snapshots
- cache en IndexedDB por `locale` y seccion
- TTL de 24h
- invalidacion controlada desde `dexStore.invalidateHydration()`
- fetch preferente de snapshots `gzip` para no depender de compresion del hosting
- parseo oportunista en worker con fallback automatico al hilo principal

### DexService
- TTL corto en memoria
- limite maximo de entradas para evitar crecimiento indefinido

### Dependencias externas
- `data.pkmn.cc` es opcional
- si falla, analytics y meta templates siguen operando con datos locales
- los sprites remotos tienen fallback visual ya existente

## Persistencia de UI
- `teamStore` y `damage-calc` usan `useBufferedStorage`
- la escritura fisica a `localStorage` queda debounceada
- el estado reactivo sigue actualizandose al instante en memoria

## Regla de arquitectura
Ningun archivo dentro de `src/features` debe consumir `dexService` directamente. El acceso debe pasar por stores o servicios de snapshots preparados para runtime.
