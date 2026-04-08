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

## Estructura recomendada en VPS

Ejemplo:

```txt
/var/www/m3rsync.com/
  estanque-de-mudkip/
    index.html
    assets/
    dex-snapshots/
    favicon...
```

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

    location /estanque-de-mudkip/dex-snapshots/ {
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
- `dex-snapshots/` no usan nombres con hash, por eso conviene cache corto
- los pares `*.json.gz` deben publicarse tal cual junto con `*.json`

## Flujo recomendado de release

1. si cambian datos Dex, correr `npm run dex:sync`
2. revisar diff de snapshots
3. correr checks
4. compilar
5. copiar `dist/` al path publicado en la VPS
6. recargar Nginx si hace falta

## Flujo recomendado de CD mas adelante

1. pipeline de CI valida `type-check`, tests y build
2. branch principal genera artefacto `dist`
3. deploy por `rsync` o similar a `/var/www/m3rsync.com/estanque-de-mudkip/`
4. smoke rapido sobre la URL final
