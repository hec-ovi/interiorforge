# Research conclusions

Research informed these implementation choices. `src/layout/constants.ts` and `schemas/core-feasibility.json` are authoritative.

## Layout pipeline

1. Build a 0.5 m layout frame from the longest ground-floor edge. Sweep frames in 5 degree steps when the principal frame cannot hold a core.
2. Place one building-wide core with aligned stairs, elevators and service shaft on every served floor.
3. Place the 2.5 m corridor spine, then fill its adjacent strips from deterministic floor-kind programs.
4. Align partitions to facade piers and the layout grid, then refit doors to the shared wall stretches.
5. Place shaped furniture, room clutter and light fixtures from seeded per-floor streams.
6. Build a 0.25 m walk grid, flood from the spine, repair door reachability deterministically and validate every room and core entry.
7. Derive NPC anchors, roles, routines and connectors from the validated plan.

Per-floor random streams isolate random choices: consuming values on one floor does not shift another floor's stream.

## Implemented dimensions

- Navigation: 0.25 m cells and a 0.3 m agent radius. Layout rectangles snap to 0.5 m.
- Stairs: 1.2 m clear flights and landings, 0.16 to 0.18 m risers, 0.28 m treads and 2.1 m finished headroom. Two stairs are used above 460 m2 or above four above-ground floors.
- Elevators: 2.5 m square shafts, 2.4 m lobby depth, up to eight cars. Demand uses 4200 m2 of office area or 70 residential units per car.
- Corridors: 2.5 m main width and a 1.2 m service stub.
- Doors: 0.9 m standard clear width, 0.7 m on a short shared wall, then 1.8 m, 2.7 m and 3.6 m multi-leaf widths. Clear passage height is 2.1 m.
- Rooms: 4 m2 minimum area, 1.6 m minimum dimension, 3 m minimum strip depth and 8 m maximum daylight depth. Program tables provide room-specific dimensions.
- Ceilings: height above the floor is `min(spaceHeight - 0.15, max(spaceHeight - 0.35, 2.1, glazing head))`.

## Toolchain

- GLB I/O and authoring use glTF Transform 4.5 with CCW faces, right-handed +Y-up coordinates, single-sided materials and world-meter UVs.
- Pathfinding uses the exported walk grid: eight-neighbor A* without diagonal corner cuts, then line-of-sight smoothing. Cross-floor routes add one shared connector ride.
- Random streams use sfc32 seeded through splitmix32 with 32-bit integer operations.
- The preview uses Three.js 0.185 and Vite 8. Vitest 4 and jsdom exercise the UI through an injected `Viewer3D` because jsdom has no WebGL context.
