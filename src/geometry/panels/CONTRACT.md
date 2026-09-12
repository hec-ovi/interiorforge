# CONTRACT: panels

Purpose: fits large surface panels from nine matching border and filler roles.

## In / Out

- `nineSlice(width, height, unit = 0.5)` takes metre dimensions and returns fixed corner modules, repeatable edge/centre cells and trimmed residual fillers: [schema](schema/assembly.schema.json). Two-unit spans close with edge pieces and no centre. Smaller spans use one field.
- `PanelMeshBuilder` implements the [MeshBuilder contract](../../glb/CONTRACT.md). It divides registered wall faces and floor/ceiling polygons into large panels with fixed-width joints, 12 mm recessed wall fields and 8 mm recessed ceiling fields joined by 45-degree bevels, retaining winding, exact projected coverage and world-metre texture scale. Floor walking surfaces remain level. Border pieces meet without overlap. Irregular edges are clipped to their receiving polygon.
- `styleForTier(tier)` returns luxury for rich/high_rich, damaged for poor and capsule for mid. [Palettes](palettes.json) bind surface keys and geometric panel pitches.
- Luxury walnut fields use the same fitted wall modules as the pale stone fields.

## Errors

Non-finite or non-positive panel dimensions throw RangeError.

## Depends on

- [core](../../core/CONTRACT.md), polygon clipping and triangulation.
- [glb](../../glb/CONTRACT.md), mesh emission.
- [Materials](../../../../materials/CONTRACT.md), canonical PBR keys.
