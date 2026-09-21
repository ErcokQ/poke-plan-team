# Champions data

Este directorio contiene la fuente editable del overlay editorial para `Pokemon Champions`.

## Archivo principal
- `availability.source.json`
- `form-overrides.source.json`
- `regulation-m-c.source.json`
- `meta-usage.source.json`

## Regla
- editar aqui
- no editar directamente `public/dex-snapshots/champions/*`
- no editar directamente `public/meta-snapshots/champions/*`
- para aplicar disponibilidad, formas, habilidades, learnsets, objetos y balance de M-C ejecuta `npm run champions:regulation:sync`
- para refrescar meta usage ejecuta `npm run champions:meta:sync`

## Motivo
`Pokemon Champions` no tiene hoy un API publica estable para disponibilidad de especies y formas. Por eso el proyecto mantiene un dataset propio, versionado en git y validado por el equipo.

La informacion de meta usage se guarda tambien como snapshot local para evitar scraping o llamadas externas durante el uso normal de la app. El script de sincronizacion extrae datos publicos de Pikalytics Champions y deja el resultado listo para runtime.
