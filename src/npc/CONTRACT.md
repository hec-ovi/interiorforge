# CONTRACT: npc

Purpose: derives everything the simulation layer needs from a building plan: anchors, supported roles, routine loops, the exported nav data, and a reference pathfinder.

## In / Out

- `buildNpcSupport(plan: BuildingPlan, request: InteriorRequest) -> NpcSupport` (the `schemas/npc.schema.json` shape)
  - anchors: entrances, per-floor elevator waits and stair entries, and furniture-driven spots (work behind desks and counters, beds, toilets, seats, machines, patrol points, idle and cleaning spots). Every anchor has a walkable approach cell within 0.9 m or is dropped.
  - roles: staffing by building type and floor kind (receptionist, security, vendor or barista, cook, waiter, office workers, executives, residents, guests, trainer, cleaner) with `[min, max]` counts.
  - routines: one deterministic loop per role over its anchors, with dwell ranges and animations. The simulation walks between steps via nav.
  - nav: per-floor walkable bitmask (from the layout grids) plus connectors: every stair and elevator serves every planned floor (digital controls default); spans-2 upper floors are excluded.
- `findPath(npc: NpcSupport, from: {floor, position}, to: {floor, position}) -> PathLeg[] | null`
  - Reference pathfinder over the exported JSON alone: A* on the floor bitmask with line-of-sight smoothing; cross-floor routes ride one connector (nearest by combined walk distance, elevators preferred beyond one floor of travel).
  - `PathLeg`: `{ kind: "walk", floor, points: Point[] }` or `{ kind: "ride", connector, fromFloor, toFloor }`.
  - Returns null only when no route exists (never for two walkable in-plan points; that is a generator bug caught by tests).

## Errors

None of its own: inputs are already validated. `findPath` returns null instead of throwing.

## Depends on

- ../core/CONTRACT.md
- ../layout/CONTRACT.md (BuildingPlan)
- ../../schemas/npc.schema.json
