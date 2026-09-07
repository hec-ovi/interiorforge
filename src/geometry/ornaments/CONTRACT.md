# CONTRACT: ornaments

Purpose: builds fitted lit room ornaments inside their planned furniture envelope.

## In / Out

`emitOrnament(mesh, keys, item, frame, elevation)` takes [ornament furniture](schema/ornament.schema.json), the building frame and floor elevation, and appends single-sided geometry to a MeshBuilder.

- `sleeping_pod`: shell at least 2.5 by 1.5 by 2 m, open long-side entrance with complete chamfer faces, mattress, storage ledge, screen and vertical lights.
- `ornament_wall`: luxury aquarium or leafy planted case, damaged service rack with bent pipes, sleeves, loose cables and debris, capsule hologram case.
- `room_divider`: open planted luxury divider, damaged pipe and cable divider, capsule glass and hologram divider.
- Assemblies use 0.5 m closing end bays and repeatable middle bays, with a solid base and separate upper frame. Plants vary by stable furniture identity. Clear display glazing and lights use separate physical materials.
- All parts stay inside width, depth and height, with floor-grounded supports. Output geometry is deterministic.
- Wall ornaments and dividers need at least 1 by 0.5 by 1.5 m. Triangles have positive area and unit normals matching their face winding.
- Hologram spheres have latitude and meridian lines. Painted damaged frames use worn steel; sleeping pods use flat fabric bedding.
- `Assembly` supplies local-coordinate `box`, `quad`, `triangle` and `tube` emission. Triangles are fully tessellated; nonplanar quads have separate face normals. Callers supply the planned furniture envelope.

## Errors

Non-finite or undersized dimensions throw RangeError before geometry is appended.

## Depends on

[core](../../core/CONTRACT.md), [layout](../../layout/CONTRACT.md), [glb](../../glb/CONTRACT.md), [panels](../panels/CONTRACT.md).
