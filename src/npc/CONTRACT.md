# CONTRACT: npc

Purpose: derives everything the simulation layer needs from a building plan: anchors, supported roles, routine loops, the exported nav data, and a reference pathfinder.

## In / Out

- `buildNpcSupport(plan: BuildingPlan, request: InteriorRequest) -> NpcSupport` (the `schemas/npc.schema.json` shape)
  - anchors: entrances (doors and permanently open fronts), per-floor elevator waits and stair entries, and furniture-driven spots (work behind desks and counters, beds, toilets, seats, machines, patrol points, idle and cleaning spots). A blocked candidate searches up to ten 0.25 m grid rings and takes the nearest clear reached cell in the first usable ring; no match drops the anchor. `anchorConflicts` checks the exported centimetre position against every connection keep-clear zone and produces `E_UNREACHABLE_SPACE` on a conflict.
  - roles: staffing by building type and floor kind (receptionist, security, vendor or barista, cook, waiter, clerk per sales floor, office workers, executives, residents, guests, trainer, cleaner) with `[min, max]` counts.
  - routines: one deterministic loop per role over its anchors, with dwell ranges and animations. The simulation walks between steps via nav.
  - nav: per-floor walkable bitmask from the layout grids plus connectors. A multi-floor building publishes every stair and elevator as a connector serving each occupied floor. A fitted roof adds one synthetic nav floor above the highest blueprint floor, blocks the parapet, enclosure and roof artifacts, and extends stair A to its exterior door entry. `roofAccess` publishes the threshold, landing, door and entry. A single-floor building without roof access publishes no connectors. Double-height upper floors are excluded.
- `findPath(npc: NpcSupport, from: {floor, position}, to: {floor, position}) -> PathLeg[] | null`
  - Reference pathfinder over the exported JSON alone: A* on the floor bitmask with line-of-sight smoothing. Cross-floor routes ride one connector selected by combined endpoint distance; elevators are preferred beyond one floor of travel.
  - `PathLeg`: `{ kind: "walk", floor, points: Point[] }` or `{ kind: "ride", connector, fromFloor, toFloor }`.
  - Returns `null` when no connector or complete walk route exists.

## Errors

- `E_UNREACHABLE_SPACE`: an exported anchor remains inside a door keep-clear zone.
- `findPath` returns `null` when no route exists and does not throw for route misses.

## Depends on

- [core](../core/CONTRACT.md)
- [layout](../layout/CONTRACT.md) (`BuildingPlan`)
- [NPC schema](../../schemas/npc.schema.json)
