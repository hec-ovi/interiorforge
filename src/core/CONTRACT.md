# CONTRACT: core

Purpose: deterministic primitives shared by every box in this repo: seeded RNG, 2D geometry math, and the TypeScript types mirroring the public schemas.

## In / Out

- `rng.ts`
  - `createRng(seed: number, ...streamKeys: (string | number)[]) -> Rng`: independent deterministic stream per key path; editing one floor's stream never shifts another's.
  - `Rng.next() -> float [0,1)`, `Rng.int(min, max) -> int inclusive`, `Rng.range(min, max) -> float`, `Rng.pick(array)`, `Rng.shuffle(array) -> new array`.
  - Pure 32-bit integer ops (sfc32 core, splitmix32 seeding): identical output on every platform.
- `geom.ts`: `Point` is `[x, z]`, `Rect` is `{x, z, w, d}` (min corner). Polygon area/centroid/bounds, CCW test, point-in-polygon, point-in-rect, rect overlap/containment, rect-to-polygon containment, edge length, point along edge.
- `types.ts`: `InteriorRequest`, `Blueprint`, `FloorInterior`, `NpcSupport` and their parts, mirroring `../../schemas/*.schema.json`. Schemas are the source of truth; these types restate them for the compiler.
- `errors.ts`: `InteriorError { code, floor?, detail }` with the closed code set from the root contract.

## Errors

None thrown here except `InteriorError` construction helpers; geometry functions are total on valid input.

## Depends on

Nothing.
