# CONTRACT: interior

Purpose: deterministically fills one building shell with interiors per floor and exports NPC routine placeholders and walk paths for that instance.

Status: implemented (0.17). Simulation builds against `schemas/npc.schema.json`. Validated against real exterior output (rotated city parcels).

## In

One `InteriorRequest`: [schemas/request.schema.json](schemas/request.schema.json)

- `seed` uint32 or any string (hashed internally; the exterior seed works directly), `building` (id, atlas parcel type verbatim, atlas tier poor|mid|rich|high_rich), `shellGlb` path, `materialTheme`
- `blueprint`: consumer view of the canonical exterior blueprint (v0.3: basements as negative indexes, heights to 12 m, per-floor kind slug, extra exterior sections accepted and ignored): [schemas/blueprint.schema.json](schemas/blueprint.schema.json)
- `assignments` (optional): one floor kind per floor (lobby, office, corpo_office, restaurant, coffee_shop, retail, mall_floor, gym, residence_studio, apartment, hotel_rooms, mechanical, parking, terrace); `spans: 2` for double-height floors. When omitted, derived deterministically from the blueprint floor kind slugs and building type.

Floor kind slugs are read as atlas vocabulary verbatim, so a mixed building gets the right program per floor: `commerce` -> retail (one shop occupying the floor), `mall` -> mall_floor (shop units off a concourse), `restaurant`, `coffee_shop`, `offices`, `corpo`, `hotel`, `residential`, `factory` and the institutional types map to their own programs; `lobby` and `entry` to the lobby, `basement` to parking, `bar` to the restaurant program and `executive` to the corpo office one. Unknown slugs fall back to the building type.

Units meters, building-local space, +Y up, XZ floor plane, CCW polygons.

## Out

One `InteriorResult` written to an output directory:

- `building.glb`: a finished furnished textured interior. The shell completed with interiors (slabs with core holes, walls, doors, stairs, elevator shafts, shaped furniture), every material named by the canonical key `theme/kind/tier` (lowercase slugs, e.g. `cyberpunk/concrete/poor`) and resolved through ../materials into real maps: basecolor, normal, occlusion, emission where the entry has one, plus its metallic and roughness factors, transmission and IOR for glass. Tiled maps carry a `KHR_texture_transform` scale of 1 / tiling worldSize over world-meter UVs, so nothing stretches; exact-placement materials (elevator doors) get 0..1 UVs over their face instead.
- Material variant preference: a material may carry `extras.materialVariant` naming the variant of its entry the interior wants (`cyberpunk/plaster/mid` with `hex`, say). The NAME is always the plain key, so a consumer that resolves keys itself is unaffected and simply gets the entry's canonical variant. Walls and ceilings take the pattern class this way (hex fields in venues and lobbies, panel grids in offices and service rooms, two-tone in homes; ceiling panels overhead, lit strip and panel diffusers on fixtures), while floors, wood, tile and concrete keep their photographed sets.
- Texture modes (`textures.mode` on the result says which one the GLB carries): `external` (default) writes map URIs against a configurable base path, `embed` packs the maps into one self-contained GLB, `keys` leaves the material keys for a consumer that resolves them itself (the engine runtime). With no materials database at the configured path, output falls back to `keys` and says so, so the box still runs standalone.
- `floors/NNN.json`, one per floor: [schemas/floor.schema.json](schemas/floor.schema.json): vertical core (elevators, stairs with tread geometry, shafts), rooms with polygons and doors (1 to 4 leaves), furniture placements, light fixtures. Irregular parcels rotate the layout frame: `coreAngleDeg` gives the frame rotation, core rects and stair steps are frame-axis-aligned and rotate about their centers; room polygons, door positions, furniture and lights are plain world space.
- Walls are detailed, never bare planes: a trim baseboard at the floor, a dado band in the accent tone up to 1.05 m, the patterned field above it and a trim band under the ceiling, each standing slightly proud of the one below; one wall per room, chosen by seed and never a facade or a wall with a door in it, is faced in the accent tone for colour blocking. Venue rooms add the cove light line at the wall-ceiling junction, and wall decor (menu displays, framed pieces, shelves) hangs by venue kind. The facade lining carries the same bands between its openings.
- Furniture is real shaped geometry, not blocks: tables on legs, chairs with backs and armrests, bar stools pulled up to counters, counters with panelled fronts and kick recesses, shelving with stock on the boards, crates in back rooms, and seeded small objects (bottles and glasses on a bar, a cup and papers on a desk). Wall pieces (`wall_shelf`, `display_screen`, `wall_art`) carry an `elevation`, the base height above the floor; everything else stands at 0. Seats are placed against the piece they serve and NPC `seat` anchors sit ON them, so a seated NPC lands on the chair.
- Lighting (`lights` on every floor JSON): one entry per light source, `kind` `strip` (linear ceiling fixture), `spot` (downlight) or `cove` (emissive line at the wall-ceiling junction), with `position` `[x, y, z]`, `length` and `angleDeg` for the run, `intensity` in lumens, `colorTemperatureK`, a useful `range` in meters, `beamDeg` (full spread), `diffuse` (how much leaves as a soft wash) and `facing` (`down` for a ceiling fixture, `up` for a cove, which sits under the ceiling and washes it). A strip or cove is a LINE of light `length` long that washes wide and soft over the surfaces around it, not a point glow. Every room, corridor and stair shaft carries fixtures, by kind: work light over offices and kitchens, warm spots in homes, strips plus cove lines in venues, downlights and a cove line along corridors, a downlight per storey inside stairwells. Strips in a row nearly abut, so an aisle reads as one continuous line of light. Ceilings are real surfaces: every enclosed room carries the `ceiling` pattern overhead, and rooms left open (parking, plant, terrace) see the concrete soffit of the slab above. The GLB carries the matching emissive housing at each pose (material key `theme/light-fixture/tier`), so a consumer that ignores the list still sees lit fixtures, just no cast light.
- `npc.json`: [schemas/npc.schema.json](schemas/npc.schema.json): anchors (usable positions), supported roles with counts, routine loops (anchor, dwell minutes range, animation), nav data: per-floor walkable grid plus stair/elevator connectors.

