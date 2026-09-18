# Box map

The [root contract](../CONTRACT.md) defines requests and placement output.
[Usage](../SKILL.md) gives a working example. [Issues](ISSUES.md) records consumer decisions.

| Box | Purpose | Dependencies | Schemas |
| --- | --- | --- | --- |
| [Core](../src/core/CONTRACT.md) | Geometry, grids, seeds and shared types | Exterior blueprint | [Types](../src/core/types.ts) |
| [Blueprint](../src/blueprint/CONTRACT.md) | Validate requests and construct samples | Core, GLB | [Request](../schemas/request.schema.json), [blueprint](../schemas/blueprint.schema.json) |
| [Layout](../src/layout/CONTRACT.md) | Fit rooms, core, contents and circulation | Core | [Floor](../schemas/floor.schema.json), [circulation](../src/layout/schema/circulation.schema.json) |
| [Lofts](../src/layout/lofts/CONTRACT.md) | Fit planning surfaces for multiple storeys | Layout, Core | [Floor](../schemas/floor.schema.json) |
| [Luxury](../src/layout/luxury/CONTRACT.md) | Fit complete furniture groups | Layout | [Parameters](../src/layout/luxury/schema.ts) |
| [Geometry](../src/geometry/CONTRACT.md) | Measure wall boundaries and emitted clearance | Core, Layout, GLB | [Floor](../schemas/floor.schema.json), [blueprint](../schemas/blueprint.schema.json) |
| [GLB](../src/glb/CONTRACT.md) | Build indexed meshes and read or write GLB | Core, glTF Transform | [Mesh parameters](../src/glb/mesh-builder.ts) |
| [Modules](../src/modules/CONTRACT.md) | Publish reusable room geometry | GLB, meshoptimizer | [Catalog](../schemas/modules.schema.json) |
| [Assets](../src/assets/CONTRACT.md) | Resolve existing furniture models by ID | glTF Transform, Core | [Catalog](../src/assets/schemas/catalog.schema.json) |
| [NPC](../src/npc/CONTRACT.md) | Produce anchors, staffing and navigation | Core, Layout | [NPC](../schemas/npc.schema.json) |
| [Placements](../src/placements/CONTRACT.md) | Publish three layouts and floor references | Blueprint, Layout, Geometry, Modules, Assets, NPC | [Layout](../schemas/floor-placement.schema.json), [building](../schemas/building.schema.json) |
| [Materials](../src/materials/CONTRACT.md) | Resolve canonical material keys for consumers | Materials catalog, GLB | [Parameters](../src/materials/index.ts) |
| [Preview](../src/ui/CONTRACT.md) | Draw module instances and inspect navigation | Root API, Modules, Assets, Three.js | [Placement result](../src/placements/types.ts) |
| [Samples](../src/ui/samples/CONTRACT.md) | Configure room review cameras | Preview | [Parameters](../src/ui/samples/schema.ts) |

`src/index.ts` exports generation, expansion, module publication and feasibility.
`src/cli.ts` writes building files. `src/modules/cli.ts` publishes the city kit.
`src/feasibility.ts` builds the browser entry with `npm run build:feasibility`.

Ten public contract tests run with `npm test`. Budget proof uses Exterior
`planAssembly` through its public source entry and records `out/proof/budget.json`.
Each measured export includes three JSON layouts, building.json and all shared modules.
The tests create only the two requested small buildings and cap workers at two.
