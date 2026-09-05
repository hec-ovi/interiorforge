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
  - `Opening.glazing?: OpeningGlazing` mirrors the [Exterior clear field](../../../exterior/schemas/blueprint.schema.json): face-local `offset`, floor-relative `sill`, positive `width` and `height`, and inward `glassDepth` and `housingBackDepth`. All other fields are nonnegative. The field excludes frames and opaque spandrels; its absence leaves the overall opening available to consumers.
- `errors.ts`: `new InteriorError(code, detail, floor?)` produces `InteriorError { code, floor?, message }` from the closed code set in the root contract.
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
