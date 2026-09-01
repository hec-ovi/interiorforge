# CONTRACT: glb

Purpose: the only place that touches GLB bytes: builds interior meshes with correct winding, normals and world-meter UVs, and reads or writes GLB files via @gltf-transform/core.

## In / Out

- `mesh-builder.ts`: `MeshBuilder` accumulates geometry per material key (`theme/kind/tier` slugs).
  - `addQuad(material, [v0, v1, v2, v3])`: vertices CCW seen from the front; normal derived from winding; UVs world-planar in meters (walls: u along the wall, v up; horizontal: u = x, v = z).
  - `addHorizontalPolygon(material, polygon, y, facing)`: triangulated floor or ceiling surface, `facing` "up" | "down".
  - `addBox(material, rect, y0, y1, faces?)`: axis-aligned box, outward normals; `faces` subset of `top bottom north south east west` (default all six).
  - `isEmpty()`, group access for tests.
- `io.ts`
  - `createDocument(builder) -> Document`: fresh glTF document, one scene, one material per key (name = key, deterministic placeholder color), single-sided.
  - `appendToDocument(document, builder)`: adds the builder's meshes into an existing document's default scene (used to complete the shell GLB).
  - `writeGlb(document) -> Uint8Array`, `readGlb(bytes | path) -> Document`: deterministic binary, byte-identical for identical input.
  - `sceneBounds(document) -> {min, max}` for shell consistency checks.

## Errors

None of its own; propagates @gltf-transform I/O failures. Callers wrap into `InteriorError` where a code applies.

## Invariants

- glTF conventions: CCW front faces, right-handed, +Y up, single-sided materials.
- Never mirrors geometry by negative scale; no coplanar duplicate faces emitted by construction.

## Depends on

- ../core/CONTRACT.md
- @gltf-transform/core 4.x
