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

Plates at least 22 m across both principal axes first reserve 4.5 m wide public
stairs, preferring end-facing flights with a direct 4.24 m clear portal. The two
2.2 m structural lanes keep at least 1.9 m between rail faces, with 2 m landings
and 0.30 m treads. The run fits the building's actual climb (8 m for 4.5 m
storeys). A constrained plate falls back to the minimum stair profile. Gate,
roof housing, landings, guards, wall openings and navigation share the fitted
profile; the canonical flight geometry uses scaleZ for the deeper tread, keeping
the Engine's collision aligned. Both profiles first try placements
that leave 1.4 m from stair A to the roof edge for its enclosure and approach;
stepped roofs can move the core to another fitting corridor position. Only when
no profile supports that reserve does the core retain the inaccessible-roof fallback.

Room footprints preserve clockwise holes and connected public space around core
solids. The service stub closing the core row is as deep as the lifts, or as the riser in
a walk-up, and no service room stands on it, so the floor beyond it keeps its way back to
the corridor. Facade seats constrain partition endpoints. Ground entrances consume exact
opening approaches and moving door depth; each lands on the room whose floor stands behind
it across the open band, through the part of its span that meets that floor. No core
solid stands in front of a street door or open front: its clear passage, carried
`DOOR.approach` (2.5 m) past the opening's clear volume, stays floor. A balcony door keeps
only its clear volume. A loose core that
crosses other reservations keeps this one, and a plate whose every core stands there is
`E_FLOOR_TOO_SMALL`. A paired family's service rooms fit around it the same way. Internal doors fit shared wall intervals, and a repair door tries every shared wall a room owns. The corridor keeps floor in front of every stair and lift door.
Rooms use the 0.5 m construction grid with measured facade closures. Source rotation
is retained; exported navigation stays aligned to world XZ.

Facade residential plans prefer 75 m² gross units for poor/mid tiers and 150 m² for
rich/high-rich tiers, excluding shared circulation and cores. These are allocation
targets, not measured clear-room areas or a compliance claim. Actual legal facade
seats and plate depth determine each footprint. Bedrooms face daylight; kitchens,
bathrooms and storage cluster at the service edge, with direct access from living.
Large rectangular luxury floors with compact cores use
[perimeter-residential.ts](perimeter-residential.ts): the complete perimeter is
allocated to homes, with rear homes wrapping the real shafts. Legal facade cuts
and a 150 m² preference select 135–300 m² bays; whole programs must fit before a
bay is accepted. Wider plates gain 3 m access branches beside the shafts so more
rear homes can open onto shared floor. Living/entry floor must remain body-clear
and connected without crossing bedrooms or bathrooms. A shaft service pocket
belongs to the shared core utility room, not a second apartment entrance. Failed
eligible allocations report rejected bay dimensions and incomplete frontage
coverage rather than quietly publishing a giant shared leftover lounge.
Frontage no generous home can take is packed again with standard bays, so a tapered or
broken strip keeps smaller homes instead of turning into one long lounge, and a bay starts
behind any core solid it runs past, so a lift deeper than the stair beside it moves the
bay's inboard wall rather than costing the bay.
Other paired plans prefer 10 m unit depth only when at least 3 m remains for public access.
Narrow, shallow or unseated units retain an open studio instead of introducing an
unwalkable partitioned plan. Poor/mid legacy apartment strips reserve 3 m kitchen widths and
service depth: the 2.4 m kitchen run needs at least 2.6 m of wall after fitting, and
the former snapped 2.5 m room could not furnish it. Their 8–10 m frontages also leave
space for a 2.5 m bathroom and a usable entrance.
Rich/high-rich legacy apartments use 11–14 m frontages and a 3.5 m service band
with 3.5 m bathrooms; legacy luxury studios and hotel rooms use 8–10 m frontages.
All luxury bathrooms must fit the complete fixture recipe rather than silently
dropping a fixture when their door or circulation reservations are too restrictive.

Luxury enclosed plans reserve 3.5×3.5 m and 3×3.5 m gross bathrooms for a full
vanity, shower and toilet, without floor planters. Primary bedrooms prefer 5.5×5 m
and guest rooms at least 4.5×4.5 m, subject to real facade partition seats; the
cross-room approach remains at least 1.5 m. Open luxury dwelling fallbacks keep a
3.5 m bathroom allocation. These are gross planning envelopes, not finished clear
dimensions after wall linings.

The usable plate is the floor's published `roomEnvelope`, or its outline inset by
`facade.wallDepth`, default 0.12 m, when Exterior publishes none. The core, rooms,
partitions and navigation walls stop at that plate; the band out to the outline stays
open and walkable, and an exterior door reaches its room across it. A leftover thinner
than the 0.6 m body clearance is void floor: the rectangle beside it takes that space,
Placements floor it, access never counts it as room space, and a room left with no standing space, with no wall
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

