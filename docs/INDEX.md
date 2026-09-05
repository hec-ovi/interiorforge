# Box map

Root box: the [interior generator](../CONTRACT.md). Inner boxes, one folder each:

- [`src/core`](../src/core/CONTRACT.md): seeded RNG, 2D geometry, walkable grid, shared types and errors; room interior rings and Exterior opening clear fields. Depends on the Exterior blueprint contract.
- [`src/glb`](../src/glb/CONTRACT.md): GLB I/O and mesh construction with winding, UV and sealed-buffer rules. Depends on core.
- [`src/blueprint`](../src/blueprint/CONTRACT.md): request validation including window clear-field fit, assignment resolution and fixture shells. Depends on core and glb.
- [`src/layout`](../src/layout/CONTRACT.md): shell wall model, vertical core, facade-led rooms with exact interior exclusions, fitted contents, light grids, navigation and reachability. Depends on core.
- [`src/layout/schema/circulation.schema.json`](../src/layout/schema/circulation.schema.json): sampled architectural routes reserved before grounded furniture placement; separate from NPC seat-use navigation.
- [`src/npc`](../src/npc/CONTRACT.md): room-footprint anchors, roles, routines, nav export and pathfinding. Depends on core and layout.
- [`src/materials`](../src/materials/CONTRACT.md): resolves material keys through the sibling [Materials](https://github.com/hec-ovi/pbrforge/blob/main/CONTRACT.md) database and textures glTF documents, retaining packed linear metallic-roughness maps in external and embedded output. Depends on core, Materials and glTF Transform.
- [`src/geometry`](../src/geometry/CONTRACT.md): room polygons with interior exclusions, shared ceiling/soffit ownership, shaped furniture and shell-fit checks. Depends on core, glb and layout.
- [`src/ui`](../src/ui/CONTRACT.md): Three.js building preview and floor inspector. Depends on the root surface, core, glb, materials, npc and Three.js.

Root `src/index.ts` wires blueprint -> layout -> npc -> geometry -> materials. `generateInterior` returns the combined building; `generateFloorInteriors` serializes and releases one floor at a time without a combined document. `src/cli.ts` runs either path from the terminal.

Dependency edges flow one way: ui and cli sit on top, core sits at the bottom, no cycles.
