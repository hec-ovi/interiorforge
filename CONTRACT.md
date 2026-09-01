# CONTRACT: interior

Purpose: deterministically fills one building shell with interiors per floor and exports NPC routine placeholders and walk paths for that instance.

Status: schemas fixed. Simulation can build against `schemas/npc.schema.json` now.

## In

One `InteriorRequest`: [schemas/request.schema.json](schemas/request.schema.json)

- `seed` uint32, `building` (id, type, tier), `shellGlb` path, `materialTheme`
- `blueprint`: the exterior shell blueprint: [schemas/blueprint.schema.json](schemas/blueprint.schema.json)
- `assignments`: one floor kind per floor (lobby, office, corpo_office, restaurant, coffee_shop, gym, residence_studio, apartment, hotel_rooms, mechanical, terrace); `spans: 2` for double-height floors

Units meters, building-local space, +Y up, XZ floor plane, CCW polygons.

## Out

One `InteriorResult` written to an output directory:

- `building.glb`: the shell completed with interiors (slabs with core holes, walls, doors, stairs, elevator shafts, furniture placeholders). Materials are named by the canonical key `theme/kind/tier` (lowercase slugs, e.g. `cyberpunk/concrete/poor`); the materials box resolves them.
- `floors/NNN.json`, one per floor: [schemas/floor.schema.json](schemas/floor.schema.json): vertical core (elevators, stairs with tread geometry, shafts), rooms with polygons and doors (1 to 4 leaves), furniture placements.
- `npc.json`: [schemas/npc.schema.json](schemas/npc.schema.json): anchors (usable positions), supported roles with counts, routine loops (anchor, dwell minutes range, animation), nav data: per-floor walkable grid plus stair/elevator connectors.

Library surface (TypeScript):

- `generateInterior(request) -> InteriorResult`: pure, deterministic; same request, identical output.
- `findPath(npc, from {floor, position}, to {floor, position}) -> {legs}`: obstacle-avoiding route between any two walkable points; each leg is a same-floor point list or a connector ride. Reference implementation of pathing over `npc.json`; simulation may reimplement from the schema alone.

## Errors

Closed set, thrown as `InteriorError { code, floor?, detail }`:

- `E_BLUEPRINT_INVALID`: malformed blueprint (bad polygon, non-contiguous floors, overlapping openings)
- `E_SHELL_MISMATCH`: shell GLB inconsistent with the blueprint (bounds or floor count)
- `E_ASSIGNMENT_INVALID`: assignment list does not cover the floors, unknown kind, or impossible span
- `E_FLOOR_TOO_SMALL`: a floor plate cannot fit the vertical core plus its minimum room program
- `E_UNREACHABLE_SPACE`: generated layout failed internal validation (unreachable room, stuck spot, disconnected stair); never shipped silently

## Invariants

- Deterministic: same request, byte-identical JSON and identical GLB content. No LLM calls, no wall-clock, no ambient randomness.
- Every floor is real and reachable: stairs are continuous walkable geometry from ground to top, every elevator serves every floor it spans, shafts vertically aligned across floors.
- Every room is reachable from the building entrance through doors; corridors and door widths follow interior architecture minimums (see docs/RESEARCH.md).
- Geometry is watertight for play: no gaps at floor edges, no inverted normals, no coplanar z-fighting faces, no spot where an NPC or player gets stuck.
- Routines only target anchors that stand on walkable cells; every anchor is reachable from every connector on its floor.

## Depends on

- ../exterior/CONTRACT.md (blueprint + shell GLB; fixture-driven until exterior ships)
- ../materials/CONTRACT.md (material key resolution: theme/kind/tier)
