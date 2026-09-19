# Placements

Converts three planned floors into shared module and catalog prop transforms.

`generate(request)` accepts [request](../../schemas/request.schema.json) and returns
[building](../../schemas/building.schema.json) plus three
[layouts](../../schemas/floor-placement.schema.json). [Types](types.ts) define the
same transport. `writePlacements(result, out)` writes four compact JSON files.

Generation plans ground, first middle and crown once. All middle floors reference
that middle layout. Their outline, height, doors and explicit programs must match;
the manifest maps the layout's door IDs to each floor's own. Windows vary per floor,
so each floor publishes its own window returns in `building.floors[].treatments`. Rectangular surface
runs retain holes. Wall runs retain doors and facade clearances. Furniture references
existing catalog IDs and keeps one uniform scale. Unsupported furnishings produce
no prop or furniture anchor. Decoration frames and LED housings are module placements.

Transforms apply positive XYZ scale, radians about positive Y, position, then floor
elevation. No geometry is serialized here. Temporary transformed vertices prove shell,
door and stair clearance. Prop bounds participate in those checks.

Walls, surfaces, window returns and prop bounds stay inside the floor's `roomEnvelope`,
or, without one, inside `facade.wallDepth`, default 0.12 m. The band out to the outline
is open floor over the exterior slab: no partition, no surface, walkable for navigation.
Window return width includes its jambs at adjacent backing planes. Source openings
retain their dimensions. Exterior thresholds join the inset plate to the passage.
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
