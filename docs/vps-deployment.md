# Deploy automatico en VPS

## Objetivo y arquitectura

La aplicacion se publica como SPA estatica en:

- URL: `https://m3rsync.com/estanque-de-mudkip/`
- Virtualmin/Apache: `/home/<VPS_VIRTUALMIN_USER>/public_html`
- releases: `/home/<VPS_VIRTUALMIN_USER>/releases/estanque-de-mudkip/<sha>`
- ruta publica: `public_html/estanque-de-mudkip` como enlace a la release activa

Este contrato sigue el despliegue existente de `mundial-predictor` en la misma
VPS. Esta aplicacion no necesita Node, PM2, proxy inverso ni base de datos en el
servidor: GitHub Actions construye `dist/` y la VPS solo sirve archivos.

## Flujo de ramas

```text
dev/release-mc -> qa -> prod -> deploy automatico
```

La rama de integracion usa `dev/release-mc` porque ya existe
`dev/champions-overlay` y Git no permite tener simultaneamente una rama `dev`.
Promocionar el mismo commit revisado a `qa` y luego a `prod`. El push a `prod`
es el unico evento que publica en la VPS.

## CI/CD

`.github/workflows/release.yml` ejecuta con Node 22:

1. `npm ci`.
2. Verificacion de pares de snapshots JSON/GZ.
3. Lint sin escritura.
4. Pruebas unitarias.
5. Build de produccion con type-check.
6. Almacena exactamente ese `dist/` como artefacto.
7. En `prod`, sube una release versionada, cambia el enlace publico y ejecuta
   smoke sobre una ruta SPA y el catalogo local.
8. Si el smoke falla, restaura la release anterior.

Las tareas `dex:sync`, `champions:regulation:sync` y `champions:meta:sync` son
mantenimiento previo a la release. No se ejecutan durante el deploy, por lo
que una publicacion no depende de PokeAPI ni de otras fuentes externas.

## Entorno y secretos de GitHub

Crear el environment `production`, restringirlo a `prod` y registrar:

| Nombre | Tipo | Uso |
| --- | --- | --- |
| `VPS_HOST` | secret | IP o host SSH de la VPS |
| `VPS_USER` | secret | Usuario que ejecuta SSH/rsync |
| `VPS_SSH_KEY` | secret | Clave privada ed25519 sin passphrase para CD |
| `VPS_KNOWN_HOSTS` | secret | Linea verificada de `known_hosts` para la VPS |
| `VPS_VIRTUALMIN_USER` | secret | Propietario del virtual server `m3rsync.com` |
| `VPS_PORT` | secret opcional | Puerto SSH; usa 22 si esta vacio |

La huella no se obtiene con `ssh-keyscan` dentro del workflow. Debe verificarse
por un canal confiable y guardarse en `VPS_KNOWN_HOSTS`, evitando confiar en
una respuesta de red no autenticada durante el despliegue.

## Preparacion unica de la VPS

Usar preferentemente el usuario de Virtualmin también como `VPS_USER`. Así el
deploy conserva el propietario esperado del virtual server. Sustituir el
marcador por ese usuario:

```bash
sudo -u VIRTUALMIN_USER mkdir -p \
  /home/VIRTUALMIN_USER/releases/estanque-de-mudkip
```

Agregar la clave publica dedicada a `~VIRTUALMIN_USER/.ssh/authorized_keys` y
confirmar que ese usuario puede crear carpetas y enlaces en las dos rutas
anteriores. Si `VPS_USER` debe ser distinto, concederle solo esos permisos sin
cambiar el propietario de todo `public_html`.
El workflow agrega `.htaccess` con fallback SPA, cache larga para JS/CSS/fuentes
compilados y cache corta para snapshots. El vhost HTTPS actual de
`m3rsync.com` tiene `AllowOverride none` sobre `public_html`; por eso hay que
habilitar `FileInfo` específicamente para la ruta pública de la aplicación.
Apache conserva la ruta del enlace simbólico al combinar bloques `Directory`,
así que el bloque debe apuntar a `public_html/estanque-de-mudkip`, no a la
carpeta destino bajo `releases`. Agregar en los bloques HTTP y HTTPS del virtual
host:

```apache
<Directory /home/m3rsync/public_html/estanque-de-mudkip>
    Options -Indexes
    AllowOverride FileInfo
    Require all granted
</Directory>
```

Apache necesita `mod_rewrite` y `mod_headers`. Después de editar, ejecutar como
administrador:

```bash
apachectl configtest
systemctl reload apache2
```

No hace falta habilitar `.htaccess` para todo `public_html`; el bloque anterior
limita el cambio a esta aplicación.

Si `public_html/estanque-de-mudkip` ya existe como directorio real, el script
se detiene deliberadamente. Migrarlo una sola vez, conservando respaldo:

```bash
mv /home/VIRTUALMIN_USER/public_html/estanque-de-mudkip \
  /home/VIRTUALMIN_USER/public_html/estanque-de-mudkip.pre-cd
```

No ejecutar esa migracion hasta revisar que la ruta y el contenido actuales
sean los esperados.

## Build

Produccion usa `.env.production`:

```text
VITE_APP_BASE_PATH=/estanque-de-mudkip/
VITE_DEX_SOURCE=snapshot
```

El workflow publica el artefacto `dist/`; no sincroniza el repositorio completo
ni instala dependencias en la VPS.

## Verificacion y rollback

El deploy prueba automáticamente:

```text
https://m3rsync.com/estanque-de-mudkip/vgc/dex
https://m3rsync.com/estanque-de-mudkip/dex-snapshots/es/catalog.json
```

Para verificar manualmente, abrir también Builder, Analitica, Estrategia y
Damage Calc, y refrescar una ruta interna. Para rollback manual, apuntar el
enlace `public_html/estanque-de-mudkip` a un SHA anterior verificado y repetir
los smoke. Las releases antiguas no se eliminan automáticamente.

La primera ejecución debe supervisarse desde GitHub Actions y desde los logs de
Apache/Virtualmin. La validacion local no demuestra permisos SSH, configuracion
de Apache, TLS ni disponibilidad publica.
