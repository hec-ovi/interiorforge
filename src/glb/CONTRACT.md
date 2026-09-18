# GLB

Builds indexed mesh primitives and reads or writes GLB bytes.

`MeshBuilder` takes an optional UV frame and origin. It accepts quads, polygons,
boxes and prisms by material key. Inputs and output groups are typed in
[mesh-builder.ts](mesh-builder.ts). `seal()` makes a builder immutable and stores
compact arrays. Vertices use CCW winding, positive Y up and outward normals.

`createDocument(builder)` and `appendToDocument(document, builder)` create indexed
glTF meshes. `writeGlb(document)` returns deterministic bytes, retaining external
texture URIs. `readGlbBytes`, `readGlbFile`, `glbJson` and `sceneBounds` provide I/O
and inspection. [io.ts](io.ts) defines parameters and result types.

Material names are `theme/kind/tier`; optional variant preferences are extras.
Modules applies quantization and meshopt compression through its own writer.
Sealed builder mutation throws Error; I/O errors propagate from the platform.
Depends on [Core](../core/CONTRACT.md) and glTF Transform.