Library surface (TypeScript):

- `generateInterior(request, { shellDoc?, textures? }) -> Promise<InteriorResult>`: deterministic; same request, same materials database, same options, identical output. `shellDoc` (a parsed GLB document) skips reading `shellGlb` from disk. `textures`: `{ mode?: "external" | "embed" | "keys", dir?, baseUrl?, theme? }`, where `dir` is the materials box root (defaults to `URBE_MATERIALS_DIR`, else the sibling `materials` box), `baseUrl` is the URI prefix written into the GLB, and `theme` is a preloaded theme index for callers with no disk (the browser preview).
- `findPath(npc, from {floor, position}, to {floor, position}) -> PathLeg[] | null`: obstacle-avoiding route between any two walkable points; each leg is a same-floor point list or a connector ride. Reference implementation over `npc.json`; simulation may reimplement from the schema alone.
- `makeFixture(options)`: seeded stand-in exterior (shell GLB document plus blueprint) so this box runs with no other layer present.
- `coreFeasibility(blueprint) -> { fits, mode, bandLength, minCoreLength, minCompactCoreLength, minWalkupCoreLength, walkupMaxFloors, maxElevators, crossDepthOk, frameAngleDeg }`: assembler pre-check computed with the exact planCore frame, vFace scan and constants. `mode` is `standard` (elevator core; the corridor position scans to wherever the plate holds it), `compact` (stairs become columns into the rear strip so near-miss bands keep elevators), `walkup` (stair-only, floors capped at `walkupMaxFloors`) or `none`. A plate whose fitting core rectangle is skewed off its longest edge gets a rotated frame: when the principal frame holds no core, frames every 5 degrees over a half turn are tried and the best fitting one wins; `frameAngleDeg` says which frame the answer used, and it is the `coreAngleDeg` the floors carry. Constants and the arithmetic recipe: [schemas/core-feasibility.json](schemas/core-feasibility.json). Gate and generator share one placement function, one block layout and one "is this rect inside the outline" test, so `fits: true` means `generateInterior` builds it. Elevator demand clamps to the band, so more floors never turn a standard- or compact-fitting parcel unfit; error messages quote the same numbers the recipe computes.
- CLI: `npm run generate -- --seed N --floors N [--basements N --type T --tier T --theme T --out DIR] [--embed | --keys-only] [--materials DIR --materials-base URI]` writes `building.glb`, `floors/*.json`, `npc.json`; external map URIs are written relative to the output directory by default. Preview: `npm run preview` (panoptic 3D view plus standalone floor editor with walk-path testing; shows a finished textured building at first load, and loads real engine output: shell .glb + blueprint .json + exterior request .json). The floor editor instantiates that floor's own light fixtures and drops the daylight, and `eye view` stands the camera in a room at head height, so what the preview shows is the lit room the player walks into.
- Shell slab replacement: the shell's `floor:<index>/slab` nodes are removed and re-emitted as room slabs with real stair and elevator holes.

