# Box map

The [root contract](../CONTRACT.md) defines requests and placement output.
[Usage](../SKILL.md) gives a working example. [Issues](ISSUES.md) records consumer
decisions. [Dimensions](RESEARCH.md) lists construction constants.

| Box | Purpose | Dependencies | Schemas |
| --- | --- | --- | --- |
| [Core](../src/core/CONTRACT.md) | Geometry, grids, seeds and shared types | Exterior blueprint | [Types](../src/core/types.ts) |
| [Architecture](../src/architecture/CONTRACT.md) | Pair Exterior families with proportions, programme and finishes; preserve shell-owned facades | Core, Placements | [Recipes](../src/architecture/recipes.ts) |
| [Blueprint](../src/blueprint/CONTRACT.md) | Validate requests and construct samples | Core, GLB | [Request](../schemas/request.schema.json), [blueprint](../schemas/blueprint.schema.json) |
| [Layout](../src/layout/CONTRACT.md) | Fit rooms inside the published room envelope and reduce service programs to fit | Core | [Floor](../schemas/floor.schema.json), [program changes](../schemas/building.schema.json), [circulation](../src/layout/schema/circulation.schema.json), [core fit](../src/layout/schema/core-feasibility.schema.json), [constants](../schemas/core-feasibility.json) |
| [Lofts](../src/layout/lofts/CONTRACT.md) | Fit planning surfaces for multiple storeys | Layout, Core | [Floor](../schemas/floor.schema.json) |
| [Luxury](../src/layout/luxury/CONTRACT.md) | Fit complete furniture groups | Layout | [Parameters](../src/layout/luxury/schema.ts) |
| [Geometry](../src/geometry/CONTRACT.md) | Measure wall boundaries and emitted clearance | Core, Layout, GLB | [Floor](../schemas/floor.schema.json), [blueprint](../schemas/blueprint.schema.json) |
| [GLB](../src/glb/CONTRACT.md) | Build indexed meshes and read or write GLB | Core, glTF Transform | [Mesh parameters](../src/glb/mesh-builder.ts) |
| [Modules](../src/modules/CONTRACT.md) | Publish reusable room geometry: surfaces, lights, core and built-in furniture wearing Materials keys | GLB, Materials, meshoptimizer | [Catalog](../schemas/modules.schema.json), [finishes](../src/modules/finishes.ts) |
| [Assets](../src/assets/CONTRACT.md) | Resolve existing furniture models by ID among those present | glTF Transform, Core | [Catalog](../src/assets/schemas/catalog.schema.json) |
| [NPC](../src/npc/CONTRACT.md) | Produce anchors, staffing and navigation; route across floors | Core, Layout | [NPC](../schemas/npc.schema.json), [route](../schemas/nav-route.schema.json) |
| [Placements](../src/placements/CONTRACT.md) | Publish shared layouts and floor references, built per family as panel frames, slabs, ceilings, lights and furniture | Blueprint, Layout, Geometry, Modules, Assets, NPC | [Layout](../schemas/floor-placement.schema.json), [building](../schemas/building.schema.json), [finish](../src/placements/finish.ts) |
| [Materials](../src/materials/CONTRACT.md) | Resolve canonical material keys for consumers | Materials catalog, GLB | [Parameters](../src/materials/index.ts) |
| [Preview](../src/ui/CONTRACT.md) | Draw module instances and inspect navigation | Root API, Modules, Assets, NPC, Three.js | [Placement result](../src/placements/types.ts) |
| [Samples](../src/ui/samples/CONTRACT.md) | Configure room review cameras | Preview | [Parameters](../src/ui/samples/schema.ts) |

`src/index.ts` exports generation, model presence, expansion, module publication,
feasibility and navigation. `src/cli.ts` writes building files. `src/modules/cli.ts`
publishes the city kit. `src/feasibility.ts` and `src/nav.ts` build the browser entries
with `npm run build`.

Public contract and geometry regressions run with `npm test`; the kit-plan
test takes six plans of the newest published index and the short generated shells of the
newest assembled city, and `npm run sweep` runs it over every plan of every index and
every shell of the city `URBE_CITY_DIR` names. One checks both compiled browser entries
against their sources; others route synthetic and generated navigation and furnish with
local models absent.
Budget proof uses Exterior `planAssembly` through its
public source entry and records `out/proof/budget.json`. Each measured export includes
three JSON layouts, building.json and all shared modules. Budget buildings measure
40 m by 40 m with 6 floors and 56 m by 56 m with 12 floors. The service regression
uses a 16 m by 32 m kit with 5 floors. Tests cap workers at two.
