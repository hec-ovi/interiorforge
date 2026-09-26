# Assets

Resolves licensed furniture models through stable catalog IDs.

`loadAssetCatalog()` returns [catalog.json](catalog.json), following
[catalog.schema.json](schemas/catalog.schema.json). `modelUri` is relative to this
folder. Local models are prepared from ignored source files.

`chooseFurnitureAsset(item, models)` in [families.ts](families.ts) returns the model a
floor-standing furniture record wears: the first entry fitting its
[furniture envelope](../../schemas/floor.schema.json) at a scale of at least 0.7 whose ID
is in `models.present`, redistributable before local-only, then by ID. Absent models
ranked ahead of it join `models.missing`; with none present it returns null.
`fitAssetBounds` returns that uniform scale and the scaled dimensions, or null.
Placement generation selects catalog IDs without reading or copying model geometry.

`presentModels(modelsDir?)` in [availability.ts](availability.ts) lists the IDs whose model
file a runtime can read: under Node the files in `modelsDir`, default [models](models);
in a browser the bundled models and the files the preview's `/interior-assets/` route lists.
`readBundledAssetModel` in [bundled.ts](bundled.ts) reads one model in a browser and throws
Error when it is unavailable. `npm run assets:import` normalizes licensed originals and
rebuilds the catalog; a source this machine lacks keeps its published entry, and the
import lists those sources as a warning.

Models are centered in XZ, grounded at Y zero, and preserve source materials.
Availability is `redistributable`, `local-only` or `source-only`.
Depends on [Core](../core/CONTRACT.md), glTF Transform and provider metadata during import.
