# CONTRACT: core

Purpose: deterministic primitives shared by every box in this repo: seeded RNG, 2D geometry math, and the TypeScript types mirroring the public schemas.

## In / Out

- `rng.ts`
  - `createRng(seed: number | string, ...streamKeys: (string | number)[]) -> Rng`: independent deterministic stream per key path; consuming values in one stream does not shift another.
  - `Rng.next() -> float [0,1)`, `Rng.int(min, max) -> int inclusive`, `Rng.range(min, max) -> float`, `Rng.pick(array)`, `Rng.shuffle(array) -> new array`.
  - Pure 32-bit integer ops (sfc32 core, splitmix32 seeding): identical output on every platform.
- `geom.ts`: `Point` is `[x, z]`, `Rect` is `{x, z, w, d}` (min corner). Polygon area/centroid/bounds, CCW test, point-in-polygon, point-in-rect, rect overlap/containment, rect-to-polygon containment, edge length, point along edge.
- `triangulate.ts`: `triangulate(poly: readonly Point[]) -> [number, number, number][]` returns deterministic CCW XZ index triples for a simple nondegenerate ring, accepting either input winding. Fewer than three points returns an empty list. Degenerate input or the 10,000-iteration guard can return a partial triangulation; consumers requiring complete coverage must verify its area.
- `types.ts`: `InteriorRequest`, `Blueprint`, `FloorInterior`, `NpcSupport` and their parts, mirroring `../../schemas/*.schema.json`. Schemas are the source of truth; these types restate them for the compiler.
  - `Room.polygon` is its CCW outer boundary. Optional `Room.holes` are clockwise simple interior rings, strictly inside that boundary and pairwise disjoint without touching. They exclude floor coverage and room occupancy; absence means no exclusions. Shape validation enforces arrays and coordinates; Layout owns the geometric invariants.
- `room-footprint.ts` consumes `{ polygon, holes? }` in one coordinate frame. `roomFootprintContains(room, point)` includes the outer boundary and excludes hole interiors and boundaries, with a 1e-8 m boundary tolerance. `roomFootprintClearance` returns signed minimum boundary distance. `roomFootprintArea` excludes holes. `roomFootprintAnchor` returns a deterministic interior point of a valid positive-area footprint, including a room surrounding a central core. Consumers share these functions for occupancy and center targets.
  - `Opening.glazing?: OpeningGlazing` mirrors the [Exterior clear field](../../../exterior/schemas/blueprint.schema.json): face-local `offset`, floor-relative `sill`, positive `width` and `height`, and inward `glassDepth` and `housingBackDepth`. All other fields are nonnegative. The field excludes frames and opaque spandrels; its absence leaves the overall opening available to consumers.
  - `Facade.coreAdjacency?: CoreAdjacency` follows [the consumed schema](../../schemas/blueprint.schema.json#/$defs/coreAdjacency): a `glazing` rule and optional unique `{ floor, opening, role, clearDepth }` overrides. Roles are `structure`, `circulation`, or `room`; nonnegative depths start at the full lining's inner face and end at actual stair, elevator or riser solids. Windows and openings with `glazing` take the default; overrides name an existing opening and replace its rule. Absence requests structural fit only. Layout validates override references and uniqueness. Room footprints and unused service-stub reservations do not expand with this policy.
  - [Core feasibility constants](../../schemas/core-feasibility.json) publish `coreAdjacency.glazing = { role: "circulation", clearDepth: 1.2 }` as the game-design default for new producers, not a building-code claim. Before openings exist, conservative producers add twice that depth to each core-host rectangle dimension; final placement checks the actual opening spans. `CoreAdjacencyFailure` names floor, opening, core solid, role, required depth and available depth.
- `errors.ts`: `new InteriorError(code, detail, floor?)` produces `InteriorError { code, floor?, message }` from the closed code set in the root contract.
- `Blueprint.coreFrame?: { anglesDeg: number[] }` follows the consumed blueprint schema: a nonempty ordered list of finite core axes, unique modulo 180. Layout validates angle equivalence and applies entrance orientation. Absence permits its default frame search. A published roof bulkhead locks an allowed axis and its exact center.
- `OpeningDoor`, `DoorEnvelope` and `PocketDoorMotion` mirror Exterior's [door envelopes and motion](../../../exterior/schemas/blueprint.schema.json#/$defs/pocketMotion). A pocket door requires `clearance`, `cassette` and one or two indexed moving leaves with signed face-U travel. Opening dimensions remain the clear doorway; `clearance` repeats that passage with the cassette's back-skin attachment depth. `cassette` contains the complete fixed assembly, not a solid barrier across the passage. Leaf `pocket` bounds are free chambers inside opaque skins, with positive inward front/back depths; their passage-facing edges are open lateral slots. `facade.wallDepth` includes the cassette back skin. Schema enforces complete fields; Blueprint validates containment, alignment and leaf identities. Swing, roller and minimal clear-depth metadata remain accepted.
- `grid.ts`: `WalkGrid(origin: Point, cellSize, cols, rows)` starts blocked; `forPolygon(outline, cellSize, bounds: Rect)` opens cells whose centers are inside the polygon. Cell size and dimensions must be positive.
  - `center(col, row) -> Point`, `cellAt(Point) -> [col, row]`, `inBounds`, `isWalkable`, and `isWalkableAt` expose the grid. Outside cells are blocked; `set` outside bounds does nothing.
  - `blockRect(Rect, margin = 0)` and `openRect(Rect)` change cells by center containment. These operations do not establish continuous body clearance.
  - `flood(Point) -> Uint8Array` returns row-major four-neighbor reachability, empty when the starting cell is blocked; `reaches(mask, Point)` queries that mask. `walkableCount()` counts open cells.
  - `toBase64()` packs row-major walkability bits; `fromBase64(encoded, origin, cellSize, cols, rows)` restores them with the supplied grid geometry.

## Errors

- `Rng.pick([])` throws `Error("pick on empty array")` because no value of `T` exists.
- Other primitives are total for inputs described above. `InteriorError` is constructed here and thrown by dependent boxes.

## Depends on

- [Exterior blueprint schema](../../../exterior/schemas/blueprint.schema.json), for the consumed opening clear field.
