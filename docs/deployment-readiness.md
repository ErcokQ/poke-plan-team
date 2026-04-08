# Preparacion para despliegue continuo

## Estado actual

### Lo que ya esta bien
- El proyecto es un frontend estatico con build reproducible via Vite.
- Hay version minima de Node declarada en `package.json`.
- La salud base actual es buena:
  - `npm run type-check`
  - `npm run test:unit -- --run`
  - `npm run build`
  pasan en el estado revisado.
- Existe un flujo de datos local-first con snapshots versionados en `public/dex-snapshots`.
- Ya hay checklist manual de release en `docs/release-checklist.md`.

### Lo que todavia falta para CD confiable
- No existe pipeline declarada en el repositorio (`.github/workflows`, `vercel.json`, `netlify.toml`, `Dockerfile`, etc.).
- El proveedor objetivo ya esta decidido: VPS propia bajo `m3rsync.com/estanque-de-mudkip/`, pero todavia falta versionar la automatizacion de ese flujo.
- La aplicacion usa `createWebHistory`, por lo que el hosting necesita fallback SPA a `index.html`.
- El build publicado es pesado porque incluye snapshots grandes en `public/dex-snapshots`.
- `dex:sync` sigue siendo un paso manual previo al release y depende de red externa (`PokeAPI`).
- La documentacion publica principal (`README.md`) no refleja el estado real del runtime y todavia describe el proyecto como `API-first`.
- No existe contrato explicito de variables de entorno para build/deploy (`.env.example` o documento equivalente).
- El script `lint` actual modifica archivos (`eslint . --fix`), lo cual no es adecuado como check de CI.

## Hallazgos clave

### 1. El proyecto es desplegable, pero no esta listo para CD automatizado
La build funciona y el artefacto sale correctamente, pero todavia no hay un pipeline versionado ni reglas de promocion entre ambientes.

### 2. El principal riesgo operativo no es el bundle JS, sino los snapshots publicados
La carpeta `dist/` pesa alrededor de 108 MB y `public/dex-snapshots/` explica casi todo ese volumen. Esto afecta:
- tiempos de upload del artefacto
- costo y duracion del deploy
- cache invalidation
- tiempo de primer despliegue o rollback

### 3. El hosting debe soportar SPA fallback
La app usa historial HTML5, no hash routing. Si el proveedor no reescribe rutas a `index.html`, links como `/vgc/dex` van a romper al refrescar.

### 4. El proceso de release todavia mezcla trabajo humano con build automatizable
Hoy el paso critico es:
1. correr `npm run dex:sync`
2. revisar snapshots
3. correr checks
4. publicar

Eso sirve para release manual, pero no para despliegue continuo sin una politica explicita.

### 5. Hay desalineacion documental
`README.md` todavia documenta un modelo `API-first`, mientras que la arquitectura actual es `runtime local-first`. Esa diferencia vuelve ambiguo el deploy para cualquiera que no haya seguido la refactorizacion reciente.

## Riesgos para despliegue continuo

### Riesgo alto
- Pipeline inexistente en repo.
- Fallback SPA no documentado ni configurado.
- `lint` no apto como check inmutable de CI.

### Riesgo medio
- Artefacto muy grande por snapshots.
- `dex:sync` depende de terceros y puede introducir variaciones entre builds si no se controla.
- No hay versionado semantico ni tagging de release definido.

### Riesgo bajo
- Dependencias externas opcionales (`data.pkmn.cc`, sprites remotos) ya no bloquean la funcionalidad principal, pero igual conviene observarlas en smoke tests.

## Recomendacion tecnica

### Objetivo de fase 1
Cerrar la base minima para poder automatizar build + validacion + preview deploy sin introducir todavia promotion flows complejos.

### Base recomendada
- Formalizar el target actual:
  - VPS propia
  - dominio `m3rsync.com`
  - subruta `/estanque-de-mudkip/`
- Versionar una pipeline minima de CI:
  - install
  - `npm ci`
  - `npm run type-check`
  - `npm run test:unit -- --run`
  - `npm run build`
- Separar checks de escritura:
  - mantener `lint` para autofix local
  - agregar `lint:check` sin `--fix` para CI
- Documentar variables y defaults reales:
  - `VITE_DEX_SOURCE`
  - `VITE_DEX_LOCALE`
  - cualquier otro valor soportado en build
- Documentar y configurar el fallback SPA del proveedor elegido.

## Plan recomendado por fases

### Fase 1: saneamiento para CI
- actualizar `README.md` al modelo actual
- agregar `docs/deployment-readiness.md`
- agregar `lint:check`
- agregar `.env.example`
- definir proveedor objetivo

### Fase 2: pipeline de CI
- agregar workflow de PR y branch principal
- cachear dependencias `npm`
- ejecutar checks inmutables
- publicar artifact de `dist/` para inspeccion

### Fase 3: pipeline de CD
- decidir si `dex:sync` corre:
  - dentro del pipeline
  - o fuera del pipeline y se comitea el resultado
- automatizar despliegue a preview
- automatizar despliegue a produccion solo desde branch/tag controlado

### Fase 4: hardening operacional
- definir headers de cache para snapshots `json` y `json.gz`
- observar tiempo total de build y peso del artefacto
- definir estrategia de invalidacion de cache en deploy
- evaluar si conviene externalizar snapshots a CDN o almacenamiento dedicado

## Decision importante pendiente

### Opcion A: snapshots versionados en git
Ventajas:
- build reproducible
- deploy simple
- rollback simple

Costo:
- repo y artifact pesados
- diffs voluminosos

### Opcion B: snapshots generados en pipeline
Ventajas:
- repo mas liviano
- proceso mas automatizado

Costo:
- dependencia fuerte en `PokeAPI` al momento de release
- builds menos deterministas si cambia la fuente

### Recomendacion
Para este proyecto y este despliegue en VPS, hoy la opcion mas segura es mantener snapshots versionados en git y no regenerarlos en cada deploy. Despues se puede reevaluar externalizarlos o generarlos en pipeline.

## Checklist tecnico previo a implementar CD
- elegir proveedor de hosting
- fijar estrategia para `dex:sync`
- crear check de lint no destructivo
- alinear README con arquitectura real
- definir variables de entorno soportadas
- documentar fallback SPA
- decidir politica de cache para snapshots

## Validacion realizada en este analisis
- `npm run type-check`
- `npm run test:unit -- --run`
- `npm run build`
