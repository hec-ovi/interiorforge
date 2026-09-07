# CONTRACT: assets

Purpose: catalogs licensed furniture models and adds a selected model to a glTF document within a caller-owned bounding box.

## In / Out

- `loadAssetCatalog() -> AssetCatalog`: returns [catalog.json](catalog.json), whose entries follow [schemas/catalog.schema.json](schemas/catalog.schema.json). `modelUri` is relative to this folder. `local-only` entries require ignored files prepared from `assets-sources`; `redistributable` entries ship with the box.
- `findAssetCandidates(query: AssetQuery) -> AssetEntry[]`: filters by `family`, optional `styles`, maximum dimensions and availability, then returns catalog order. Dimension filtering uses one uniform scale and rejects a fit below `minimumScale` (0.7 by default). A missing local model is unavailable even when its catalog entry names a URI.
- `fitAssetBounds(asset, maxBounds, rotationYDeg?, minimumScale?) -> AssetFit | null`: fits normalized `[width, depth, height]` dimensions after the small local rotation. It returns null for an extreme shrink or missing model dimensions.
- `assetFamilyForFurniture(kind) -> AssetFamily | null`, `findFurnitureAssets(item, query?) -> AssetEntry[]`: maps supported floor furniture kinds to model families and returns models that fit the item's existing safe envelope. Elevated wall pieces and unsupported kinds retain procedural geometry.
- `readAssetModel(asset, options?) -> Promise<Document>`: reads the selected normalized GLB. `modelsDir` may replace the box model directory for tests or local packaging.
- `instantiateAsset(target, asset, placement, options?) -> Promise<AssetInstance>`: copies the model and its materials into the target document. `placement.maxBounds` and returned dimensions are `[width, depth, height]` in meters. The instance uses one uniform scale, remains centered on `placement.position` in XZ, stands on its Y, and rotates by the caller's world `rotationYDeg` plus a small `variationDeg` inside its oriented bounds. Its returned dimensions never exceed `maxBounds`.
- `npm run assets:import`: reads ignored originals from `assets-sources`, verifies Sketchfab license metadata through the public model endpoint, normalizes useful models, and rebuilds the catalog. It never reads authentication data.

## Errors

- Unknown asset IDs and absent local model files throw an `Error` naming the asset.
- Invalid positions, rotations or nonpositive bounds throw a `RangeError`.

## Invariants

- Normalized models are Y-up, centered at XZ zero and grounded at Y zero.
- Normalization and placement use uniform scale, preserving geometry proportions and source materials.
- Catalog license fields reproduce the provider metadata verified on the recorded date. A title or description that says CC0 does not replace the provider license field.
- A `local-only` model is never committed. A model is `redistributable` only when its source publishes a redistribution-compatible license.
- A model replaces procedural furniture only when it fits the layout's existing dimensions at 70 percent or more of its normalized size.

## Depends on

- @gltf-transform/core 4.x
- @gltf-transform/extensions 4.x
- @gltf-transform/functions 4.x
- [core](../core/CONTRACT.md) furniture contract
- Sketchfab Data API v3 for import-time license verification
