# CONTRACT: layout

Purpose: turns a validated request into per-floor interior plans: vertical core, corridors, rooms, doors, furniture and a wall-aware nav grid, all deterministic.

## In

- `planBuilding(request: InteriorRequest, assignments: FloorAssignment[]) -> BuildingPlan` with `request` already validated and assignments resolved (blueprint box). Rooms mostly outside an irregular outline are merged into neighbors or dropped; shafts and corridors only occupy full-coverage spans.

## Out

- `BuildingPlan`
  - `floors: FloorInterior[]` (the floor.schema.json shape) sorted by index; a double-height span's upper floor has `rooms: []`. Room polygons tile the outline; the shell wall model (`shell.ts`: wall depth from the blueprint's `facade.wallDepth`, else by facade style; lining; bands) says where the room really starts, and the core, furniture, light fixtures and the nav grid keep to that inner plate.
  - `core: CorePlan`: building-wide vertical core in frame (uv) space, identical on every floor. The frame aligns u to the longest ground edge and flips so a street door or `openFront` faces the hall side; rotated parcels work natively, `coreAngleDeg` carries the rotation.
- `coreFeasibility(blueprint) -> CoreFeasibility`: the root contract's pre-check, computed by the same frame, band scan and placement as `planCore`; when it does not fit, `blocker` names the nearest miss (`cross_depth` on the shallowest floor plate, `band`, `compact_depth`, `walkup_floors`) and the `E_FLOOR_TOO_SMALL` message quotes the same numbers.
  - `navGrids: Map<floorIndex, WalkGrid>`: 0.25 m wall-aware walkable grid per floor, world-axis-aligned regardless of frame rotation (diagonal walls blocked by true distance).
  - `uvFloors: Map<floorIndex, UvFloorData>`: frame-space rooms, furniture and sealed bands for the geometry and npc passes.
- Pipeline (docs/RESEARCH.md): core first, corridor second (spine, point-access by plate and kind), strip split into units third, rooms from per-kind program tables fourth, furniture fifth, flood-fill validation with deterministic door repair last.

## Errors

- `E_FLOOR_TOO_SMALL`: plate cannot fit core plus corridor plus minimum rooms.
- `E_UNREACHABLE_SPACE`: a floor failed reachability validation after repair.

## Invariants

- Same request, identical plan. Per-floor RNG streams: floor N never changes when floor M is edited.
- Core rects identical across floors, placed on the plate behind the facade lining; stairs continuous, with 1.2 m clear flights, 0.16 to 0.18 m risers, 0.28 m treads and 1.2 m landings; every floor served by every elevator.
- Every room reachable from the floor's spine (corridor, elevator lobby or mall concourse) through its connections; corridor and door widths per docs/RESEARCH.md constants.
- A ground-floor `openFront` connects its facade room to outside at `portal.clearWidth`, opens the nav grid across the lining and reserves its clear approach without a leaf swing.
- Rooms plus corridors plus core tile the outline: no interior gap band.

## Depends on

- ../core/CONTRACT.md
