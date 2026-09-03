# CONTRACT: materials

Purpose: resolves the material keys in a glTF document through the materials database and applies their textures and physical properties.

## In

- `textureDocument(doc: Document, theme: string, options?: TextureOptions) -> Promise<TextureReport>`: resolves every `theme/kind/tier`
  material in the document and attaches its maps. Options: `mode`
  (`external` default | `embed` | `keys`), `dir` (materials box root; defaults to
  `URBE_MATERIALS_DIR`, else the sibling `materials` box), `baseUrl` (URI prefix written into
  the GLB; defaults to the theme folder on disk), `theme` (a preloaded theme index, for
  browsers with no disk).
- `loadTheme(theme: string, dir?: string) -> LoadedTheme | null`: theme index plus a map reader, null when the
  database or the theme is not there.
- `materialsDir(dir?: string) -> string`: the resolved database root.
- `new MaterialLibrary(index: ThemeIndex)`: key and alias resolution over one theme index; `entry(key: string) -> MaterialEntry | undefined` performs lookup.
- `applyMaterials(doc: Document, library: MaterialLibrary, options: ApplyOptions) -> number`: mutates the document and returns the number of materials textured. `ApplyOptions` supplies `baseUrl`, `embed` and `readMap`.

## Out

`TextureReport { mode: "external" | "embedded" | "keys", baseUrl?, materials }`.

What lands on each material: basecolor, normal and ao maps (occlusion), emission where the
entry has one, plus its metallic and roughness factors, transmission and IOR for glass, and
emissive strength. Tiled entries get a `KHR_texture_transform` scale of `1 / worldSize`, since
this box lays UVs in world meters; `exact` entries get none, their faces carry 0..1 UVs.

## Errors

- `E_MATERIAL_UNRESOLVED`: the theme has no entry for a used key, a theme index or map cannot be
  read, or embedding is requested with a preloaded index that has no disk map reader.

## Invariants

- Equivalent untextured documents, the same database and the same options produce the same textures, URIs and order.
- Materials that already carry a base color texture are left untouched, so a shell that
  arrives finished keeps its own materials.
- A missing database returns key-only output so the box runs standalone.

## Depends on

- [core](../core/CONTRACT.md) (`InteriorError`)
- [materials database](https://github.com/hec-ovi/pbrforge/blob/main/CONTRACT.md) (key resolution, entry schema, tiling config)
- @gltf-transform/core 4.x (`Document` and material properties)
- Node filesystem and `URBE_MATERIALS_DIR` for disk-backed modes
