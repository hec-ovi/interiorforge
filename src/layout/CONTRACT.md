# CONTRACT: layout

Purpose: turns a validated request into per-floor interior plans: vertical core, corridors, rooms, doors, furniture and a wall-aware nav grid, all deterministic.

## In

- `planBuilding(request: InteriorRequest, assignments: FloorAssignment[]) -> BuildingPlan` with `request` already validated and assignments resolved (blueprint box). Rooms mostly outside an irregular outline are merged into neighbors or dropped; shafts and corridors only occupy full-coverage spans.

## Out

- `BuildingPlan`
  - `floors: FloorInterior[]` (the floor.schema.json shape) sorted by index; a double-height span's upper floor has `rooms: []`.
  - `core: CorePlan`: building-wide vertical core in frame (uv) space, identical on every floor. The frame aligns u to the longest ground edge and flips so the street entrance faces the hall side; rotated parcels work natively, `coreAngleDeg` carries the rotation.
  - `navGrids: Map<floorIndex, WalkGrid>`: 0.25 m wall-aware walkable grid per floor, world-axis-aligned regardless of frame rotation (diagonal walls blocked by true distance).
  - `uvFloors: Map<floorIndex, UvFloorData>`: frame-space rooms, furniture and sealed bands for the geometry and npc passes.
- Pipeline (docs/RESEARCH.md): core first, corridor second (spine, point-access by plate and kind), strip split into units third, rooms from per-kind program tables fourth, furniture fifth, flood-fill validation with deterministic door repair last.

## Errors

- `E_FLOOR_TOO_SMALL`: plate cannot fit core plus corridor plus minimum rooms.
- `E_UNREACHABLE_SPACE`: a floor failed reachability validation after repair.

## Invariants

- Same request, identical plan. Per-floor RNG streams: floor N never changes when floor M is edited.
- Core rects identical across floors; stairs continuous; every floor served by every elevator.
- Every room reachable from the elevator lobby through doors; corridor and door widths per docs/RESEARCH.md constants.
- Rooms plus corridors plus core tile the outline: no interior gap band.

## Depends on

- ../core/CONTRACT.md
