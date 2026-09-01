# Research conclusions (2026-08)

Compact decisions distilled from three research passes: layout algorithms, architecture standards, tooling. Full sources inline.

## Layout algorithm (the pipeline)

Consensus in shipped games and non-ML literature: template + seeded variance, never free-form generative. Strongest precedent: Shadows of Doubt's scored greedy room placement on a coarse grid (colepowered.com devblog 13); treemap subdivision for zone splits (Marson and Musse 2010); constrained growth for repair (Bidarra 2010, graphics.tudelft.nl). MIP/CP solvers, WFC and neural methods rejected: scale cliffs, weak global constraints, no determinism story.

Pipeline per floor:
1. Coarse grid, 0.5 m cells snapped to the blueprint outline.
2. Vertical core placed once per building (elevator bank + stair shafts + service shaft), identical rect on every floor.
3. Corridor before rooms, by floor-kind template: point-access (small plate: elevator lobby only), double-loaded spine, or loop around core (large office plates). Corridor always touches the core.
4. Zone split of corridor-adjacent strips into addresses (apartments, suites, venue halls) by seeded area-weighted treemap: aspect-capped, no slivers.
5. Rooms inside each address from a program table (priority, min/target area, window need, adjacency whitelist, door count) with leftover-cell absorption.
6. Variance lives in template weights, room-count rolls, area jitter, mirroring; never in structural invariants (core position, corridor topology).
7. Validation pass per floor: flood-fill from the elevator lobby reaches every room, stair and anchor; deterministic repair (add a door), then re-validate; fail with E_UNREACHABLE_SPACE only if repair cannot fix it.
8. Split PRNG per building, floor, address so floor N regenerates standalone (drives the floor editor).

## Architecture constants (hard values in src/layout/constants.ts)

From IBC/ADA references (up.codes, datadrivenaec.com, access-board.gov, steelconstruction.info):
- Stairs: riser 0.17 m, tread 0.28 m (2R+T comfort 0.60-0.65), width 1.15 m, headroom 2.03 m, landing depth >= width. U-return shaft 2.6 x 4.6 m covers 2.4-4.0 m floor heights. Two stairs when floor plate > 460 m2 or building > 4 stories; scissor variant for slim cores.
- Elevators: needed at 4+ stories; ~1 car per 4200 m2 office or per 60-90 residential units, max 8 cars per bank; shaft 2.5 x 2.5 m per car; lobby clearance >= 1.5 m, 2.4 m used. Above ~36 m one service/fire car, 2.44 m min lobby dimension.
- Corridors: 1.5 m residential, 1.8 m office (egress min 1.12 m); dead end max 6 m; double-loaded is the default.
- Doors: leaf 0.9 m; max leaf 1.2 m so wide openings become pairs; double 1.8 m at lobbies, restaurants, assembly > 49 occupants; triple/quad only as storefront entrances (2.7/3.6 m).
- Heights: residential 2.74-3.05 m, office 3.66-4.27 m, retail/lobby 3.66-4.88 m, habitable minimum 2.3 m.
- Rooms: habitable >= 6.5 m2, min dimension 2.13 m; studio >= 17.7 m2 living; bath 1.5 x 2.4 m, powder 0.9 x 1.8 m; kitchen aisle 1.07 m; office 8-12 m2 per workstation; restaurant 1.8 m2 per seat with kitchen 30-40 percent of floor; gym 2.5-3.3 m2 per member, 0.9 m aisles; daylight depth <= 8 m from facade.
- Core: office towers center core, lease span 9-13.5 m core to facade; residential side or split core with double-loaded corridor; core 13-34 percent of plate (avg 23).

## Tooling (verified on npm 2026-08-31)

- GLB read and write: @gltf-transform/core 4.5.0, both directions, authoring from scratch, deterministic binary output (gltf-transform.dev, donmccurdy.com/2023/08/01/generating-gltf). three.js exporters in Node need polyfills; skipped.
- Geometry discipline: glTF mandates CCW front faces, right-handed +Y up (registry.khronos.org/glTF/specs/2.0). One quad-emitter helper with fixed vertex order; never mirror by negative scale; walls are thin boxes so no coplanar faces; single-sided materials so winding bugs are visible; UVs world-planar in meters (u along wall, v up), material tiling maps meters to repeats.
- Pathfinding: own room-graph + grid A* + funnel smoothing (standard, deterministic, ~200 lines; gamedev.net navmesh tutorial). navcat 0.4.1 is the fallback if true navmesh queries are ever needed; recast wasm rejected (bundle, determinism flags).
- RNG: sfc32 streams seeded by splitmix32 over a hashed key path; 32-bit integer ops only, platform-identical (stackoverflow.com/a/47593316). No RNG dependency.
- Preview and tests: three 0.185, vite 8, vitest 4. jsdom has no WebGL: test generator output and view-model logic in Node, stub the renderer in component tests.
