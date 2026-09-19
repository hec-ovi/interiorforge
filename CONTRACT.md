# Interior 0.31.7

Places shared room modules and catalog furniture in three reusable building layouts.

## Calls

| Export from `src/index.ts` | Input | Output |
| --- | --- | --- |
| `generate`, alias `generateInterior` | [Request](schemas/request.schema.json) with [assembled blueprint](schemas/blueprint.schema.json) | Promise of `{building, layouts}` |
| `buildModules` | None | Promise of `{catalog, files}`, a manifest and map of GLB bytes |
| `writePlacements` | Generation result, output directory | Writes building and layout JSON |
| `expandBuilding` | Generation result | `{floors, npc}` with unique floor identities and absolute elevations |
| `findPath` | Expanded NPC data, two `{floor, position: [x,z]}` endpoints | Walk and connector legs, or null |
| `makePlacementFixture` | Optional [fixture settings](src/blueprint/fixture.ts) | Reproducible rectangular request |
| `coreFeasibility` | Consumed blueprint | [Core fit](src/layout/schema/core-feasibility.schema.json) |

`makeFixture` also provides a blueprint and shell document for feasibility tools.
`npm run build:feasibility` compiles the browser entry `src/feasibility.ts` to
`dist/feasibility.js`.

Generation accepts a rectangular construction plate, at least two floors starting at
zero, and one storey per assignment. Two floors publish `ground` and `crown` alone,
and the manifest names the layouts it publishes. An irregular outline is read through its
`roomEnvelope`. Every middle floor must share its outline,
height, doors and explicit program. Windows vary per floor by design, and so do opening
IDs and exterior dressing (material, panes, glazing, scenery, section ids). Default
programs derive from blueprint kinds, with the first middle floor defining its program.
Input objects remain unchanged. Optional `shellGlb` is metadata; generation consumes
the assembled blueprint. No shell, texture or furniture geometry is loaded.

## Files and frames

`npm run modules -- --out <dir>` writes 17 shared GLBs and `modules.json`, following
[modules.schema.json](schemas/modules.schema.json). Each entry gives `id`, relative
`file`, bounds `size` in XYZ metres, `origin` measured from bounds minimum to the
authored zero, `materialSlots`, triangle count and complete file byte count. GLBs
are indexed, quantized and require `EXT_meshopt_compression`. Material names are
keys only. The catalog is published once for the city.

`npm run generate -- --request request.json --out <dir>` writes `building.json`
and `layouts/ground.json`, `layouts/middle.json`, `layouts/crown.json`.
[Building schema](schemas/building.schema.json),
[layout schema](schemas/floor-placement.schema.json), [types](src/placements/types.ts).
Floor zero uses ground, indices 1 through F minus 2 use middle, and F minus 1 uses
crown; a two floor building has no middle layout and writes two files.
Each layout contains floor metadata, source openings, placements and NPC data.

Placements name exactly one `module` or `prop`, an instance `id`, `room`, XYZ
`position`, positive XYZ `scale` and `rotationY` in radians. Apply scale, then
rotation about positive Y, then position, then the building floor's elevation.
Preserve each GLB node's authored transform, including quantization transforms.
The GLB already contains its authored origin; `origin` is descriptive metadata.
XZ stays in the blueprint frame; layout Y starts at the walking surface.

Rooms, surfaces, walls, the vertical core and prop bounds fit the floor's published `roomEnvelope`,
kept behind `facade.wallDepth`, defaulting to 0.12 m; a floor without one uses its
outline inset by that depth. The band between that rectangle and the outline is the
exterior's own slab: open floor, walkable, carrying no partition and no interior
surface, and an exterior door reaches its room across it. Window returns fit between
adjacent backing planes. Door thresholds join the floor to source passages.

Construction uses the 0.5 m grid. Plain floor, ceiling and wall fields fit complete
rectangular runs through scale. Measured facade attachments and closing boundaries
retain exact source coordinates. Stair variants have 7 through 14 treads at 0.28 m
pitch; their fitted rise stays between 0.16 and 0.18 m. Furniture scales uniformly.
Prop IDs resolve through the existing [catalog](src/assets/catalog.json), whose
`modelUri` is relative to that catalog. Only furniture with a fitting catalog model
receives a prop placement and furniture anchors. Frames and LED housings are modules.

`building.modules` and `building.props` identify city resource catalogs, resolved
against the consumer's resource base. Layout file paths resolve beside building.json.
Resolve module material slots through `materialTheme` and `tier`; canonical slot
kinds remain unchanged. Prop materials belong to their existing models.

`building.floors[].openings` maps the layout's door IDs to this floor's door IDs, and
`treatments` carries this floor's own window returns, built from its own openings. Exterior door placement and room connection IDs match the blueprint.
Core placements carry `connector` and an actual corridor room ID.
Floors with reduced service rooms carry `program: {kind, changes}` in building.json.
Each change names the room kind, requested width and depth, and fitted dimensions
or null for an omitted room. Reduction order is executive office, meeting, storage,
locker room, kitchen, toilets. Each shrinks by 0.5 m to 2 m square, then is omitted.
Unit programs without a fitting suite retain the main room and omit its service.
Every repeated floor records its source layout's changes.
The Engine owns moving exterior leaves, lift motion and runtime collision. Remove
Exterior `floor:<index>/slab` nodes and shell scenery when drawing Interior surfaces;
the module floors retain the stair and lift cutouts. Use one active car per lift shaft;
car placements describe its stop pose. Landing doors remain at every floor.

Layout NPC records use `sourceFloor` and local identities. `expandBuilding` applies
floor identities, opening mappings, elevations and building connectors for Simulation.
Its navigation retains anchors, roles, routines, standing opportunities and floor grids.
A fitted roof retains its navigation access; a housing that cannot take the stair leaves the roof out of the navigation instead of closing the building. Runtime actor dimensions and dynamic
obstructions require consumer agreement in [issues](docs/ISSUES.md).

## Validation and limits

Windows overlap only when both their horizontal and sill to head intervals overlap.
Doorway geometry remains clear. Stair flights retain at least 1.2 m clear width and
2.1 m headroom. The shell check measures transformed module vertices and prop bounds.
Identical input and resource catalogs produce identical JSON and module bytes.

| Error code | Meaning |
| --- | --- |
| `E_BLUEPRINT_INVALID` | Invalid schema, opening overlap or incompatible reusable floors |
| `E_ASSIGNMENT_INVALID` | Incomplete assignments, differing middle programs or multiple storeys |
| `E_FLOOR_TOO_SMALL` | Floor cannot hold one room beside its core and circulation |
| `E_UNREACHABLE_SPACE` | Room, door, stair, anchor or roof access fails clearance |
| `E_SHELL_BREACH` | Module geometry or prop bounds reach forbidden shell space |

CLI argument and file errors exit nonzero. The modules command takes only `--out`.
Budget tests use Exterior `planAssembly` for a 40 m by 40 m, 6-floor mirror-frame
residence and a 56 m by 56 m, 12-floor corporate-sectors office. Each export,
including one complete shared module kit, stays under 2 MB and 30 seconds. Existing
prop geometry and Exterior assets are city resources, outside the building export.

## Dependencies

[Exterior piece kit](../exterior/src/kit/CONTRACT.md) supplies assembled blueprints.
[Assets](src/assets/CONTRACT.md) supplies prop IDs. Materials resolves keys at draw time.
GLB serialization uses glTF Transform 4 and meshoptimizer 1.1. Tests, proof details
and box boundaries are in [docs/INDEX.md](docs/INDEX.md).
