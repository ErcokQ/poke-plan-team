# Release checklist

## Antes de release
- ejecutar `npm run dex:sync` si cambiaron datos Dex
- revisar diff de `public/dex-snapshots/`
- confirmar que existen pares `*.json` y `*.json.gz`
- ejecutar `node scripts/check-snapshots.mjs` para Dex y meta
- confirmar que existen `generation.genN.*` y `profiles.genN.bucketK.*`
- confirmar `VITE_APP_BASE_PATH=/estanque-de-mudkip/` para produccion
- correr `npm run type-check`
- correr `npm run lint:check`
- correr `npm run test:unit -- --run`
- correr `npm run build`

## Smoke manual
- abrir builder en `vgc` y `singles`
- cambiar de idioma y verificar labels del catalogo
- abrir Dex y cambiar entre generaciones
- abrir un Pokemon y confirmar:
  - resumen inmediato
  - learnset visible tras carga lazy
- navegar a damage calc y aplicar plantillas o benchmarks
- probar con red degradada o desconectada:
  - builder sigue usable
  - Dex sigue usable
  - analytics base sigue usable
- probar refresh directo sobre una ruta interna como `/estanque-de-mudkip/vgc/dex`

## Comportamiento esperado ante fallos externos
- si falla `PokeAPI` en runtime:
  - no debe afectar `snapshot` o `mock`
- si falla `data.pkmn.cc`:
  - la app sigue operativa con seeds locales
  - no debe bloquear builder ni damage calc
- si falla un sprite remoto:
  - debe aparecer fallback visual

## Criterios de salida
- sin errores de type-check
- lint sin cambios pendientes
- tests unitarios en verde
- build de produccion exitosa
- CI de `qa` y `prod` en verde antes de activar el despliegue
- smoke manual sin dependencias criticas externas
- snapshots regenerados y versionados junto con el cambio si hubo refresco de catalogo
