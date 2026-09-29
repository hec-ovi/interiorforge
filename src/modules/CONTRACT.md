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
The reference kinds ([ref-a](../styles/ref-a/index.ts) … [ref-r](../styles/ref-r/index.ts))
add their recipe sets through [reference recipes](../styles/reference/recipes.ts): each
system draws its pieces from a spec and a profile (panel columns and tops per pitch width,
grid ceiling and floor sub-blocks named `<block>-<a>x<b>`, portal corners, jambs and
headers, built-in bays, planters and housings). A module id is registered once across the
kit, and a second registration throws; a kind registers only the casings and portals it
draws. Repeating detail under 0.5 m is baked into bay modules, so a kind's modules stay
within its kit budget however long its walls run.
The [terminal stair guard](recipes/stair-guards.ts) closes the unused half-flight
mouth at crown and roof arrivals. Its width follows the lane; its 1.1 m height and
0.06 m depth remain fixed, with posts mounted beside the landing slab.
The authored construction unit is 0.5 m; a wall or surface piece is one cell that the
placement scales to its run. A frame member is 12 mm short of its cell in the axes the
placement does not stretch, so the shadow gap between two members is the module's own and
no scale can grow it: a corner is short in both axes, a rail in its height, a stile in its
width. Furniture is authored at the size its furniture kind
publishes, XZ centred, front toward +z. Stairs use 0.28 m treads and 0.17 m nominal
risers; placement scales their width and rise while preserving tread depth. Origin is the
vector from bounds minimum to authored zero. Size is XYZ bounds extent.

Beds and wardrobes come in the walnut, capsule steel and worn steel looks of the
furnishing families (`fit-bed`, `fit-bed-capsule`, `fit-bed-worn` and the same for
`fit-wardrobe`), on one frame with their lenses where the furniture light records stand;
the worn looks carry none. `fit-desk` and `fit-office-chair` furnish luxury offices.

Seated support planes are 0.56 m for `fit-chair`, 0.45 m for `fit-sofa` and
`fit-bench`, 0.5 m for `fit-office-chair` and 0.65 m for `fit-stool`, above the authored zero. Consumers scale
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

Lift cabins retain the runtime IDs `lift-car` and `lift-doors`. A 3.5 m shaft
contains a 3.3 m car, about 3.07 m clear inside, with a proportional 1.58 m
clear doorway. Opaque mineral linings replace environment-map mirrors that
looked like exterior views. The broad ceiling diffuser owns one 1600 lm source
at each served landing; the source ID is the car placement ID. Landing records retain their floor elevations; the elevator consumer also
attaches its own cabin lighting to the moving car. The shared
`geometry/lift-spec.ts` keeps runtime controls, display, passenger collision
and diffuser placement aligned with the authored model. Thick separate shaft liners sit 40 mm behind the
car interior surfaces, including front cheeks, so the existing cuboid collision
keeps the camera inside the cabin. Each stationary member remains a separate
solid module so no enclosing bounding box seals the real doorway.
