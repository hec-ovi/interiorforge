# CONTRACT: layout

Purpose: turns a validated request into per-floor interior plans: vertical core, corridors, rooms, doors, furniture and a wall-aware nav grid, all deterministic.

## In

- `planBuilding(request: InteriorRequest, assignments: FloorAssignment[]) -> BuildingPlan` with `request` already validated and assignments resolved (blueprint box). Rooms mostly outside an irregular outline are merged into neighbors or dropped; shafts and corridors only occupy full-coverage spans.

## Out

- `BuildingPlan`
  - `floors: FloorInterior[]` (the floor.schema.json shape) sorted by index; a double-height span's upper floor has `rooms: []`. Each floor publishes every exterior opening's forbidden volume in `openingReservations`, including partition width allowance, facade depth and moving-door depth. Room polygons tile the outline; the shell wall model (`shell.ts`: wall depth from the blueprint's `facade.wallDepth`, else by facade style; lining; bands) says where the room really starts, and the core, furniture, light fixtures and the nav grid keep to that inner plate.
  - `core: CorePlan`: building-wide vertical core in frame (uv) space, identical on every floor. The frame aligns u to the longest ground edge and flips so a street door or `openFront` faces the hall side; rotated parcels work natively, `coreAngleDeg` carries the rotation. Every floor's opening reservations participate in core placement; the selector scans another band or secondary-stair position when one intersects.
  - `navGrids: Map<number, WalkGrid>`: 0.25 m wall-aware walkable grid per floor, world-axis-aligned regardless of frame rotation; diagonal walls are blocked by their true distance.
  - `circulation: Map<number, FloorCirculation>`: occupied floors' pre-furnishing route reservations, following [schema/circulation.schema.json](schema/circulation.schema.json). World-XZ routes share a spine start and name every room hub, both sides of room doors, exterior approaches and stair/elevator approaches. Every approach publishes its intended point and at most 0.5 m displacement. Room-door approaches remain inside their room; core approaches stay near the intended entry or wait point. Clipped room hubs may move within their room. `bodyWidth` is twice the 0.3 m agent radius; `minimumDoorWidth` reports the smallest published doorway separately.
  - `uvFloors: Map<number, UvFloorData>`: frame-space rooms, furniture and sealed bands for the geometry and NPC passes.
  - `assignments: FloorAssignment[]`: the supplied assignments sorted by floor.
- `coreFeasibility(blueprint) -> CoreFeasibility`: the root contract's pre-check, computed by the same frame, band scan and placement as `planCore`; when it does not fit, `blocker` names the nearest miss (`cross_depth` on the shallowest floor plate, `band`, `compact_depth`, `walkup_floors`, `opening_reservations`) and the `E_FLOOR_TOO_SMALL` message quotes the same numbers.
- `planRoofAccess(request, core) -> RoofAccessPlan | null`: resolves the enclosure against stair A, checks shared axis, cutout fit and 2.1 m door headroom, then publishes the roof threshold, landing, door and exterior entry in the same coordinates.
- Pipeline: core, corridor, strip programs, architecture validation and fitted door repair, circulation reservations, furniture, then checks of the reserved endpoints. Furniture does not cause additional doors.

## Errors

- `E_FLOOR_TOO_SMALL`: plate cannot fit core plus corridor plus minimum rooms.
- `E_ASSIGNMENT_INVALID`: an assignment references a floor absent from the blueprint.
- `E_UNREACHABLE_SPACE`: a floor failed reachability validation after repair.

## Invariants

- The same request and assignments produce the same plan. Each floor has an independent RNG stream, so consuming values on floor M does not shift floor N's random choices.
- Ceiling spotlights use a complete centered grid of at most ten fixtures per room. When the requested grid exceeds that budget, row and column counts minimize the widest axis spacing, then deviation from the room style's spacing. Fixtures outside the usable floor inset are omitted; stair arrival lights retain their independent placement.
- Core rects are identical across floors and placed behind the facade lining and every exterior opening reservation. Stairs are continuous, with 1.2 m clear flights, 0.16 to 0.18 m risers, 0.28 m treads and 1.2 m landings. Every occupied floor is served by every elevator.
- When a fitted roof bulkhead exists, stair A climbs from the last served floor to `roof.elevation`. Its roof-level platform meets the stair's finished inside edge across the full arrival landing and reaches the enclosure door on `doorNormal`; mismatched axes, cutouts or headroom are rejected.
- Every room is reachable from the floor's spine (corridor, elevator lobby or mall concourse) through its connections. Corridor and door widths follow [the research constants](../../docs/RESEARCH.md).
- Circulation uses a separate 0.0625 m architecture grid with body-radius wall erosion and narrowed door throats. This is sampled architecture clearance, not a continuous collision or accessibility certificate. Grounded furniture, including chairs, cannot intersect conservative rectangles covering the complete saved route sweeps. The same endpoint cells must remain connected after furnishing. Elevated objects, furniture-use and quest anchors, roof destinations and NPC seat approach semantics are outside this guarantee; the existing NPC-use grid remains separate.
- A ground-floor `openFront` connects its facade room to outside at `portal.clearWidth`, opens the nav grid across the lining and reserves its clear approach without a leaf swing. A moving exterior door consumes `door.motion.clearDepth`; the exported room connection repeats it and furniture and NPC anchors stay out of it.
- Facade endpoints use `facade.grids[].partitionAnchors` as their sole full-thickness permission. Grid fitting runs before facade fitting. A movable partition lands on an anchor; a core-locked or minimum-room boundary stops before the reserved opening volume and joins the facade-side space instead of crossing the opening. Every furniture footprint is tested against the same reservations.
- Rooms, corridors, sealed shafts and core occupy the usable inner plate without an interior gap band. A doorway-width full-depth plate after inline stair B is a corridor landing to the facade slab edge and joins a reachable adjacent room around the stair; a narrower remainder is sealed.

## Depends on

- [core](../core/CONTRACT.md)
