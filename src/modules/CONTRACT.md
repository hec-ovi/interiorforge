# Modules

Publishes shared room geometry for placement tables.

`buildModules(options?)` returns `{catalog, files}`. Catalog follows
[modules.schema.json](../../schemas/modules.schema.json); files is a map from
relative filename to GLB bytes. `npm run modules -- --out <dir>` writes both.
`options.theme` is a preloaded Materials theme index; without it Node reads the
sibling Materials box, and an absent theme keeps UVs in metres.

Recipes are grouped in [recipes/](recipes/): [surfaces](recipes/surfaces.ts) (wall
corners, rails, stiles, panel fields, glass and plain fields, floor slabs, carpet, ceiling
bands, fields and services), [lights](recipes/lights.ts) (spots, strip, coves, wall
light lines), [core](recipes/core.ts) (door frame, window return, eight stair flights,
lift car and doors), [furniture](recipes/furniture.ts) (built-in pieces at their
canonical sizes), and [sanitary](recipes/sanitary.ts) (recessed ceramic toilet and
basin bodies, rounded seats, taps and drains). Every slot is a [finish](finishes.ts)
key, `theme/kind/tier#variant`.
The authored construction unit is 0.5 m; a wall or surface piece is one cell that the
placement scales to its run. A frame member is 12 mm short of its cell in the axes the
placement does not stretch, so the shadow gap between two members is the module's own and
no scale can grow it: a corner is short in both axes, a rail in its height, a stile in its
width. Furniture is authored at the size its furniture kind
publishes, XZ centred, front toward +z. Stairs use 0.28 m treads and 0.17 m nominal
risers; placement scales their width and rise while preserving tread depth. Origin is the
vector from bounds minimum to authored zero. Size is XYZ bounds extent.

Seated support planes are 0.56 m for `fit-chair`, 0.45 m for `fit-sofa` and
`fit-bench`, and 0.65 m for `fit-stool`, above the authored zero. Consumers scale
that height by the placement's Y scale and add its base and floor elevation.
The sofa cushion centre is 0.105 m forward of the module's XZ centre before
the placement's Z scale; the other seats are centred at their authored zero.

Sanitary fixtures face +Z with the tank or tap at the -Z rear. Bathroom placement
rotates that front away from the supporting wall. Basins and toilets have actual
open recesses; ceramic and polished mirror slots use
`interior-ceramic/mid#glaze` and `interior-mirror/mid#silver`. Timber, steel and worn
steel vanity casings follow the room's furnishing family.

One UV convention: a tiled slot wears tile units, one UV unit per `tiling.worldSize`
repeat, and an exact slot wears its map once over the face. `tileScale(theme)` gives the
units per metre and `slotAlignment(theme)` says which slots are exact; without a theme
every slot tiles and UVs stay in metres. A placement that stretches a piece publishes the
repeat that keeps the map at its published size. Every
primitive is indexed. GLBs use quantization and meshopt compression, canonical material
keys with the variant in extras, and no texture images. The same source and theme give
identical files and manifest bytes. Triangle and byte counts describe the published files.

Depends on [GLB](../glb/CONTRACT.md), [Materials](../materials/CONTRACT.md), glTF
Transform and meshoptimizer. The compression pipeline follows the
[upstream implementation](https://github.com/donmccurdy/glTF-Transform/blob/main/packages/functions/src/meshopt.ts).