## Errors

Closed set, thrown as `InteriorError { code, floor?, detail }`:

- `E_BLUEPRINT_INVALID`: malformed blueprint (bad polygon, non-contiguous floors, overlapping openings)
- `E_SHELL_MISMATCH`: shell GLB inconsistent with the blueprint (bounds or floor count)
- `E_ASSIGNMENT_INVALID`: assignment list does not cover the floors, unknown kind, or impossible span
- `E_FLOOR_TOO_SMALL`: a floor plate cannot fit the vertical core plus its minimum room program
- `E_UNREACHABLE_SPACE`: generated layout failed internal validation (unreachable room, stuck spot, disconnected stair); never shipped silently
- `E_MATERIAL_UNRESOLVED`: the materials theme has no entry for a key the building uses, or embedded textures were asked for without the database on disk

## Invariants

- Deterministic: same request, same materials database and same texture options give byte-identical JSON and GLB. No LLM calls, no wall-clock, no ambient randomness.
- Every floor is real and reachable: stairs are continuous walkable geometry from ground to top, every elevator serves every floor it spans, shafts vertically aligned across floors.
- Stairs fit the player (capsule 0.7 m wide): every flight is at least 1.0 m clear, and every tread and landing of the whole run keeps 2.1 m of headroom under whatever passes overhead. Landings reach the flights they serve and the arrival landing at each floor is real geometry, so the walk line never has a gap or a drop. Constants and the shaft arithmetic: [schemas/core-feasibility.json](schemas/core-feasibility.json). A run that cannot meet both is `E_UNREACHABLE_SPACE`, never shipped.
- Every room is reachable from the building entrance through doors; corridors and door widths follow interior architecture minimums (see docs/RESEARCH.md).
- Nothing stands in a doorway. Every door, street entrance included, keeps a clear zone: the leaf swing plus 1 m of approach on both sides (1.5 m inside a street entrance), over the full head height (2.1 m; a ceiling fixture entirely above it does not count). Furniture is placed around the zones and anything the reachability repair strands inside one is dropped. NPC anchors obey the same zones: a standing role is walked out to the nearest clear reachable spot, and an entrance anchor stands 1.7 m inside the opening. Both are machine-checked, furniture with the nav validation and anchors as the NPC support is built.
- Partitions land on the piers between the facade's openings: an interior wall line whose end falls inside a window or door slides sideways to the nearest clear position, up to 2 m and never past a room's minimum span. Two walls keep their place instead: one locked to a shaft face (moving it would cut the shaft or open a gap) and one reaching two facades whose window rhythms leave no common pier; those take the position with the fewest crossings.
- Geometry is watertight for play: no gaps at floor edges, no inverted normals, no coplanar z-fighting faces, no spot where an NPC or player gets stuck.
- Routines only target anchors that stand on walkable cells; every anchor is reachable from every connector on its floor.

## Depends on

- ../exterior/CONTRACT.md (blueprint + shell GLB; fixture-driven until exterior ships)
- ../materials/CONTRACT.md (material key resolution: theme/kind/tier)
