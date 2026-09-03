# CONTRACT: layout

Purpose: turns a validated request into per-floor interior plans: vertical core, corridors, rooms, doors, furniture and a wall-aware nav grid, all deterministic.

## In

- `planBuilding(request: InteriorRequest, assignments: FloorAssignment[]) -> BuildingPlan` with `request` already validated and assignments resolved (blueprint box). Rooms mostly outside an irregular outline are merged into neighbors or dropped; shafts and corridors only occupy full-coverage spans.

## Out

- `BuildingPlan`
  - `floors: FloorInterior[]` (the floor.schema.json shape) sorted by index; a double-height span's upper floor has `rooms: []`. Each floor publishes every exterior opening's forbidden volume in `openingReservations`, including partition width allowance, facade depth and moving-door depth. Room polygons tile the outline; the shell wall model (`shell.ts`: wall depth from the blueprint's `facade.wallDepth`, else by facade style; lining; bands) says where the room really starts, and the core, furniture, light fixtures and the nav grid keep to that inner plate.
  - `core: CorePlan`: building-wide vertical core in frame (uv) space, identical on every floor. The frame aligns u to the longest ground edge and flips so a street door or `openFront` faces the hall side; rotated parcels work natively, `coreAngleDeg` carries the rotation. Every floor's opening reservations participate in core placement; the selector scans another band or secondary-stair position when one intersects.
  - `navGrids: Map<number, WalkGrid>`: 0.25 m wall-aware walkable grid per floor, world-axis-aligned regardless of frame rotation; diagonal walls are blocked by their true distance.
  - `uvFloors: Map<number, UvFloorData>`: frame-space rooms, furniture and sealed bands for the geometry and NPC passes.
  - `assignments: FloorAssignment[]`: the supplied assignments sorted by floor.
- `coreFeasibility(blueprint) -> CoreFeasibility`: the root contract's pre-check, computed by the same frame, band scan and placement as `planCore`; when it does not fit, `blocker` names the nearest miss (`cross_depth` on the shallowest floor plate, `band`, `compact_depth`, `walkup_floors`, `opening_reservations`) and the `E_FLOOR_TOO_SMALL` message quotes the same numbers.
- `planRoofAccess(request, core) -> RoofAccessPlan | null`: resolves the enclosure against stair A, checks shared axis, cutout fit and 2.1 m door headroom, then publishes the roof threshold, landing, door and exterior entry in the same coordinates.
- Pipeline ([research](../../docs/RESEARCH.md)): core, corridor, strip programs, furniture, then flood-fill validation with deterministic door repair.

## Errors

- `E_FLOOR_TOO_SMALL`: plate cannot fit core plus corridor plus minimum rooms.
- `E_ASSIGNMENT_INVALID`: an assignment references a floor absent from the blueprint.
- `E_UNREACHABLE_SPACE`: a floor failed reachability validation after repair.

## Invariants

- The same request and assignments produce the same plan. Each floor has an independent RNG stream, so consuming values on floor M does not shift floor N's random choices.
- Core rects are identical across floors and placed behind the facade lining and every exterior opening reservation. Stairs are continuous, with 1.2 m clear flights, 0.16 to 0.18 m risers, 0.28 m treads and 1.2 m landings. Every occupied floor is served by every elevator.
- When a fitted roof bulkhead exists, stair A climbs from the last served floor to `roof.elevation`. Its roof-level platform meets the stair's finished inside edge across the full arrival landing and reaches the enclosure door on `doorNormal`; mismatched axes, cutouts or headroom are rejected.
- Every room is reachable from the floor's spine (corridor, elevator lobby or mall concourse) through its connections. Corridor and door widths follow [the research constants](../../docs/RESEARCH.md).
- A ground-floor `openFront` connects its facade room to outside at `portal.clearWidth`, opens the nav grid across the lining and reserves its clear approach without a leaf swing. A moving exterior door consumes `door.motion.clearDepth`; the exported room connection repeats it and furniture and NPC anchors stay out of it.
- Facade endpoints use `facade.grids[].partitionAnchors` as their sole full-thickness permission. Grid fitting runs before facade fitting. A movable partition lands on an anchor; a core-locked or minimum-room boundary stops before the reserved opening volume and joins the facade-side space instead of crossing the opening. Every furniture footprint is tested against the same reservations.
- Rooms, corridors, sealed shafts and core occupy the usable inner plate without an interior gap band.

## Depends on

- [core](../core/CONTRACT.md)
