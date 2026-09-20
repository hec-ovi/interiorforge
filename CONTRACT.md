# Interior 0.33.0

Places shared room modules and catalog furniture in three reusable building layouts.

## Calls

| Export from `src/index.ts` | Input | Output |
| --- | --- | --- |
| `generate`, alias `generateInterior` | [Request](schemas/request.schema.json) with [assembled blueprint](schemas/blueprint.schema.json) | Promise of `{building, layouts}` |
| `buildModules` | Optional preloaded theme index | Promise of `{catalog, files}`, a manifest and map of GLB bytes |
| `writePlacements` | Generation result, output directory | Writes building and layout JSON |
| `expandBuilding` | Generation result | `{floors, npc}` with unique floor identities and absolute elevations |
| `findPath` | Expanded NPC data, two `{floor, position: [x,z]}` endpoints | Walk and connector legs, or null |
| `makePlacementFixture` | Optional [fixture settings](src/blueprint/fixture.ts) | Reproducible rectangular request |
| `coreFeasibility` | Consumed blueprint, building type | [Core fit](src/layout/schema/core-feasibility.schema.json), the placement `generate` furnishes |

`makeFixture` also provides a blueprint and shell document for feasibility tools.
`npm run build:feasibility` compiles the browser entry `src/feasibility.ts` to
`dist/feasibility.js`.

Generation accepts a rectangular construction plate, at least one floor at or above
index zero, and one storey per assignment. Basements stay closed and the lowest
above-ground floor is the ground layout, whatever index it carries. Two floors publish `ground` and `crown` alone, and
a stack whose plates hold no vertical core opens as its ground floor alone, with no
connectors. The manifest names the layouts it publishes. An irregular outline is read through its
`roomEnvelope`. Every middle floor must share its outline,
height, doors and explicit program. Windows vary per floor by design, and so do opening
IDs and exterior dressing (material, panes, glazing, scenery, section ids). Default
programs derive from blueprint kinds, with the first middle floor defining its program;
a generic `residential` plan slug takes the parcel's own program in a corporate, office
or hotel building, and a `commerce` slug takes the venue a restaurant, coffee shop or
mall parcel names. Input objects remain unchanged. Optional `shellGlb` is metadata;
generation consumes the assembled blueprint. No shell, texture or furniture geometry is loaded.

## Files and frames

`npm run modules -- --out <dir>` writes 72 shared GLBs and `modules.json`, following
[modules.schema.json](schemas/modules.schema.json). Each entry gives `id`, relative
`file`, bounds `size` in XYZ metres, `origin` measured from bounds minimum to the
authored zero, `materialSlots`, triangle count and complete file byte count. GLBs
are indexed, quantized and require `EXT_meshopt_compression`. A slot is
`theme/kind/tier#variant`: the GLB material is named by the key and carries the variant
in `extras.materialVariant`; no texture images travel. UVs are tile units, one unit per
published `tiling.worldSize` repeat, read from the sibling Materials theme when it is
present. The catalog is published once for the city.

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
A stretched placement also carries `uvRepeat`, `[u, v]`: multiply the module's own UVs by
it. Absent means `[1, 1]`.
Preserve each GLB node's authored transform, including quantization transforms.
The GLB already contains its authored origin; `origin` is descriptive metadata.
XZ stays in the blueprint frame; layout Y starts at the walking surface.

## The look

A building is furnished in one family: `luxury` for rich and high rich tiers, `capsule`
for mid, `damaged` for poor, `industrial` for factory and military parcels. Each room
takes its finish from the family and its kind ([finish table](src/placements/finish.ts)).

Every wall face a room owns is a nine-slice panel frame, its own face on the shell
included: one fitted field over the whole run as the backing, four one-cell corners, a
rail along the head and the foot, a stile up each end, and a lit joint at the top and
bottom, published as `cove` light records. Each member is 12 mm short of its cell, so the
joints between them show field. A run shorter than 1.5 m, a door header and the unframed
families (damaged, industrial) take one fitted plain field instead. An office, meeting or
executive room looks onto public space through a glass field in the same frame. A frame
band always contrasts its field: walnut on the light walls, ivory on the dark ones.

A room's face on the shell is cut by every opening carried by any floor that reuses this
layout, so one lined run serves floors whose windows sit elsewhere; an angled facade edge
keeps the shell's own face.

Floors are one fitted slab per room rectangle over a dark screed (stone, obsidian, marble
or timber by room). Ceilings carry a fitted outer band, an inset field, recessed spot
modules and a cove module on every cove record; damaged and industrial families hang
exposed services instead of a band. Carpets lie under the seating and suite groups a rich
interior fits, in homes, lounges, receptions and the seated bay of a large shop floor.

Every room is lit to the illuminance its kind asks for, measured as the flux it publishes
over its own floor area, not as a fixture count. Ceiling luminaires stand on a grid across
the whole plate, about one per 24 m2 and between 8 and 96 in a room, so a hall is lit
across its middle and not only around its edge; each carries the share that lands the room
in its band, from a downlight to a high bay.

