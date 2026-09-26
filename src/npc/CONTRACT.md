# NPC

Produces anchors, staffing, routines, standing opportunities and navigable floor grids.

`buildNpcSupport(plan, request)` takes a [Layout plan](../layout/CONTRACT.md) and
[request](../../schemas/request.schema.json), returning [NPC data](../../schemas/npc.schema.json).
Anchors belong to reachable room space and actual published furniture: furniture that
leaves the layout for want of a present model takes its anchors, the roles they would staff
go with them, and role IDs number the roles that remain. Core anchors
identify stair and lift approaches. Roles follow the floor program: a lobby staffs its
receptionist, guard and, in a hotel, its porter; a restaurant its host, waiters, cook and
bartender; a coffee shop its barista; a shop its vendor; an office its workers, executive
and guard; homes and hotel rooms their residents and guests; every venue seats guests.
Routine steps reference generated role and anchor IDs. One body takes each place: a
post holds the spot it works from and the reachable spot that approach snaps to, a seat or
bed the piece its body rests on. Posts claim theirs before seats, so no two such anchors in
one room put bodies within the 0.6 m body clearance and a post's own chair publishes no
guest seat. Pieces of different rooms never contend, a wall parting their bodies. A place
already held is served from there, so a counter whose staff aisle a kitchen run holds
publishes no second spot on its customers' side.
Standing opportunities preserve existing approaches when their body volumes are occupied.

`facingDeg` is a positive-Y yaw in degrees: zero faces +Z, 90 faces +X;
its forward vector is `[sin(yaw), cos(yaw)]`. It already includes the building's
rotation. A seat anchor's `position` is its reachable navigation approach and can
stand beside a blocked sofa. Render a seated body at the placement named by its
`furniture` ID, facing that yaw (not the placement's `rotationY`, which also turns a
catalog model by its own `frontYawDeg`), with the animation's root offset and the actual
scaled cushion support height. Expanded furniture IDs carry the floor prefix;
layout placement IDs retain their local names.

Placement layouts keep only their source floor's records. The building manifest owns
complete stair and lift connectors. `expandBuilding` in Placements creates distinct
identities and elevations for all instances. Roof access retains its extra navigation level.

`findPath({nav, from, to})` ([find-path.ts](find-path.ts)) routes over the expanded
`nav` between endpoints `{floor, x, z}`, returning `{legs, connectors}` or a coded error as
the [root contract](../../CONTRACT.md#navigation) describes. It checks each nav object once
and caches its decoded grids or the reason it cannot be read. [Connector routing](connector-route.ts)
runs Dijkstra over the endpoints and every connector entry, walks and rides alternating,
and prices a walk only when its straight-line bound reaches the front of the queue. [Grid search](grid-path.ts) walks one
floor: A* toward the nearest of its goals, so one search per endpoint serves every entry on
its floor, then line-of-sight smoothing. Dynamic obstacles belong to Engine.

Unreachable spine or conflicting anchors throw `E_UNREACHABLE_SPACE`.
Depends on [Core](../core/CONTRACT.md) and [Layout](../layout/CONTRACT.md).