Doorways facing unstandable room slivers close before access repair; replacement
openings retain a bounded body-clear approach on both owned sides.
Architectural access uses continuous body sweeps and room ownership. Private unit
routes use their unit and public rooms. Every room component and core approach must
remain reachable. Repair doors must reduce unreachable cells without losing reached
cells. Complete route sweeps remain reserved during furnishing. Bedroom room-access targets
stand beyond their entrance within the room, leaving the central bed zone available;
every doorway approach and its body clearance remain reserved. NPC navigation uses
its separate 0.25 m grid. Agent radius is 0.3 m.

Public furnishing additionally stays 1.7 m from the saved public route centreline,
leaving a 2 m furniture passage where that centreline is 0.3 m from an existing
wall. These wider reservations apply only to public rooms; private bedroom arrival
and bed space retain their own body-clear routes. They do not widen architectural
door openings. Ordinary reception waiting groups fit two pockets flanking the
actual street entrance, within its first 8 m of interior depth, leaving a 4 m
arrival axis; rear and service-side arms are not filled with area-driven repeats.

Large luxury residential plates with a compatible front entrance use
[ground-program.ts](ground-program.ts): two glazed residents' lounges face a
central reception and a 3 m cross approach. Detached staff/service wings keep
2.5 m side routes; support rooms behind the shafts preserve a 3 m return route.
The common rear remainder is circulation, not another giant reception. Ground
support rooms have no dwelling unit identifiers. One-entrance lounges and meeting
rooms reserve arrival beyond their door rather than occupying their seating/table
centre with a circulation endpoint. Shallow and incompatible side-entry plates
retain the ordinary service layout.

Generous compact-core luxury homes reserve a 4×2 m entrance foyer and a
5.1×4.8 m salon beside a real bedroom partition before fitting wet/storage rooms.
Private doors keep their approach outside that salon; optional studies cannot
consume it. Main entries are 1.6 m paired pockets, room openings at least 1.2 m.
The nominal shared spine is 3.5 m, leaving more than 3 m between finished faces.
Living-room furniture stays at least 1.2 m from saved private route centrelines;
those wider bands do not consume bedroom or bathroom fixture space. Primary and
secondary bathrooms retain complete fixtures in 3.5×3.5 m allocations. The proposed
area targets and these clearances are generator requirements, not measured claims
about the reference. A full-frontage allocation first caps homes at
300 m²; only a failed packing retries with one half-grid depth of area allowance,
so fractional rotated core placement cannot reject an otherwise complete end bay.

Wall-mounted furniture uses the construction envelope and the same glazed-room
ownership as the wall producer. Virtual facade-envelope boundaries and shared
glass are not solid mounting surfaces; art, shelves and displays stay on actual
opaque interior partitions. A private luxury kitchen supplies a full-size
breakfast table and two chairs before optional pantry furniture when its home has
no living-room dining. That group preserves the cooker/fridge operation rectangles
and verified body paths to the door, fridge and both worktop stations; failed
candidates leave the existing fixtures and reservations unchanged. Generous-home
kitchens reserve arrival at the doorway rather than their geometric centre;
every such kitchen reserves complete appliance operations and proven 0.68 m
body paths before optional storage, while every doorway approach and physical
circulation sweep remains protected.

Stairs retain 1.2 m clear lanes, 0.16 to 0.18 m risers, 0.28 m treads, 1.2 m landings
and 2.1 m headroom. `planRoofAccess` returns a fitted landing and roof connection, or null when the published
housing does not take the stair: the building opens and the roof stays unreachable. Shared [stair parameters](constants.ts) also govern module placement.

Furnishing follows the room's program: a reception stands its desk at the arrival, beside
the entrance axis and clear of the route to the core, with seating bays and planted
displays on opaque walls, or planters where the arrival is glazed; a dining room or bar runs its
counter with a back shelf and stools, dining tables and planted screens; a bathroom takes
its complete fixture recipe; a toilets room stands its toilets in a row along one wall, each
holding a 0.7 m stall so two users stand side by side beyond the body clearance, then its
basin; a bedroom, living room and studio take [Luxury](luxury/CONTRACT.md)
groups, each with a carpet zone published in `uv.carpets`. Room lighting plans spots,
strips and a cove per room kind; every built-in furniture lens publishes its own record
with its `furniture` id, at the position the module carries it.
[Lofts](lofts/CONTRACT.md) supports planning tools with multiple storeys; public
placement requests cover single storeys. Emitted meshes belong to Modules and Assets.

The quarter-metre living connectivity test retains both 0.39 m body and 0.85 m
route-clearance masks. A scanline/boundary-band raster computes those exact masks
once; bounded caches hold 4096 geometry results and 256 complete dwelling fits.
Repeated-storey fits clone their geometry and remap public-room identities before
publication. Grid rounding uses the same tiny tie tolerance in Interior and
Exterior core fitting; inverse rotation cannot shift an exact half-grid tie by
half a metre. Rebuild Interior's feasibility distribution before Exterior consumes
changed core/grid code.

Errors: `E_BLUEPRINT_INVALID`, `E_ASSIGNMENT_INVALID`, `E_FLOOR_TOO_SMALL`,
`E_UNREACHABLE_SPACE`. Equal inputs produce equal plans. Depends on
[Core](../core/CONTRACT.md); public transports are linked above and types are in
[index.ts](index.ts), [plan-types.ts](plan-types.ts) and [uv.ts](uv.ts).
