## Move description overrides

Este modulo complementa el catalogo base cuando `PokeAPI` no trae descripciones en espanol
para movimientos existentes o recientes, o cuando el texto visible del Builder/Dex queda en ingles.

Reglas:

- Edita la fuente en `description-overrides.source.json`.
- No edites snapshots en `public/dex-snapshots/*` manualmente.
- Usa este overlay para movimientos competitivos o casos donde el texto de `PokeAPI` no este localizado.
- Prefiere `shortEffectEs` breve y claro, porque es el copy que mas se ve en selects y paneles.

Campos soportados por entrada:

- `id`
- `nameEs` opcional
- `nameEn` opcional
- `shortEffectEs` opcional
- `shortEffectEn` opcional
- `effectEs` opcional
- `effectEn` opcional
