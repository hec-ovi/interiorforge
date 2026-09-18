# Core

Supplies seeded geometry, grids, shared types and errors.

[Types](types.ts) mirror the [request](../../schemas/request.schema.json),
[blueprint](../../schemas/blueprint.schema.json), [floor](../../schemas/floor.schema.json)
and [NPC](../../schemas/npc.schema.json) schemas. `InteriorResult` names the
[placement result](../placements/types.ts). Coordinates are metres, positive Y up,
with CCW outer XZ polygons and clockwise holes.

`createRng(seed, ...keys)` returns deterministic independent streams.
`RigidFrame2D(angleDeg, origin?)` converts source and world points without changing
length. `roomFootprintContains`, clearance, area and anchor queries exclude holes.
`RoomRegion` callers share the same boundary tolerance through these primitives.

`WalkGrid` stores walkability, exports base64 bits, and builds floods or predecessor
trees. Default traversal uses four neighbors; explicit transition certificates allow
additional swept edges. `segmentSweepClear` proves complete physical segment clearance.
`segmentCoveredByFootprints` proves room ownership along the same segment.
Polygon clipping preserves measured boundaries. Triangulation returns index triples;
callers requiring complete coverage check area.

`InteriorError` carries `code`, optional `floor` and `message`. Placement errors are
listed in the [root contract](../../CONTRACT.md). Material tooling additionally uses
`E_MATERIAL_UNRESOLVED`. Empty RNG selection throws Error.
Depends on the consumed Exterior blueprint vocabulary.
