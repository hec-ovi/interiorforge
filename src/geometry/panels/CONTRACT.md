# CONTRACT: panels

Purpose: fits large surface panels from nine matching border and filler roles.

## In / Out

- `nineSlice(width, height, unit = 0.5)` takes metre dimensions and returns fixed corner modules, repeatable edge/centre cells and trimmed residual fillers: [schema](schema/assembly.schema.json). Two-unit spans close with edge pieces and no centre. Smaller spans use one field.
- `PanelMeshBuilder` implements the [MeshBuilder contract](../../glb/CONTRACT.md). It divides registered wall faces and floor/ceiling polygons into large panels with fixed-width joints, retaining winding, exact coverage and world-metre texture scale. Border pieces meet without overlap. Irregular edges are clipped to their receiving polygon.
- `styleForTier(tier)` returns luxury for rich/high_rich, damaged for poor and capsule for mid. [Palettes](palettes.json) bind surface keys and geometric panel pitches.

## Errors

Non-finite or non-positive panel dimensions throw RangeError.

## Depends on

- [core](../../core/CONTRACT.md), polygon clipping and triangulation.
- [glb](../../glb/CONTRACT.md), mesh emission.
- [Materials](../../../../materials/CONTRACT.md), canonical PBR keys.
