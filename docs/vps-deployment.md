# Deploy en VPS

## Objetivo

Publicar la aplicacion en:

- dominio: `m3rsync.com`
- subruta: `/estanque-de-mudkip/`

La aplicacion debe compilarse y servirse como SPA estatica bajo esa subruta.

## Decision sobre dex:sync

### Recomendacion
Mantener `public/dex-snapshots` versionado en git y tratar `npm run dex:sync` como paso de mantenimiento, no de deploy.

### Motivo
- el build queda reproducible
- el deploy no depende de `PokeAPI`
- rollback es simple
- se evita que un cambio externo en `PokeAPI` altere una publicacion sin revision

### Cuando correr dex:sync
- cuando quieras actualizar catalogo Dex
- antes de una release en la que realmente cambien snapshots
- no en cada push ni en cada deploy de la VPS

## Variables de build

Produccion usa:

```sh
VITE_APP_BASE_PATH=/estanque-de-mudkip/
VITE_DEX_SOURCE=snapshot
```

El repositorio ya deja ese valor en `.env.production`.

## Build recomendado

```sh
npm ci
npm run type-check
npm run test:unit -- --run
npm run build
```

El artefacto a publicar es `dist/`.

## Estructura requerida en VPS

Ejemplo:

```txt
/var/www/m3rsync.com/
  estanque-de-mudkip -> .releases/estanque-de-mudkip/<sha>/
  .releases/estanque-de-mudkip/<sha>/
    index.html
    assets/
    dex-snapshots/
    meta-snapshots/
```

El usuario SSH debe poder crear carpetas y enlaces en `/var/www/m3rsync.com`.
Si ya existe `estanque-de-mudkip` como directorio real, el script se detiene:
hay que migrarlo de forma supervisada antes del primer deploy automatizado.
Conservar la release anterior permite restaurarla si falla el smoke. Planificar
limpieza periodica de releases antiguas, sin borrar la release activa.

## Nginx

### Objetivo
- servir la SPA bajo `/estanque-de-mudkip/`
- reescribir rutas al `index.html`
- cachear bien assets compilados
- no cachear demasiado agresivo los snapshots, porque sus nombres son estables

### Ejemplo base

```nginx
server {
    server_name m3rsync.com;

    root /var/www/m3rsync.com;

    location /estanque-de-mudkip/assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~ ^/estanque-de-mudkip/(dex-snapshots|meta-snapshots)/ {
        try_files $uri =404;
        expires 5m;
        add_header Cache-Control "public, max-age=300, must-revalidate";
    }

    location /estanque-de-mudkip/ {
        try_files $uri $uri/ /estanque-de-mudkip/index.html;
    }
}
```

## Notas de cache

- `assets/` del build Vite salen con hash y pueden cachearse agresivamente
- `dex-snapshots/` y `meta-snapshots/` no usan nombres con hash, por eso conviene cache corto
- los pares `*.json.gz` deben publicarse tal cual junto con `*.json`

## Ramas y pipeline

`main` sigue siendo la rama historica. La integracion de esta release se prepara
en `dev/release-mc` (no puede llamarse `dev` porque existe `dev/champions-overlay`).
Promocionar el mismo commit validado a `qa` y despues a `prod`. No mezclar
cambios pendientes de otras ramas sin revisarlos. Configurar proteccion de
`qa` y `prod` y exigir el check `validate` antes de promocionar.

`.github/workflows/release.yml` valida pushes y PR con Node 22, `npm ci`,
pares JSON/GZ (`node scripts/check-snapshots.mjs`), lint, pruebas y build
(que incluye type-check). Solo un push a
`prod` publica el artefacto `dist/` generado por ese mismo commit. `dex:sync`
y las sincronizaciones Champions son tareas manuales antes de la promocion,
no se ejecutan durante CD. La accion de deploy usa el entorno `production` de
GitHub: restringirlo a `prod` y agregar revisores requeridos si se desea
aprobacion adicional antes de publicar.

Configurar en ese entorno los secretos `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
(clave privada para usuario de despliegue con acceso de escritura) y
`VPS_KNOWN_HOSTS` (entrada de host verificada previamente fuera del pipeline).
`VPS_PORT` es una variable opcional (por defecto 22). No guardar secretos
en el repositorio ni aceptar automaticamente la huella SSH. La accion necesita
que Nginx ya sirva el directorio, TLS funcione y el fallback SPA anterior este
aplicado; comprobar `nginx -t` y recargarlo durante la preparacion de la VPS.

El CD copia `dist/` a una carpeta versionada, cambia el symlink y prueba
`/estanque-de-mudkip/vgc/dex` y el catalogo JSON. Ante fallo vuelve al
symlink anterior (si existe) y marca el job como fallido. Para rollback manual,
apuntar `estanque-de-mudkip` a una release anterior verificada y repetir el
smoke; no reusar una carpeta parcial. El pipeline no configura GitHub, VPS,
Nginx ni DNS por si mismo.
