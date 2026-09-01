# CONTRACT: src/materials

Purpose: turns the material keys in a finished GLB into real textures, resolved through the
materials database.

## In

- `textureDocument(doc, theme, options) -> TextureReport`: resolves every `theme/kind/tier`
  material in the document and hangs its maps on it. Options: `mode`
  (`external` default | `embed` | `keys`), `dir` (materials box root; defaults to
  `URBE_MATERIALS_DIR`, else the sibling `materials` box), `baseUrl` (URI prefix written into
  the GLB; defaults to the theme folder on disk), `theme` (a preloaded theme index, for
  browsers with no disk).
- `loadTheme(theme, dir?) -> LoadedTheme | null`: theme index plus a map reader, null when the
  database or the theme is not there.
- `materialsDir(dir?) -> string`: the resolved database root.
- `MaterialLibrary(index)`: key and alias resolution over one theme index.

## Out

`TextureReport { mode: "external" | "embedded" | "keys", baseUrl?, materials }`.

What lands on each material: basecolor, normal and ao maps (occlusion), emission where the
entry has one, plus its metallic and roughness factors, transmission and IOR for glass, and
emissive strength. Tiled entries get a `KHR_texture_transform` scale of `1 / worldSize`, since
this box lays UVs in world meters; `exact` entries get none, their faces carry 0..1 UVs.

## Errors

- `E_MATERIAL_UNRESOLVED`: the theme has no entry for a key the document uses, or embedding
  was asked for without the database on disk.

## Invariants

- Same document, same database, same options: same textures, same URIs, same order.
- Materials that already carry a base color texture are left untouched, so a shell that
  arrives finished keeps its own materials.
- A missing database degrades to keys, never to a failure: the box runs standalone.

## Depends on

- ../../../materials/CONTRACT.md (key resolution, entry schema, tiling config)
