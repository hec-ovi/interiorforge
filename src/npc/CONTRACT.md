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

`facingDeg` is a positive-Y yaw in degrees: zero faces +Z, 90 faces +X;
its forward vector is `[sin(yaw), cos(yaw)]`. It already includes the building's
rotation. A seat anchor's `position` is its reachable navigation approach and can
stand beside a blocked sofa. Render a seated body at the placement named by its
`furniture` ID, facing that yaw, with the animation's root offset and the actual
scaled cushion support height. Expanded furniture IDs carry the floor prefix;
layout placement IDs retain their local names.

Placement layouts keep only their source floor's records. The building manifest owns
complete stair and lift connectors. `expandBuilding` in Placements creates distinct
identities and elevations for all instances. Roof access retains its extra navigation level.

`findPath({nav, from, to})` ([find-path.ts](find-path.ts)) routes over the expanded
`nav` between endpoints `{floor, x, z}`, returning `{legs, connectors}` or a coded error as
the [root contract](../../CONTRACT.md#navigation) describes. [Connector routing](connector-route.ts)
runs Dijkstra over the endpoints and every connector entry, pricing a walk only when its
straight-line bound reaches the front of the queue. [Grid search](grid-path.ts) walks one
floor: A* toward the nearest of its goals, so one search per endpoint serves every entry on
its floor, then line-of-sight smoothing. Dynamic obstacles belong to Engine.

Unreachable spine or conflicting anchors throw `E_UNREACHABLE_SPACE`.
Depends on [Core](../core/CONTRACT.md) and [Layout](../layout/CONTRACT.md).
