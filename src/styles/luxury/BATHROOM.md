# Luxury bathroom fittings

`bathroom.ts` authors reusable metre-scale modules. The long suspended vanity,
open folded-towel shelf and restrained metal details refer to the Konpeki Plaza
suite. Dimensions are explicit design decisions, not measurements inferred from
the reference.

| Kind | Module | Width × depth | Placement height |
| --- | --- | --- | --- |
| Basin | `fit-basin-luxury` | 1.40 × 0.58 m | 0.88 m counter |
| Toilet | `fit-toilet-luxury` | 0.40 × 0.72 m reservation | 0.80 m |
| Shower | `fit-shower-luxury` | 1.30 × 1.10 m | 2.20 m |

The basin cabinet hangs at 0.32 m. Its opaque framed mirror reaches 1.92 m, as
separate headboards/mirrors may extend above their functional placement height.
The stone counter has a real cutout; ceramic slopes to a drain 17 cm below the
rim. Drawer fronts and cabinet partitions avoid the bowl cavity. Towels, soap,
handles and tap are actual geometry. Ceramic uses smooth vertex normals; the
shared vessel builder publishes continuous metric UVs through `addSurface`.

The toilet retains the validated open ceramic bowl, separate open seat and raised curved lid, rear
cistern and two flush buttons. Its rear pipe stays inside the reservation. The
shower has transparent 10 mm side glass, minimal metal channels and clamps, a
0.82 m open front entry, a shallow tray, linear drain, rainfall nozzles, mixer,
hand shower and hose. Accessories stay inside the fixture footprint.

`bathroom-recipe.ts` reserves at least 0.85 m in front of the vanity, 0.75 m in
front of the toilet (0.85 m clear width), and 0.80 m in front of the shower for
these generous fittings. Every complete recipe keeps other fixtures out of
operation space. Room programming and furniture placement supply walls, doors,
room-specific reservations and omit bathroom plants.

`luxury-bathroom.test.ts` raycasts the open bowls and shower entry, checks
finite unit normals and metric bounds, and fits the complete recipe into the
3.5 × 3.5 m main and 3.0 × 3.5 m secondary gross rooms. Shared sanitary tests
also verify orientation on four walls and compressed GLB bowl geometry.

The shower glass and the vanity mirror use the Corpo Plaza optics
(`corpo-plaza-glass/rich#clear`, `corpo-plaza-mirror/rich#silver`): clear glass with
full transmission and near-zero roughness, and an opaque polished metallic mirror on
solid backing. The mirror uses the unchanged engine environment reflection, not a new
live planar reflection.

Folded towels use `cyberpunk/meridian-terry/rich#ivory`, a neutral 512 px
terry PBR tile at a 0.20 m repeat, with metric UVs on the folded geometry.

The walk-in shower publishes nine actual component modules: tray, left/right/front
panes, rear riser, overhead head, mixer, hand shower and shelf. `props.ts` keeps the
original furniture ID on the tray and gives the other components stable child IDs.
All remain collidable through their normal measured bounds. The combined
`fit-shower-luxury` exists for preview only and is never placed as one closed box.
`luxury-shower-walking.test.ts` uses the unchanged engine `floorBoxes`, Rapier and
`PlayerBody` to enter, stand, collide with the side glass and exit at four rotations;
it also reproduces the blocking behavior of the old combined bounding box.
