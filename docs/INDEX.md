# Box map

Root box: the [interior generator](../CONTRACT.md). Inner boxes, one folder each:

Browser-safe boundary: [`src/feasibility.ts`](../src/feasibility.ts) exposes Layout's actual core solver and selected stair footprint to Exterior, independent of rendering and filesystem code.

- [`src/core`](../src/core/CONTRACT.md): seeded RNG, 2D geometry, source-frame room grids, certified swept transitions and breadth-first route trees, shared types and errors; room rings, opening fields, door envelopes and core-facade policy. Depends on the Exterior blueprint contract.
- [`src/glb`](../src/glb/CONTRACT.md): GLB I/O and mesh construction with winding, UV and sealed-buffer rules. Depends on core.
- [`src/blueprint`](../src/blueprint/CONTRACT.md): request validation including window fields and pocket-door fit, assignment resolution and fixture shells. Depends on core and glb.
- [`src/layout`](../src/layout/CONTRACT.md): measured core-facade clearance and roof-locked feasibility, shell walls, facade-led rooms with exact exclusions, fitted contents, light grids, navigation and reachability. Depends on core.
- [`src/layout/schema/circulation.schema.json`](../src/layout/schema/circulation.schema.json): sampled architectural routes reserved before grounded furniture placement; separate from NPC seat-use navigation.
- [`src/npc`](../src/npc/CONTRACT.md): room-footprint anchors, roles, routines, nav export and pathfinding. Depends on core and layout.
- [`src/materials`](../src/materials/CONTRACT.md): resolves material keys through the sibling [Materials](https://github.com/hec-ovi/pbrforge/blob/main/CONTRACT.md) database and textures glTF documents, retaining packed linear metallic-roughness maps in external and embedded output. Depends on core, Materials and glTF Transform.
- [`src/geometry`](../src/geometry/CONTRACT.md): room polygons with interior exclusions, shared ceiling/soffit ownership, shaped furniture and shell-fit checks. Depends on core, glb and layout.
- [`src/assets`](../src/assets/CONTRACT.md): verified model catalog, bounded selection and material-preserving glTF instancing. Depends on glTF Transform.
- [`src/ui`](../src/ui/CONTRACT.md): Three.js building preview and floor inspector. Depends on the root surface, core, glb, materials, npc and Three.js.

Root `src/index.ts` wires blueprint -> layout -> npc -> geometry -> materials. `generateInterior` returns the combined building; `generateFloorInteriors` serializes and releases one floor at a time without a combined document. `src/cli.ts` runs either path from the terminal.

Dependency edges flow one way: ui and cli sit on top, core sits at the bottom, no cycles.

- [Geometry panels](../src/geometry/panels/CONTRACT.md): fixed 0.5 m nine-piece border modules, large fitted wall/floor/ceiling fields and style palettes. Depends on core and glb; [assembly schema](../src/geometry/panels/schema/assembly.schema.json).

- [Ornament assemblies](../src/geometry/ornaments/CONTRACT.md): framed aquariums, planted dividers, hologram cases and service racks inside reserved furniture envelopes. Depends on core, glb, layout and panels; [input schema](../src/geometry/ornaments/schema/ornament.schema.json).

- [Loft planning](../src/layout/lofts/CONTRACT.md): fitted partial upper platforms, private stairs and clear entries in double-height rooms. Depends on core and layout; [floor schema](../schemas/floor.schema.json).
- [Architectural details](../src/geometry/details/CONTRACT.md): loft platforms, guards, rail-reserved stairs and bounded overhead services. Depends on core, glb, loft planning and panels; [floor schema](../schemas/floor.schema.json).
- [NPC placements](../src/npc/CONTRACT.md): vendor/staff and future story slots with reachable approaches and occupied-body route checks; [NPC schema](../schemas/npc.schema.json).
