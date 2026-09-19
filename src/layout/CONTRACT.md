# Layout

Fits a vertical core, rooms, doors, furnishings, lights and navigation into a blueprint.

`planBuilding(request, assignments, selected?)` accepts validated
[requests](../../schemas/request.schema.json) and an optional set of source floor
indices. It returns `BuildingPlan`: [floor records](../../schemas/floor.schema.json),
one core, UV room data, navigation grids and
[circulation](schema/circulation.schema.json). The core considers every floor;
selected floors alone receive room and content plans. Placements selects three.

`coreFeasibility(blueprint, buildingType)` shares the placement recipe with `planCore`,
including its lift demand, so the published stair is the one a building of that type is
furnished around. It returns
[fit results](schema/core-feasibility.schema.json). Success includes the exact stair
shaft center, axis, width and depth. Standard, compact and walkup modes share
[constants](../../schemas/core-feasibility.json). A published roof housing fixes the
primary stair position. Explicit allowed axes constrain the frame search.

Room footprints preserve clockwise holes and connected public space around core
solids. Facade seats constrain partition endpoints. Ground entrances consume exact
opening approaches and moving door depth; each lands on the room whose floor stands behind
it across the open band, through the part of its span that meets that floor. Internal doors fit shared wall intervals, and a repair door tries every shared wall a room owns. The corridor keeps floor in front of every stair and lift door.
Rooms use the 0.5 m construction grid with measured facade closures. Source rotation
is retained; exported navigation stays aligned to world XZ.

The usable plate is the floor's published `roomEnvelope`, or its outline inset by
`facade.wallDepth`, default 0.12 m, when Exterior publishes none. The core, rooms,
partitions and navigation walls stop at that plate; the band out to the outline stays
open and walkable, and an exterior door reaches its room across it. A leftover thinner
than the 0.6 m body clearance is void floor: the rectangle beside it takes that space,
access never counts it as room space, and a room left with no standing space, with no wall
a repair door can open, or with a partition the facade gives no pier to, is dropped from
the floor. The pier check reads only walls the floor builds: an edge on the plate boundary
is open perimeter and needs no seat. Circulation itself never degrades:
an unreachable corridor is still `E_UNREACHABLE_SPACE`. Core feasibility
reserves the 1.6 m minimum room depth. Service programs shrink rooms by 0.5 m to
2 m square, then omit them, in this order: executive office, meeting, storage,
locker room, kitchen, toilets. Each attempt retains room space and corridor contact.
Unit programs without a fitting suite retain their main room and omit its service.
`uvFloors.programChanges` supplies requested and fitted dimensions for the
[building manifest](../../schemas/building.schema.json), with null for omission.
`E_FLOOR_TOO_SMALL` means there is no room space beside the core and circulation.

Architectural access uses continuous body sweeps and room ownership. Private unit
routes use their unit and public rooms. Every room component and core approach must
remain reachable. Repair doors must reduce unreachable cells without losing reached
cells. Complete route sweeps remain reserved during furnishing. NPC navigation uses
its separate 0.25 m grid. Agent radius is 0.3 m.

Stairs retain 1.2 m clear lanes, 0.16 to 0.18 m risers, 0.28 m treads, 1.2 m landings
and 2.1 m headroom. `planRoofAccess` returns a fitted landing and roof connection, or null when the published
housing does not take the stair: the building opens and the roof stays unreachable. Shared [stair parameters](constants.ts) also govern module placement.

Furnishing follows the room's program: a reception stands its desk centred on the wall
facing the entrance with seating bays and planter cases; a dining room or bar runs its
counter with a back shelf and stools, dining tables and planted screens; a bathroom takes
its recipe and a planter; a bedroom, living room and studio take [Luxury](luxury/CONTRACT.md)
groups, each with a carpet zone published in `uv.carpets`. Room lighting plans spots,
strips and a cove per room kind; every built-in furniture lens publishes its own record
with its `furniture` id, at the position the module carries it.
[Lofts](lofts/CONTRACT.md) supports planning tools with multiple storeys; public
placement requests cover single storeys. Emitted meshes belong to Modules and Assets.

Errors: `E_BLUEPRINT_INVALID`, `E_ASSIGNMENT_INVALID`, `E_FLOOR_TOO_SMALL`,
`E_UNREACHABLE_SPACE`. Equal inputs produce equal plans. Depends on
[Core](../core/CONTRACT.md); public transports are linked above and types are in
[index.ts](index.ts), [plan-types.ts](plan-types.ts) and [uv.ts](uv.ts).
