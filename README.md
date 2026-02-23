# Poke Plan Team MVP

Frontend MVP for competitive Pokemon planning with:

- Team builder (VGC and Singles)
- Individual and team analytics
- Auto strategy + manual edits
- Local persistence and JSON/Showdown import-export
- ES/EN UI

## Tech stack

- Vue 3 + TypeScript + Vite
- Pinia
- Vue Router
- Vue I18n
- VueUse
- Zod
- Chart.js + vue-chartjs

## Routes

- `/vgc/builder`
- `/vgc/analytics`
- `/vgc/strategy`
- `/vgc/dex`
- `/singles/builder`
- `/singles/analytics`
- `/singles/strategy`
- `/singles/dex`

## Scripts

```sh
npm run dev
npm run type-check
npm run lint
npm run test:unit -- --run
npm run build
```

## Persistence keys

- `pokeplan.v1.teams`
- `pokeplan.v1.preferences`
- `pokeplan.v1.weights`
- `pokeplan.v1.lastMode`
- `pokeplan.v1.strategy`

## PokeAPI Dex source (default)

The app is API-first and tries to load data from PokeAPI on startup.  
If the request fails, the store falls back to local mocks (`src/data/mock`).

You can tune limits with env vars:

```sh
VITE_DEX_LOCALE=es
VITE_DEX_POKEMON_LIMIT=1025
VITE_DEX_MOVES_LIMIT=700
VITE_DEX_ITEMS_LIMIT=700
VITE_DEX_CONCURRENCY=12
```

To force mock-only mode:

```sh
VITE_DEX_SOURCE=mock
```
