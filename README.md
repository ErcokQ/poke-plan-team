# Estanque de Mudkip

Aplicacion frontend para planeacion competitiva de Pokemon con:

- team builder para `vgc` y `singles`
- analytics y calculo de dano
- Dex con catalogo local, generaciones y perfiles lazy
- persistencia local e import/export
- interfaz `es/en`

## Stack

- Vue 3 + TypeScript + Vite
- Pinia
- Vue Router
- Vue I18n
- VueUse
- Zod
- Chart.js + vue-chartjs

## Arquitectura de datos

El runtime actual es `local-first`:

- la app no depende de `PokeAPI` para cargar catalogo o perfiles base en uso normal
- los datos Dex salen de snapshots versionados en `public/dex-snapshots`
- `PokeAPI` se usa en `scripts/dex-sync.mjs` como fuente de sincronizacion offline
- `dex:sync` aplica un overlay conservador desde Pokemon Showdown para completar huecos cuando `PokeAPI` venga incompleta en formas nuevas
- `data.pkmn.cc` es una fuente opcional y no bloqueante

Documentacion relacionada:

- [Arquitectura](./docs/architecture.md)
- [Overlay de Champions](./docs/champions-overlay.md)
- [Remediacion de rendimiento](./docs/performance-remediation.md)
- [Preparacion para despliegue continuo](./docs/deployment-readiness.md)
- [Deploy en VPS](./docs/vps-deployment.md)

## Scripts

```sh
npm run dev
npm run dex:sync
npm run type-check
npm run lint:check
npm run lint
npm run test:unit -- --run
npm run build
```

## Variables de entorno

Ver `.env.example`.

Variables principales:

```sh
VITE_APP_BASE_PATH=/estanque-de-mudkip/
VITE_DEX_SOURCE=snapshot
VITE_DEX_LOCALE=es
VITE_OWNER_PHOTO_URL=
```

Notas:

- `VITE_APP_BASE_PATH` controla la subruta publica del build
- para produccion en este proyecto se usa `/estanque-de-mudkip/`
- `VITE_DEX_SOURCE=snapshot` es el modo recomendado para runtime
- `VITE_DEX_SOURCE=mock` sirve para desarrollo y offline real
- `VITE_DEX_SOURCE=api` queda solo para mantenimiento y debug

## dex:sync

`npm run dex:sync` consulta `PokeAPI`, aplica overrides de consistencia desde Pokemon Showdown cuando hacen falta y regenera los snapshots locales en `public/dex-snapshots`.

Para este proyecto, la estrategia recomendada es:

- correr `dex:sync` solo cuando quieras refrescar catalogo o datos Dex
- revisar y versionar el diff de snapshots en git
- no ejecutar `dex:sync` en cada deploy automatico de la VPS

Eso mantiene el build reproducible y simplifica rollback.

## Overlay de Champions

La disponibilidad de `Pokemon Champions` no se va a modelar con una API propia en esta fase.

La fuente editable queda en:

- `data/champions/availability.source.json`

La documentacion del contrato y mantenimiento esta en:

- `docs/champions-overlay.md`

El flujo actual es:

- editar `data/champions/availability.source.json`
- ejecutar `npm run dex:sync`
- consumir el snapshot generado desde la Dex

## Rutas principales

- `/vgc/builder`
- `/vgc/analytics`
- `/vgc/strategy`
- `/vgc/damage-calc`
- `/vgc/dex`
- `/singles/builder`
- `/singles/analytics`
- `/singles/strategy`
- `/singles/damage-calc`
- `/singles/dex`
