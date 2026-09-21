# Preparacion para despliegue continuo

La aplicacion es una SPA estatica de Vite publicada bajo
`/estanque-de-mudkip/`. El runtime usa snapshots versionados y el build de
produccion usa `.env.production`; la regeneracion de datos Dex/Champions es
un paso manual revisable, nunca una dependencia del deploy.

## Implementado localmente

- `.github/workflows/release.yml` valida CI en PR y pushes a `main`, `qa`,
  `prod` y `dev/**`: npm ci, consistencia JSON/GZ, lint, pruebas unitarias y
  build con type-check.
- Un push a `prod` puede publicar el artefacto validado mediante SSH/rsync en
  una release versionada, intercambiar el symlink y ejecutar smoke HTTP. El
  script restaura la release anterior si falla el smoke.
- `.env.example`, `.env.production`, `docs/vps-deployment.md` y
  `docs/release-checklist.md` detallan las variables y verificaciones.

## Pendiente antes de activar produccion

- Revisar los cambios funcionales pendientes de Regulation M-C y meta:
  cobertura del roster, habilidades, objetos, movimientos y calculos, mas
  smoke manual de Builder, Dex, Analitica y Firefox/Zen. Los checks locales
  no prueban toda esa cobertura ni el rendimiento real entre navegadores.
- Promocionar solo commits revisados desde `dev/release-mc` a `qa` y despues
  a `prod`, comprobar CI remoto y configurar reglas de proteccion de ramas.
- Preparar el entorno `production` de GitHub con secretos SSH y restriccion a
  `prod`; verificar permisos del usuario VPS, huella SSH, Apache/TLS y fallback
  SPA. Si la ruta publica existente es un directorio, migrarla a symlink de
  forma supervisada antes del primer deploy.
- Hacer smoke real y revisar los logs de la primera publicacion. Una build
  local correcta no demuestra que CI/CD o el servidor esten configurados.

El procedimiento, los secretos requeridos y el rollback estan en
[Deploy en VPS](./vps-deployment.md).
