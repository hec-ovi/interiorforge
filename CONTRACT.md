# CONTRACT: interior

Purpose: deterministically fills one building shell with interiors per floor and exports NPC routine placeholders and walk paths for that instance.

Status: implemented (0.2). Simulation builds against `schemas/npc.schema.json`. Validated against real exterior output (rotated city parcels).

## In

One `InteriorRequest`: [schemas/request.schema.json](schemas/request.schema.json)

- `seed` uint32 or any string (hashed internally; the exterior seed works directly), `building` (id, atlas parcel type verbatim, atlas tier poor|mid|rich|high_rich), `shellGlb` path, `materialTheme`
- `blueprint`: consumer view of the canonical exterior blueprint (v0.3: basements as negative indexes, heights to 12 m, per-floor kind slug, extra exterior sections accepted and ignored): [schemas/blueprint.schema.json](schemas/blueprint.schema.json)
- `assignments` (optional): one floor kind per floor (lobby, office, corpo_office, restaurant, coffee_shop, gym, residence_studio, apartment, hotel_rooms, mechanical, parking, terrace); `spans: 2` for double-height floors. When omitted, derived deterministically from the blueprint floor kind slugs and building type.

Units meters, building-local space, +Y up, XZ floor plane, CCW polygons.

## Out

One `InteriorResult` written to an output directory:

- `building.glb`: the shell completed with interiors (slabs with core holes, walls, doors, stairs, elevator shafts, furniture placeholders). Materials are named by the canonical key `theme/kind/tier` (lowercase slugs, e.g. `cyberpunk/concrete/poor`); the materials box resolves them.
- `floors/NNN.json`, one per floor: [schemas/floor.schema.json](schemas/floor.schema.json): vertical core (elevators, stairs with tread geometry, shafts), rooms with polygons and doors (1 to 4 leaves), furniture placements. Irregular parcels rotate the layout frame: `coreAngleDeg` gives the frame rotation, core rects and stair steps are frame-axis-aligned and rotate about their centers; room polygons, door positions and furniture are plain world space.
- `npc.json`: [schemas/npc.schema.json](schemas/npc.schema.json): anchors (usable positions), supported roles with counts, routine loops (anchor, dwell minutes range, animation), nav data: per-floor walkable grid plus stair/elevator connectors.

Library surface (TypeScript):

- `generateInterior(request, { shellDoc? }) -> Promise<InteriorResult>`: deterministic; same request, identical output. `shellDoc` (a parsed GLB document) skips reading `shellGlb` from disk.
- `findPath(npc, from {floor, position}, to {floor, position}) -> PathLeg[] | null`: obstacle-avoiding route between any two walkable points; each leg is a same-floor point list or a connector ride. Reference implementation over `npc.json`; simulation may reimplement from the schema alone.
- `makeFixture(options)`: seeded stand-in exterior (shell GLB document plus blueprint) so this box runs with no other layer present.
- CLI: `npm run generate -- --seed N --floors N [--basements N --type T --tier T --out DIR]` writes `building.glb`, `floors/*.json`, `npc.json`. Preview: `npm run preview` (panoptic 3D view plus standalone floor editor with walk-path testing; loads real engine output: shell .glb + blueprint .json + exterior request .json).
- Shell slab replacement: the shell's `floor:<index>/slab` nodes are removed and re-emitted as room slabs with real stair and elevator holes.

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
