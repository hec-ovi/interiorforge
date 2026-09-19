# NPC

Produces anchors, staffing, routines, standing opportunities and navigable floor grids.

`buildNpcSupport(plan, request)` takes a [Layout plan](../layout/CONTRACT.md) and
[request](../../schemas/request.schema.json), returning [NPC data](../../schemas/npc.schema.json).
Anchors belong to reachable room space and actual published furniture. Core anchors
identify stair and lift approaches. Roles follow the floor program: a lobby staffs its
receptionist, guard and, in a hotel, its porter; a restaurant its host, waiters, cook and
bartender; a coffee shop its barista; a shop its vendor; an office its workers, executive
and guard; homes and hotel rooms their residents and guests; every venue seats guests.
Routine steps reference generated role and anchor IDs.
Standing opportunities preserve existing approaches when their body volumes are occupied.

Placement layouts keep only their source floor's records. The building manifest owns
complete stair and lift connectors. `expandBuilding` in Placements creates distinct
identities and elevations for all instances. Roof access retains its extra navigation level.

`findPath(npc, from, to)` consumes expanded JSON and endpoints
`{floor, position: [x,z]}`. It returns walk legs `{kind, floor, points}` and connector
legs `{kind: "ride", connector, fromFloor, toFloor}`, or null for a route miss.
Floor paths use grid A* and connectors permit transfers. Dynamic obstacles belong to Engine.

Unreachable spine or conflicting anchors throw `E_UNREACHABLE_SPACE`.
Depends on [Core](../core/CONTRACT.md) and [Layout](../layout/CONTRACT.md).
