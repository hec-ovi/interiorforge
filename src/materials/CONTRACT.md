# Materials

Resolves canonical keys into glTF material maps for consumers and authoring tools.

`textureDocument(doc, theme, options?)` returns `{mode, materials, baseUrl?}`.
[Options and results](index.ts) accept external, embed or keys modes, a directory,
base URL or preloaded theme. Directory selection uses the option,
`URBE_MATERIALS_DIR`, then sibling materials. Missing catalogs produce keys mode.

`MaterialLibrary` resolves keys and variants. `applyMaterials` attaches base color,
normal, occlusion, metallic roughness and emission maps with physical UV scaling.
Existing textured prop materials remain intact. Packed metallic roughness bytes retain
roughness in G and metallic in B. Repeated inputs produce the same output.

Unresolved keys, maps or unsuitable embedding requests throw `E_MATERIAL_UNRESOLVED`.
Placement generation publishes keys and leaves this resolution to the consumer.
Depends on [Core](../core/CONTRACT.md), glTF Transform and the sibling Materials catalog.