| Room kind | lux |
| --- | --- |
| sales floor, dining area, bar, reception, lounge, concourse, counter area | 150 to 300 |
| corridor, elevator lobby | 150 to 350 |
| office, meeting, executive, kitchen, gym floor | 280 to 500 |
| bathroom, toilets, locker room | 140 to 300 |
| bedroom, living, studio | 70 to 200 |
| storage, mechanical room | 70 to 160 |
| parking area | 60 to 150 |
| open terrace | 25 to 120 |

A mid tier carries three quarters of its band and a poor tier half, so a worn interior
stays dim by design.

Every light record has a module standing at it, and every lit module has a record: spots,
strips and coves from the room plan, the frames' joints from the walls, and furniture
lenses published with their `furniture` id. Furniture kinds with a built-in module
(desks, counters, kitchen runs, beds with planted headboards, wardrobes, showers, basins,
lit planters, planted screens, aquarium walls, screens, art, shelves, stools, chairs,
sofas, tables, capsule pods, crates) are scaled per axis to their record; the rest resolve
catalog props. Programs: a lobby stands its desk on the axis of the wall facing the
entrance with seating bays and planter cases; a restaurant runs a counter with its back
bar and stools, dining tables between planted screens; a residence fits a kitchen run with
a breakfast bar, a suite and a bathroom with a glazed shower and a planter. A hall
furnishes by its floor area, not by a fixed handful: a shop floor takes its checkout,
shelving along the walls, display aisles across the plate and, past 80 m2, a seated bay on
its carpet, so a 2000 m2 room reads as a shop and not as an empty plate.

Rooms, surfaces, walls, the vertical core and prop bounds fit the floor's published `roomEnvelope`,
kept behind `facade.wallDepth`, defaulting to 0.12 m; a floor without one uses its
outline inset by that depth. The band between that rectangle and the outline is the
exterior's own slab: open floor, walkable, carrying no partition and no interior
surface, and an exterior door reaches its room across it, through the part of its span that meets that room's floor. Window returns fit between
adjacent backing planes. Door thresholds join the floor to source passages; a pocket door's passage is its published `door.clearance`, its connection carries `clearDepth` 0 (the leaves retract into the cassette), and the cassette beside it is solid wall.

Construction uses the 0.5 m grid. Measured facade attachments and closing boundaries
retain exact source coordinates. Stair variants have 7 through 14 treads at 0.28 m
pitch; their fitted rise stays between 0.16 and 0.18 m. Props scale uniformly.
Prop IDs resolve through the existing [catalog](src/assets/catalog.json), whose
`modelUri` is relative to that catalog.

`building.modules` and `building.props` identify city resource catalogs, resolved
against the consumer's resource base. Layout file paths resolve beside building.json.
Modules carry their finish keys; prop materials belong to their existing models.

`building.floors[].openings` maps the layout's door IDs to this floor's door IDs, and
`treatments` carries this floor's own window returns, built from its own openings. Exterior door placement and room connection IDs match the blueprint.
Core placements carry `connector` and an actual corridor room ID. `building.corePlacement`
is the stair the building was furnished around, the shape `coreFeasibility` returns for
the same blueprint and building type, so a window measured against the gate stays clear. A second stair is built
only where its flights keep the published headroom. `building.reservationCrossing` names
the exterior opening the core crosses when the plate holds no clear position.
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
Every venue publishes the roles that run it and its guests: a restaurant its host,
waiters, cook and bartender, a coffee shop its barista, a hotel its receptionist and porter,
a shop its vendor, an office its receptionist and guard, each on counter, seat and work
anchors. A fitted roof retains its navigation access; a housing that cannot take the stair leaves the roof out of the navigation instead of closing the building. Runtime actor dimensions and dynamic
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
| `E_UNREACHABLE_SPACE` | Circulation, door, stair or anchor fails clearance; an unreachable room is dropped instead |
| `E_SHELL_BREACH` | Module geometry or prop bounds reach forbidden shell space |

CLI argument and file errors exit nonzero. The modules command takes only `--out`.
Budget tests use Exterior `planAssembly` for a 40 m by 40 m, 6-floor mirror-frame
residence and a 56 m by 56 m, 12-floor corporate-sectors office. Each export,
including one complete shared module kit, stays under 2 MB and 30 seconds. Existing
prop geometry and Exterior assets are city resources, outside the building export.

## Dependencies

[Exterior piece kit](../exterior/src/kit/CONTRACT.md) supplies assembled blueprints.
[Assets](src/assets/CONTRACT.md) supplies prop IDs. [Materials](../materials/CONTRACT.md)
publishes the keys the modules wear and their tile sizes. GLB serialization uses glTF
Transform 4 and meshoptimizer 1.1. Tests, proof details and box boundaries are in
[docs/INDEX.md](docs/INDEX.md).
