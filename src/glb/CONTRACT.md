# CONTRACT: glb

Purpose: the only place that touches GLB bytes: builds interior meshes with correct winding, normals and world-meter UVs, and reads or writes GLB files via @gltf-transform/core.

## In / Out

- `mesh-builder.ts`: `new MeshBuilder(frame?, origin?)` accumulates geometry per material key (`theme/kind/tier` slugs).
  - `addQuad(material, [v0, v1, v2, v3], uv?)`: vertices CCW seen from the front; normal derived from winding. `uv` is "world" (default): planar UVs in meters (walls: u along the wall, v up; horizontal: u = x, v = z), or "unit": 0..1 over the face, for exact-placement materials; on a prism side u grows toward the viewer's right seen from the front and v follows glTF (0 at the top), so a picture reads left to right and upright.
  - `addQuadUv(material, [v0, v1, v2, v3], [uv0, uv1, uv2, uv3])`: the same quad contract with caller-supplied UV coordinates for a deliberately mapped face.
  - `addHorizontalPolygon(material, polygon, y, facing, uv?)`: triangulated floor or ceiling surface, `facing` "up" | "down".
  - `addBox(material, rect, y0, y1, faces?)`: axis-aligned box, outward normals; `faces` subset of `top bottom north south east west` (default all six).
  - `addPrism(material, corners, y0, y1, uv?, caps?)`: vertical prism over a plan polygon at any angle, caps optional.
  - `merge(other)`: appends another builder's groups after this one's, material by material, indices rebased.
  - `seal()`: makes the builder read-only and compacts positions, normals, UVs and indices into glTF-width typed arrays. Further geometry additions fail.
  - `isEmpty()`, group access for tests.
- `io.ts`
  - `createDocument(builder) -> Document`: fresh glTF document, one scene and one single-sided material per key with a deterministic key color.
  - `appendToDocument(document, builder)`: adds the builder's meshes to an existing document's default scene for shell completion.
  - `writeGlb(document) -> Promise<Uint8Array>`: deterministic binary, byte-identical for identical input. Textures carrying a URI stay external, textures carrying bytes are embedded in the binary chunk.
  - `readGlbBytes(bytes) -> Promise<Document>`, `readGlbFile(path) -> Promise<Document>`, `glbJson(bytes) -> Record<string, unknown>`: the JSON chunk, for inspecting output that references external images.
  - `sceneBounds(document) -> {min, max}` for shell consistency checks.

## Errors

- Mutation after `MeshBuilder.seal()` throws `Error("cannot add geometry to a sealed mesh")`.
- GLB parse, serialization and file I/O errors propagate from glTF Transform or the platform. Public generator entrypoints map unreadable shell input to `E_SHELL_MISMATCH`.

## Invariants

- glTF conventions: CCW front faces, right-handed, +Y up, single-sided materials.
- Sealing preserves material order and the values that are written to GLB.
- Geometry is written at its supplied coordinates without negative node scaling.

## Depends on

- [core](../core/CONTRACT.md)
- @gltf-transform/core and @gltf-transform/extensions 4.x (texture transform, transmission, IOR, emissive strength)
