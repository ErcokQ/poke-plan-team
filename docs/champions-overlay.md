# Overlay de Pokemon Champions

## Objetivo
`Pokemon Champions` no tiene hoy una fuente publica, estable y machine-readable equivalente a `PokeAPI` para disponibilidad de especies, formas o estados de transferencia. Para cubrir esa necesidad, el proyecto mantiene un overlay editorial propio.

Este overlay:

- no reemplaza `PokeAPI`
- no vive en una API separada
- no se edita dentro de `public/`
- actua como fuente de verdad curada por el proyecto para datos exclusivos de `Champions`
- no expone en runtime las referencias de investigacion usadas para construir la lista canonica

## Decision de arquitectura
La fuente editable queda en:

- `data/champions/availability.source.json`

El artefacto de runtime se genera en:

- `public/dex-snapshots/champions/availability.json`

La regla es simple:

- `data/champions/*` contiene informacion fuente mantenida por el equipo
- `public/dex-snapshots/champions/*` contiene artefactos listos para runtime

Esto evita editar manualmente snapshots publicados y mantiene el mismo patron que ya usamos en Dex.

## Por que no una API propia
Por ahora no hace falta una API propia porque:

- la frecuencia de cambio esperada es baja o moderada
- la disponibilidad se puede versionar en git
- el deploy ya es `local-first` y basado en snapshots
- rollback y auditoria son mas simples con archivos versionados

Una API propia solo tendria sentido si mas adelante:

- se necesita panel de edicion
- hay varias apps consumiendo el mismo dataset
- se requiere publicar cambios sin redeploy
- se necesita trazabilidad avanzada o aprobaciones

## Contrato propuesto
El archivo `data/champions/availability.source.json` debe seguir este modelo:

```json
{
  "version": 1,
  "game": {
    "id": "pokemon-champions",
    "name": "Pokemon Champions"
  },
  "metadata": {
    "maintainers": [],
    "lastReviewedAt": "2026-04-08",
    "notes": ""
  },
  "entries": [
    {
      "pokemonId": "dragonite",
      "formId": null,
      "availability": "available",
      "introducedIn": "launch",
      "sourceType": "internal",
      "sourceLabel": "",
      "sourceUrl": "",
      "notes": "Confirmado para la lista canonica del proyecto."
    }
  ]
}
```

## Campos
- `pokemonId`: id canonico que ya usa el catalogo local, por ejemplo `dragonite`
- `formId`: id de forma cuando la disponibilidad aplique a una forma concreta, por ejemplo `dragonite-mega`; usar `null` cuando aplique a la especie base
- `availability`: uno de:
  - `available`
  - `limited`
  - `unconfirmed`
  - `unavailable`
- `introducedIn`: ventana de disponibilidad, por ejemplo `launch`, `wave-1`, `season-2`
- `sourceType`: `official`, `community`, `internal`
- `sourceLabel`: nombre corto de referencia; puede quedar vacio si la lista se publica como investigacion interna del proyecto
- `sourceUrl`: URL verificable; puede quedar vacia si la referencia no se expone en el overlay operativo
- `notes`: aclaraciones editoriales o tecnicas

## Politica de fuentes
Orden recomendado de confianza para investigacion interna:

1. Fuente oficial de `Pokemon Champions`
2. Comunicados oficiales de The Pokemon Company
3. Overlay interno del proyecto basado en confirmacion manual
4. Fuentes comunitarias como apoyo para construir la lista canonica del proyecto

Politica operativa del proyecto:

- el overlay publicado puede tratar la disponibilidad como lista canonica propia
- no es obligatorio exponer en el JSON la referencia usada durante la investigacion
- si una entrada todavia no esta suficientemente validada por el equipo, debe quedar como `unconfirmed`, no como `available`

## Flujo de mantenimiento
1. Revisar fuente oficial o evidencia confiable.
2. Editar `data/champions/availability.source.json`.
3. Documentar la razon del cambio en `notes` si hace falta.
4. Ejecutar `npm run dex:sync` para regenerar `public/dex-snapshots/champions/availability.json`.

## Integracion actual
La integracion actual sigue este flujo:

1. `scripts/dex-sync.mjs` transforma `data/champions/availability.source.json`
2. el artefacto se publica en `public/dex-snapshots/champions/availability.json`
3. `dexSnapshotService` lo carga como snapshot separado del Dex base
4. `dexStore` aplica el overlay al campo `gameAvailability`
5. la Dex lo expone como filtro adicional `Pokemon Champions`

## Regla operativa
No mezclar disponibilidad de `Champions` dentro de los snapshots base generados desde `PokeAPI` hasta que el contrato este estable. Debe vivir como overlay separado para no contaminar el pipeline general del Dex.
