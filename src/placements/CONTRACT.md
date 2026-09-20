# Placements

Converts three planned floors into shared module and catalog prop transforms.

`generate(request)` accepts [request](../../schemas/request.schema.json) and returns
[building](../../schemas/building.schema.json) plus three
[layouts](../../schemas/floor-placement.schema.json). [Types](types.ts) define the
same transport. `writePlacements(result, out)` writes four compact JSON files.

Generation plans ground, first middle and crown once; two floors plan ground and crown
alone, and a stack with no room for a core plans its ground floor alone. All middle floors reference
that middle layout. Their outline, height, doors and explicit programs must match;
the manifest maps the layout's door IDs to each floor's own. Windows vary per floor,
so each floor publishes its own window returns in `building.floors[].treatments`.

The building's [family](finish.ts) (luxury, capsule, damaged, industrial) and each room's
kind pick its modules. [Walls](walls.ts) build one face per room on every run it owns,
its own face on the construction plate boundary included: a nine-slice frame (one fitted
field over the whole run as the backing, four one-cell corners, a rail at the head and the
foot, a stile at each end, a lit joint top and bottom published as a `cove` record) where
the run is at least 1.5 m long and high, a plain fitted field otherwise, a glass field
where an office room looks onto public space, and a door frame in every interior hole. A
boundary run is cut by the openings of every floor that reuses the layout; the shell's own
openings keep their frame and return. [Surfaces](surfaces.ts) lay one slab per room
rectangle, carpets under fitted groups, and ceilings with a fitted band, an inset field
and the family's services. Each room-plan light stands as its module: spot, strip or cove,
and [balanceIllumination](../layout/lighting.ts) sets what each delivers so the room lands
in its kind's lux band.
Furniture with a built-in module scales per axis to its record; other furniture
references existing catalog IDs at one uniform scale, and furnishings fitting neither
produce no prop or furniture anchor.

Transforms apply positive XYZ scale, radians about positive Y, position, then floor
elevation. A stretched placement publishes `uvRepeat`, the factor its module's tile-unit
UVs multiply by, so a fitted piece never stretches its map past the material's own size. No geometry is serialized here. Temporary transformed vertices prove shell,
door and stair clearance. Prop bounds participate in those checks.

Walls, surfaces, window returns and prop bounds stay inside the floor's `roomEnvelope`,
or, without one, inside `facade.wallDepth`, default 0.12 m. The band out to the outline
is open floor over the exterior slab: no partition, no surface, walkable for navigation.
Window return width includes its jambs at adjacent backing planes. Source openings
retain their dimensions. Exterior thresholds join the inset plate to the passage, which for a pocket door is its published clearance behind the cassette back plane.
`building.floors[].program` records reduced services as requested and fitted width
and depth, or null for omission. Repeated floors carry their source layout's changes.

`expandBuilding(result)` returns absolute [floor](../../schemas/floor.schema.json)
and [NPC](../../schemas/npc.schema.json) data with distinct floor identities and
building connectors. Layout source identities remain unchanged on disk.

Errors: `E_BLUEPRINT_INVALID`, `E_ASSIGNMENT_INVALID`, `E_FLOOR_TOO_SMALL`,
`E_UNREACHABLE_SPACE`, `E_SHELL_BREACH`. Inputs remain unchanged. Equivalent inputs
produce byte identical output.

Depends on [Blueprint](../blueprint/CONTRACT.md), [Layout](../layout/CONTRACT.md),
[Geometry](../geometry/CONTRACT.md), [Modules](../modules/CONTRACT.md),
[Assets](../assets/CONTRACT.md) and [NPC](../npc/CONTRACT.md).
