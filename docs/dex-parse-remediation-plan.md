# Plan de remediacion del parseo Dex

## Problema
La transferencia ya esta mitigada con snapshots locales y variantes `gzip`, pero el runtime todavia paga un coste evitable de `inflate + JSON.parse + allocation` porque el catalogo global mezcla datos de varios casos de uso.

El cuello principal era que el snapshot core arrastraba datos Dex que builder, analytics y damage calc no necesitan para arrancar.

## Objetivo
Reducir parseo y asignacion de memoria en cliente sin introducir dependencias nuevas ni romper el flujo local-first.

## Estrategia por fases

### Fase 1: split + dedupe
Separar el catalogo global de los resumenes Dex por generacion.

Resultado esperado:
- `catalog.json` queda reservado al runtime core
- la ruta Dex carga summaries por generacion
- el core deja de parsear datos Dex que no usa

Entregables:
- `DexCatalogSnapshot` sin `profileSummaries`
- `DexGenerationSnapshot`
- script `dex:sync` generando:
  - `catalog.json(.gz)`
  - `generation.gen{n}.json(.gz)`
  - `profiles.gen{n}.bucket{k}.json(.gz)`
- `dexStore` con:
  - `ensureCatalogLoaded(locale)`
  - `ensureGenerationLoaded(generation, locale)`
  - `ensurePokemonProfileDetails(id, locale)`

### Fase 2: buckets chicos para profile details
Partir los learnsets y metadatos pesados en buckets pequenos por generacion.

Resultado esperado:
- abrir modal deja de depender del parseo de `profiles.genN` completo
- cada apertura solo parsea el bucket que contiene al Pokemon solicitado

Entregables:
- `DexGenerationSnapshot` con `detailBucketsByPokemonId`
- `DexProfileSnapshot` con `bucketId`
- script `dex:sync` generando `profiles.gen{n}.bucket{k}.json(.gz)`
- `dexStore.ensurePokemonProfileDetails()` resolviendo el bucket correcto antes de cargar

### Fase 3: parse fuera del hilo principal
Mover `fetch + decompress + JSON.parse` de snapshots Dex a un `Web Worker`, manteniendo fallback al hilo principal cuando el entorno no soporte workers o si falla la inicializacion.

Resultado esperado:
- el coste pesado de parse deja de bloquear interacciones en el hilo principal
- el contrato de `dexStore` no cambia
- la compatibilidad se mantiene con fallback seguro

Entregables:
- worker dedicado para snapshots Dex
- `dexSnapshotService` con enrutamiento oportunista al worker
- documentacion actualizada del fallback

## Contratos de datos

### Core catalog
Uso:
- builder
- analytics
- damage calc
- lookups generales

Incluye:
- `pokemon`
- `moves`
- `items`
- `abilities`
- `formsByPokemonId`

No incluye:
- `profileSummaries`
- learnsets detallados

### Generation snapshot
Uso:
- grid/listado Dex
- resumen inmediato del modal

Incluye:
- `DexPokemonProfileSummary[]`
- una sola entrada base por numero nacional

### Profile details snapshot
Uso:
- learnset historico y metadatos pesados del modal

Incluye:
- `DexPokemonProfileDetails[]`
- `bucketId`

## Criterios de aceptacion
- entrar a builder no parsea summaries Dex
- entrar a analytics/damage calc no parsea summaries Dex
- abrir `/dex` solo parsea el summary de la generacion visible
- el modal sigue abriendo con resumen inmediato y learnset lazy
- `npm run dex:sync`, `npm run test:unit -- --run` y `npm run build` pasan

## Estado actual
- Fase 1: completada
- Fase 2: completada
- Fase 3: completada
