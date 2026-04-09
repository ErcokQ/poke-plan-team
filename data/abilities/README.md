## Ability description overrides

Este modulo complementa el catalogo base cuando `PokeAPI` no trae descripciones en espanol
para habilidades existentes o nuevas.

Reglas:

- Edita la fuente en `description-overrides.source.json`.
- No edites snapshots en `public/dex-snapshots/*` manualmente.
- Usa este overlay solo para completar nombre o descripcion cuando falten o sean incorrectos.
- Prefiere textos cortos y funcionales para `shortEffect`.

Campos soportados por entrada:

- `id`
- `nameEs` opcional
- `nameEn` opcional
- `shortEffectEs` opcional
- `shortEffectEn` opcional
- `effectEs` opcional
- `effectEn` opcional
