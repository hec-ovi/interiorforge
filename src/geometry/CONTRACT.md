# Geometry

Provides partition boundaries and physical clearance checks for placed modules.

Inputs are [floor data](../../schemas/floor.schema.json), the
[blueprint](../../schemas/blueprint.schema.json), Layout core parameters and a GLB
[MeshBuilder](../glb/CONTRACT.md). Outputs are wall runs, doorway volumes, stair steps
and successful clearance, or an InteriorError.

`walls.ts` extracts shared wall intervals, facade endpoint reservations and doorway
heads. `stairs.ts` computes landings, flight steps, clear width and stacked headroom.
`core-geo.ts` supplies shaft rectangles and lift doorway cuts. `door-clear.ts` checks
actual triangles against doorway volumes. `stair-clearance.ts` probes actual tread
and landing headroom. `shell-fit.ts` measures every transformed vertex against shell
walls and the opening rectangles that permit returns.

Stairs retain at least 1.2 m clear width and 2.1 m headroom. Clearance failures throw
`E_UNREACHABLE_SPACE`. Shell violations throw `E_SHELL_BREACH`. Facade returns retain
the blueprint sill, head, offset and attachment depth.

Depends on [Core](../core/CONTRACT.md), [Layout](../layout/CONTRACT.md) and
[GLB](../glb/CONTRACT.md).
