# Assets

Resolves licensed furniture models through stable catalog IDs.

`loadAssetCatalog()` returns [catalog.json](catalog.json), following
[catalog.schema.json](schemas/catalog.schema.json). `modelUri` is relative to this
folder. Local models are prepared from ignored source files.

`findFurnitureAssets(item)` returns matching model entries fitting the existing
[furniture envelope](../../schemas/floor.schema.json). `fitAssetBounds` returns a
uniform scale and dimensions, or null. [Types](types.ts) specify all parameters.
Placement generation selects catalog IDs without reading or copying model geometry.
Entries with no suitable fit produce no placement or furniture anchor.

`readAssetModel` in [io.ts](io.ts) and `readBundledAssetModel` in [bundled.ts](bundled.ts)
serve Node and browser consumers. `AssetInstancer.instantiate` copies shared models once
and applies caller transforms. `prepareFurnitureAssets` and `appendFurnitureAssets` remain
asset authoring helpers. `npm run assets:import` normalizes licensed originals and rebuilds
the catalog.

Models are centered in XZ, grounded at Y zero, and preserve source materials.
Availability is `redistributable`, `local-only` or `source-only`. Unknown IDs or absent
files throw Error. Invalid transforms throw RangeError.
Depends on [Core](../core/CONTRACT.md), glTF Transform and provider metadata during import.
