#!/usr/bin/env bash
set -euo pipefail

: "${VPS_HOST:?Falta VPS_HOST}"
: "${VPS_USER:?Falta VPS_USER}"
: "${VPS_SSH_KEY:?Falta VPS_SSH_KEY}"
: "${VPS_KNOWN_HOSTS:?Falta VPS_KNOWN_HOSTS}"
: "${VPS_VIRTUALMIN_USER:?Falta VPS_VIRTUALMIN_USER}"
: "${RELEASE_SHA:?Falta RELEASE_SHA}"

[[ "$VPS_HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'VPS_HOST invalido' >&2; exit 1; }
[[ "$VPS_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'VPS_USER invalido' >&2; exit 1; }
[[ "$VPS_VIRTUALMIN_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'VPS_VIRTUALMIN_USER invalido' >&2; exit 1; }
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'RELEASE_SHA invalido' >&2; exit 1; }
port="${VPS_PORT:-22}"
[[ "$port" =~ ^[0-9]{1,5}$ ]] || { echo 'VPS_PORT invalido' >&2; exit 1; }
(( 10#$port >= 1 && 10#$port <= 65535 )) || { echo 'VPS_PORT fuera de rango' >&2; exit 1; }

virtualmin_home="/home/$VPS_VIRTUALMIN_USER"
web_root="$virtualmin_home/public_html"
release_root="$virtualmin_home/releases/estanque-de-mudkip"
release="$release_root/$RELEASE_SHA"
live="$web_root/estanque-de-mudkip"
next="$web_root/.estanque-de-mudkip-next-$RELEASE_SHA"
remote="$VPS_USER@$VPS_HOST"

install -m 700 -d "$HOME/.ssh"
printf '%s\n' "$VPS_SSH_KEY" > "$HOME/.ssh/id_ed25519"
chmod 600 "$HOME/.ssh/id_ed25519"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$HOME/.ssh/known_hosts"
chmod 600 "$HOME/.ssh/known_hosts"
ssh_options=(-i "$HOME/.ssh/id_ed25519" -p "$port" -o BatchMode=yes -o StrictHostKeyChecking=yes)

# El usuario SSH debe poder escribir en web_root y release_root. Un directorio real existente
# no se sustituye por un symlink sin una migracion explicita del servidor.
ssh "${ssh_options[@]}" "$remote" "mkdir -p -- '$release' '$web_root' && { test ! -e '$live' || test -L '$live'; }"

cat > dist/.htaccess <<'HTACCESS'
RewriteEngine On
RewriteBase /estanque-de-mudkip/
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ /estanque-de-mudkip/index.html [L]

<IfModule mod_headers.c>
  <FilesMatch "^index\.html$">
    Header always set Cache-Control "no-cache, no-store, must-revalidate"
  </FilesMatch>
  <FilesMatch "\.(?:js|css|woff2?|ttf)$">
    Header always set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.(?:json|gz)$">
    Header always set Cache-Control "public, max-age=300, must-revalidate"
  </FilesMatch>
</IfModule>
HTACCESS
rsync -az --partial -e "ssh -i $HOME/.ssh/id_ed25519 -p $port -o BatchMode=yes -o StrictHostKeyChecking=yes" dist/ "$remote:$release/"

previous="$(ssh "${ssh_options[@]}" "$remote" "readlink '$live' || true")"
ssh "${ssh_options[@]}" "$remote" "ln -sfn '$release' '$next' && mv -Tf '$next' '$live'"

base='https://m3rsync.com/estanque-de-mudkip'
if ! curl --fail --silent --show-error --location --retry 3 --max-time 30 "$base/vgc/dex?release=$RELEASE_SHA" | grep -F '<div id="app"' >/dev/null; then
  echo 'Smoke de ruta SPA fallido; verifica AllowOverride FileInfo para public_html/estanque-de-mudkip en Apache' >&2
  smoke_failed=1
else
  smoke_failed=0
fi
if ! curl --fail --silent --show-error --location --retry 3 --max-time 30 "$base/dex-snapshots/es/catalog.json?release=$RELEASE_SHA" | node -e 'let body="";process.stdin.on("data",chunk=>body+=chunk);process.stdin.on("end",()=>{const data=JSON.parse(body);if(!Array.isArray(data.pokemon)||!data.pokemon.length)process.exitCode=1})'; then
  echo 'Smoke de snapshot fallido' >&2
  smoke_failed=1
fi

if (( smoke_failed )); then
  previous_sha="${previous##*/}"
  if [[ "$previous" == "$release_root/$previous_sha" && "$previous_sha" =~ ^[0-9a-f]{40}$ ]]; then
    rollback="$web_root/.estanque-de-mudkip-rollback-$RELEASE_SHA"
    ssh "${ssh_options[@]}" "$remote" "ln -sfn '$previous' '$rollback' && mv -Tf '$rollback' '$live'"
    echo 'Se restauro la release anterior' >&2
  else
    ssh "${ssh_options[@]}" "$remote" "if [ \"\$(readlink '$live')\" = '$release' ]; then rm -- '$live'; fi"
    echo 'Se retiro el enlace de la primera release fallida' >&2
  fi
  exit 1
fi

echo "Publicado y verificado: $RELEASE_SHA"
