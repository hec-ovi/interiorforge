# Modules

Publishes shared room geometry for placement tables.

`buildModules(options?)` returns `{catalog, files}`. Catalog follows
[modules.schema.json](../../schemas/modules.schema.json); files is a map from
relative filename to GLB bytes. `npm run modules -- --out <dir>` writes both.
`options.theme` is a preloaded Materials theme index; without it Node reads the
sibling Materials box, and an absent theme keeps UVs in metres.

Recipes are grouped in [recipes/](recipes/): [surfaces](recipes/surfaces.ts) (wall
corners, edges, panel fields, glass and plain fields, floor slabs, carpet, ceiling
bands, fields and services), [lights](recipes/lights.ts) (spots, strip, coves, wall
light lines), [core](recipes/core.ts) (door frame, window return, eight stair flights,
lift car and doors) and [furniture](recipes/furniture.ts) (built-in pieces at their
canonical sizes). Every slot is a [finish](finishes.ts) key, `theme/kind/tier#variant`.
The authored construction unit is 0.5 m; a wall or surface piece is one cell that the
placement scales to its run. Furniture is authored at the size its furniture kind
publishes, XZ centred, front toward +z. Stairs use 0.28 m treads and 0.17 m nominal
risers; placement scales their width and rise while preserving tread depth. Origin is the
vector from bounds minimum to authored zero. Size is XYZ bounds extent.

UVs are tile units: `tileScale(theme)` gives one UV unit per `tiling.worldSize` repeat,
so world faces tile at metre scale and unit faces wear the whole map once. Every
primitive is indexed. GLBs use quantization and meshopt compression, canonical material
keys with the variant in extras, and no texture images. The same source and theme give
identical files and manifest bytes. Triangle and byte counts describe the published files.

Depends on [GLB](../glb/CONTRACT.md), [Materials](../materials/CONTRACT.md), glTF
Transform and meshoptimizer. The compression pipeline follows the
[upstream implementation](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/functions/src/meshopt.ts).
