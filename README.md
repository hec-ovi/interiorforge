# interiorforge

Deterministic interior generator for buildings. Give it a GLB shell and its per-floor blueprint; get back a finished furnished textured GLB (rooms, walkable stairs, elevators, doors, furniture), one JSON per floor, and an NPC support file with anchors, roles, routines and nav grids.

Same seed and inputs, byte-identical output. No LLM calls, no wall clock, no ambient randomness.

Every floor is real: stairs are continuous walkable geometry from the ground through a fitted roof enclosure, elevators serve every floor they span, and every room is reachable from the entrance. Exterior opening reservations keep partitions, the vertical core and furniture out of windows, portals and moving-door space. Permanently open shop fronts use the exterior's exact portal dimensions and stay open through the lining. The geometry is watertight for play, with no gap at a floor edge and no spot where a character gets stuck, and it stays inside the shell: nothing reaches the exterior wall plane, checked on every vertex before the GLB is written.

## Run

```
npm install
npm test                                    # contract tests
npm run typecheck                           # TypeScript surface
npm run generate -- --seed 1 --floors 12 --out out
npm run generate -- --embed --out out       # one self-contained GLB, maps included
npm run generate -- --keys-only --out out   # material keys, resolved by the consumer
npm run generate -- --floor-glbs-only --out out # lower-memory per-floor GLBs, no combined building
npm run preview                             # 3D building view plus a standalone floor editor
```

Without a shell to work from, a fixture shell is fabricated, so the box runs with nothing else installed. The preview shows a finished textured building at first load and can open real generator output (shell GLB, blueprint JSON, request JSON), with walk-path testing in the floor editor.

## In

One [`InteriorRequest`](schemas/request.schema.json):

- **seed**, **building** (id, type, wealth tier), **shellGlb** path, **materialTheme**
- **blueprint**: the shell's per-floor description (outlines, elevations, heights, doors, windows, open shop fronts, basements as negative indexes) and its facade: a measured `wallDepth`, or a style that picks how deep the shell wall reaches inside the outline
- **assignments** (optional): one floor kind per floor from lobby, office, corpo office, restaurant, coffee shop, retail, mall floor, gym, studio, apartment, hotel rooms, mechanical, parking, terrace, with `spans: 2` for double-height floors. Omitted, they are derived from the blueprint's own floor labels and the building type, so a mixed-use tower gets a shop floor, a restaurant floor and apartments each with their own program.

Units are meters, building-local, +Y up.

## Out

- **`building.glb`**: the shell completed and furnished. Interior material keys resolve through [pbrforge](https://github.com/hec-ovi/pbrforge) into basecolor, normal, occlusion and optional emission maps, plus metallic, roughness, transmission and IOR properties. Shell materials that already carry a base-color texture remain intact. Upholstery pins the flat fabric weave so chair and sofa scale does not turn a photographed pattern into moire. Tiled maps carry a `KHR_texture_transform` over world-meter UVs so nothing stretches. Three texture modes: `external` writes map URIs against a configurable base path, `--embed` packs everything into one self-contained GLB, `--keys-only` leaves the material keys for a runtime that resolves them itself. With no material database on disk the output falls back to keys, so the tool still runs standalone.
- **`floors/NNN.json`**: the vertical core (elevators, stairs with real tread geometry, shafts), rooms as polygons with door or open-front connections, and furniture placements. Doors carry one to four leaves; an open front carries clear dimensions and no leaves. Irregular footprints rotate the layout frame and publish the angle, so a triangular or decagonal plate lays out along its own axes.
- **`floors/NNN.glb`** (with `--floor-glbs` or `--floor-glbs-only`): each floor band's interior as its own GLB next to its JSON, same materials and node scheme as the whole building, so a runtime can stream the floors near the player. `--floor-glbs-only` seals completed floor buffers, writes one floor document at a time, and omits the combined building allocation.
- **`npc.json`**: usable anchor positions, supported roles with min and max counts, routine loops (anchor, dwell range, animation), and nav data: a per-floor walkable grid plus stair and elevator connectors.

Library surface: `generateInterior(request: unknown, options?: GenerateOptions)` returns the combined building and can add floor GLBs. `generateFloorInteriors(request: unknown, options?: FloorGenerateOptions)` returns floor GLBs, floor data, NPC data and a texture report. `findPath(npc: NpcSupport, from: PathQuery, to: PathQuery)` returns same-floor walk legs and one connector ride, or `null`. `makeFixture(options?: FixtureOptions)` creates a stand-in shell. `coreFeasibility(blueprint: InteriorRequest["blueprint"])` reports the fitting core mode or blocker. The gate and generator share one placement function, so `fits: true` means the building generates.

## How it works

Layout runs in a principal-axis frame taken from the longest street-facing edge, so rotated plates keep square rooms. The core places first, then the corridor band scans for a position the plate actually holds; shallow plates use a single-loaded layout so units keep real room depth. Rooms come from per-kind templates with seeded variance, furniture prefers doorless walls, and a wall-aware nav grid is flood-validated for reachability before anything is written. Dimensions are recorded in [docs/RESEARCH.md](docs/RESEARCH.md).

## Using it from an agent or a pipeline

JSON request in, GLB and JSON files out, offline and deterministic, so it fits a batch script, build step or agent tool loop with no server. `coreFeasibility` checks footprints before generation. [CONTRACT.md](CONTRACT.md) and [`schemas/`](schemas) define the request, outputs and closed domain error set.

## Consumers

[urbe](https://github.com/hec-ovi/urbe) is a deterministic city sandbox that furnishes a whole city with it: [buildingforge](https://github.com/hec-ovi/buildingforge) produces the shells, this fills them, [pbrforge](https://github.com/hec-ovi/pbrforge) supplies the textures, and the NPC support files become the routines its population actually walks.
