# Remediacion de rendimiento

## Hallazgos atacados
- hidratacion global excesiva contra `PokeAPI`
- ruta Dex con llamadas directas a red
- carga pesada del learnset al abrir modal
- persistencia sincrona en builder y damage calc
- cache en memoria sin limites
- dependencia visible de `data.pkmn.cc`

## Estrategia aplicada

### 1. Datos locales primero
- `VITE_DEX_SOURCE` pasa a `snapshot` por defecto
- se anadieron snapshots core y snapshots Dex por generacion
- `ModeLayout` hidrata catalogo desde `dexStore.ensureCatalogLoaded`

### 2. Store-first en runtime
- `DexPage` ya no usa `dexService`
- el listado por generacion sale de snapshots `generation.genN`
- el perfil abre con resumen inmediato y learnset lazy por bucket
- `BuilderPage` resuelve habilidades desde `dexStore`
- el parseo de snapshots Dex ahora se intenta hacer en `Web Worker` para sacar trabajo del hilo principal

### 3. Persistencia buffered
- `teamStore` migra de `useStorage` a `useBufferedStorage`
- `damage-calc` migra de `useStorage` a `useBufferedStorage`
- se reduce presion de escritura durante sliders y campos numericos

### 4. Hardening
- `DexService` usa TTL/LRU en cache en memoria
- meta usage y meta templates degradan a modo local sin bloquear UX
- los resultados de busqueda grandes se siguen acotando tambien con query
- los snapshots se generan tambien en `gzip` y el runtime los prioriza para reducir transferencia aun en hosting estatico basico

## Budgets y expectativas
- entrar a builder, analytics o damage-calc: 0 requests a `PokeAPI` en modo `snapshot/mock`
- abrir Dex por generacion: 0 requests a `PokeAPI`
- abrir modal de Pokemon: resumen inmediato desde snapshot local
- cargar learnset: un unico bucket local cuando hace falta
- persistencia UI: escritura diferida, no por cada tick

## Riesgos residuales
- los snapshots son mas pesados que los mocks y deben regenerarse cuando cambie la estrategia de datos
- el script `dex:sync` depende de disponibilidad de `PokeAPI`
- el catalogo incluye variedades; la Dex lista se deduplica por numero nacional, pero builder y otros flujos siguen pudiendo usar formas
- los details siguen siendo el bloque mas caro del dominio Dex, aunque ahora estan bucketizados y parseados fuera del hilo principal cuando el entorno lo permite
- todavia no se introdujo virtualizacion; si aparecen listas lentas en moviles de gama baja habra que medir antes de tocar UI

## Criterios de aceptacion implementados
- el runtime principal ya no depende de `PokeAPI`
- la ruta Dex no usa `dexService`
- `mock` y `snapshot` funcionan a traves del store
- `data.pkmn.cc` deja de ser dependencia critica
- existe documentacion operativa del nuevo flujo
