# CONTRACT: core

Purpose: deterministic primitives shared by every box in this repo: seeded RNG, 2D geometry math, and the TypeScript types mirroring the public schemas.

## In / Out

- `rng.ts`
  - `createRng(seed: number | string, ...streamKeys: (string | number)[]) -> Rng`: independent deterministic stream per key path; consuming values in one stream does not shift another.
  - `Rng.next() -> float [0,1)`, `Rng.int(min, max) -> int inclusive`, `Rng.range(min, max) -> float`, `Rng.pick(array)`, `Rng.shuffle(array) -> new array`.
  - Pure 32-bit integer ops (sfc32 core, splitmix32 seeding): identical output on every platform.
- `geom.ts`: `Point` is `[x, z]`, `Rect` is `{x, z, w, d}` (min corner). Polygon area/centroid/bounds, CCW test, point-in-polygon, point-in-rect, rect overlap/containment, rect-to-polygon containment, edge length, point along edge.
- `types.ts`: `InteriorRequest`, `Blueprint`, `FloorInterior`, `NpcSupport` and their parts, mirroring `../../schemas/*.schema.json`. Schemas are the source of truth; these types restate them for the compiler.
- `errors.ts`: `new InteriorError(code, detail, floor?)` produces `InteriorError { code, floor?, message }` from the closed code set in the root contract.

## Errors

- `Rng.pick([])` throws `Error("pick on empty array")` because no value of `T` exists.
- Other primitives are total for inputs described above. `InteriorError` is constructed here and thrown by dependent boxes.

## Depends on

Nothing.
