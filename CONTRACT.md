# Interior 0.39.0

Places shared room modules and catalog furniture in reusable building layouts.

## Architectural pairing

Every named Exterior architecture has a registered Interior recipe in
`src/architecture/recipes.ts`, selected automatically from `blueprint.assembly.architecture`.
`INTERIOR_RECIPES` and `interiorRecipe(request)` expose that registry. Each recipe owns
its preferred frontage widths, wall/frame palette, floor finish and ceiling treatment;
the common planner still enforces the exact shell openings, circulation and core.
The building output publishes optional `architecture`, identifying the chosen recipe.
Unlabelled legacy shells keep their existing generic interiors. Tier, office and
industrial-use rules remain authoritative: a recipe's palette dresses luxury rooms only,
and never a room wearing a reference style (below).

## Calls

| Export from `src/index.ts` | Input | Output |
| --- | --- | --- |
| `generate`, alias `generateInterior` | [Request](schemas/request.schema.json) with [assembled blueprint](schemas/blueprint.schema.json); optional `{models}` | Promise of `{building, layouts, missingModels}` |
| `presentModels` | Optional models folder | Promise of the catalog IDs whose model file is present |
| `buildModules` | Optional preloaded theme index | Promise of `{catalog, files}`, a manifest and map of GLB bytes |
| `writePlacements` | Generation result, output directory | Writes building and layout JSON |
| `expandBuilding` | Generation result | `{floors, npc}` with unique floor identities and absolute elevations |
| `findPath` | `{nav, from, to}`, endpoints `{floor, x, z}` | `{legs, connectors}` or `{error}`, see [Navigation](#navigation) |
| `makePlacementFixture` | Optional [fixture settings](src/blueprint/fixture.ts) | Reproducible rectangular request |
| `coreFeasibility` | Consumed blueprint, building type | [Core fit](src/layout/schema/core-feasibility.schema.json), the placement `generate` furnishes |

`makeFixture` also provides a blueprint and shell document for feasibility tools.
Two source modules are consumed directly and are part of this contract.
[`src/geometry/lift-spec.ts`](src/geometry/lift-spec.ts) exports `LIFT_CAR`, the authored
car coordinates (a 2.3 m cab, scaled by its placement into its shaft, with its 1.1 m
doorway, the control panel's screen and six buttons, and its ceiling lens); the Engine's
lift consumer reads it so controls, display, passenger collision and cab light stand on the
model, and a change there changes the Engine's lifts.
[`src/styles/luxury/apartment-doors.ts`](src/styles/luxury/apartment-doors.ts) exports
`apartmentEntrances` and `apartmentSlots`, which build the entrance records below.
`npm run build` compiles the browser entries `src/feasibility.ts` and `src/nav.ts` to
`dist/feasibility.js` and `dist/nav.js`; `npm run build:feasibility` runs the same build.

Generation accepts a rectangular construction plate, at least one floor at or above
index zero, and one storey per assignment, or two consecutive storeys above the ground
floor for an `apartment-1702` duplex (below). Basements stay closed and the lowest
above-ground floor is the ground layout, whatever index it carries. Two floors publish `ground` and `crown` alone, and
a stack whose plates hold no vertical core opens as its ground floor alone, with no
connectors. The manifest names the layouts it publishes. An irregular outline is read through its
`roomEnvelope`. Intermediate floors share a layout only when their outline, room envelope,
height, doors and program agree. A differing intermediate floor publishes `floor-<index>`;
later floors with that same construction and program can reuse it. This preserves tapered
landmark plates and connection floors without projecting lower rooms outside their shell.
Windows vary per floor by design, and so do opening
IDs and exterior dressing (material, panes, glazing, scenery, section ids). Explicit
assignments always win. Otherwise each floor derives from its blueprint kind, and a kind
that names no program of its own takes the parcel's: a shared plan's `commerce` or
`residential`, the parcel type repeated on every typed floor, and `lobby` or `entry` at
street level. A parcel stands its own program at street level and above it, paired or plain
shell alike:

| Parcel type | Street level | Above |
| --- | --- | --- |
| residential | lobby | apartment or residence_studio, one for the whole building |
| hotel | lobby | hotel_rooms |
| offices, hospital, clinic, police, military | lobby | office |
| corpo | lobby | corpo_office |
| commerce, restaurant, coffee_shop | retail, restaurant, coffee_shop | office |
| mall | mall_floor | mall_floor |
| factory | mechanical | mechanical |

A kind naming its own program keeps it (a hotel's `restaurant` or `bar`, `executive`,
`gym`, a `shop` floor as the parcel's venue). Input objects remain unchanged. Optional `shellGlb` is metadata;
generation consumes the assembled blueprint. No shell, texture or furniture geometry is loaded.

`building.interiorStyle` optionally names a reference identity, independent of shell and
seed, and the building output publishes the resolved one. `h10` and `japantown` are the two
capsule profiles of a mid home or hotel (Japantown on white-grid and mirror-shutters
shells, H10 otherwise, when none is named); `sandra-dorsett` furnishes a mid interior with
its tatami capsule kit; `apartment-1702` turns `apartment` assignments with `spans: 2` into
private duplexes, as it does for a kind `B` building. Any other assignment spans one storey.

## Reference kinds

A building may furnish as one of four reference kinds: `A` a high-tech luxury tower, `B` a
rich glass building with a two-storey crown loft, `C` a poor capsule building and `R` a rich
office. `building.kind` forces one; otherwise [kinds.ts](src/styles/reference/kinds.ts)
derives it from type, tier and architecture: rich and high rich offices and corpo parcels
are `R`; a residential or hotel building whose architecture pairs with a kind that allows
its tier is that kind (`A` mirror-frame, corporate-sectors, white-grid; `B` balcony-grid,
mirror-shutters, faceted-bays; `C` residential-serviced, residential-megablock,
residential-courtyard), and any other architecture follows the tier: high rich `A`, rich
`B`, poor `C`. Mid tiers and a named `interiorStyle` keep their family look. An explicit
kind must allow the building's type and tier (`A`, `B` and `R` rich or high rich, `C` poor
or mid; `A` and `B` homes, hotels, offices and corpo, `C` homes and hotels, `R` offices and
corpo), and `references` must belong to the building's kind; either mismatch is
`E_BLUEPRINT_INVALID`. The manifest publishes the resolved `kind`, and `references` when
the request named them.

A kind building furnishes every home floor as apartments (hotels keep hotel rooms). A kind
`B` home with at least three apartment storeys above the ground and no explicit
assignments pairs its crown with the floor below into an optional loft: the pair converts
every home it can into a two-storey dwelling, as an `apartment-1702` pair does, and a pair
that converts none keeps its two storeys on the shared middle layout and records
`{kind: 'living', requested: [15, 10], fitted: null}` in the upper floor's program.
Explicit single-storey assignments keep every floor single.

### Space templates

Each kind owns space templates, one per reference interior
([data](src/layout/templates/data/)): `e1-apartment`, `e2-floor`, `e5-lobby2`,
`e6-apartment2` (A), `b1-floor`, `b2-suite`, `b3-apartment`, `b4-loft` (B), `c1-capsule`,
`c2-corridors`, `c3-poor`, `c4-bathroom`, `c5-machine`, `c6-studio`, `c7-room` (C) and
`r1-office` (R). `building.references` restricts a building to some of its kind's keys.
A template is a dimensioned local plan: wall lines and the spans between them (rigid
spans keep their reference size, weighted ones grow and shrink within their bounds),
rooms, doors, fixtures and level zones. The planner fits it into the rectangle a floor
allocated: every dwelling with one corridor door, a reference office per facade side of an
office hall, the ground floor's reception, restrooms and plant rooms, and a poor floor's
corridors. The fit keeps the unit's own entrance, seats every partition that meets the
facade on a legal pier (a refined common room's lines are followed out to the outline), and
proves its required fixtures furnish before it is kept; hung pieces stand only on solid
walls. A template that cannot fit leaves the generic unit and records
`{kind: 'living', requested, fitted: null}`, and a floor that fails downstream is planned
again without it, then without templates, so a template never fails a building. Kind
buildings cut their homes to their templates' reference frontage and depth: a rich kind's
floor composes each strip the core leaves whole from one of its dwelling templates at its
own frontage, the next floor from the next (one layout per turn, so a tower holds every
apartment style its reference has), and turns frontage no home takes into a residents'
`lounge` on the corridor (`f<i>-amenity-<n>`); a poor kind's floor cuts its homes to its
templates' frontage and depth. A template keeps its rooms within their authored spans: a
home deeper than its envelope takes the extra depth as a band of `storage` rooms along its
entry wall (`<key>/band-<n>`, a utility, pantry or dressing room opening into the room
beside or behind it) rather than stretching its rooms. A templated home holds the pieces
its template authored and no generic salon, dining set or desk; its foyer and passage
rooms hold nothing else.

Rooms fitted from a template publish `template` (`<key>/<template room>`), `role`,
`ceilingDrop` (the metres the room's reference ceiling hangs below the floor's, never below
the glass head of a facade room) and `levels`. Pieces a template names publish `fit`: an
`asm-<style>-<name>` built-in assembly or a `fit-<module>` exact module. Every room of a
kind building publishes its `style`: its template's, the loft style inside a paired storey,
else the floor policy's private or public default.

### Reference styles

Each style (`e1` … `r1`, [registry](src/styles/reference/registry.ts)) is data for the
parametric systems in [src/styles/systems/](src/styles/systems/types.ts), registered by its
kind ([ref-a](src/styles/ref-a/index.ts), [ref-b](src/styles/ref-b/index.ts),
[ref-c](src/styles/ref-c/index.ts), [ref-r](src/styles/ref-r/index.ts)). The nine-slice rule
becomes the panel system: a wall face is baked columns on the half-metre construction grid,
a stretched top to the head band, fills and bevelled edges where a run is cut, head and foot
bands, and lit joints whose modules and `cove` records share an id, on every fragment of
every run the room owns, lintels and sills included. Stair walls, leftovers, sealed voids
and thresholds wear the style's markers (`wall-field-<sid>`, `floor-slab-<sid>`,
`ceiling-field-<sid>`), each itself a plain fitted piece. Glazing, ceilings (a grid of baked
blocks phased to the building grid or the room centre, steps, coffers, luminous fields and
lenses at the room's own height), floors (tile blocks over one support per rectangle,
borders, inlays and the walk-on glass pit), layered portals and casings, built-in runs, the
embedded kitchen wall, bars, libraries, planters, enclosures, housings and level zones
(raised platforms and sunken pits of nested slabs one riser apart, with steps, guards and a
closed support beneath) follow the same rule: fixed bays and baked pieces repeat, only their
straight spans stretch, and every lens publishes its light record under its own placement
id before the room is balanced.

## Files and frames

`npm run modules -- --out <dir>` writes shared GLBs and `modules.json`, following
[modules.schema.json](schemas/modules.schema.json). Each entry gives `id`, relative
`file`, bounds `size` in XYZ metres, `origin` measured from bounds minimum to the
authored zero, `materialSlots`, triangle count and complete file byte count. GLBs
are indexed, quantized and require `EXT_meshopt_compression`. A slot is
`theme/kind/tier#variant`: the GLB material is named by the key and carries the variant
in `extras.materialVariant`; no texture images travel. UVs are tile units, one unit per
published `tiling.worldSize` repeat, read from the sibling Materials theme when it is
present. The catalog is published once for the city.

`npm run generate -- --request request.json --out <dir>` writes `building.json`
and each declared `layouts/<id>.json`: `ground`, `middle`, `crown`, plus `floor-<index>`
where an intermediate plate or program differs. Consumers load the manifest's entries.
[Building schema](schemas/building.schema.json),
[layout schema](schemas/floor-placement.schema.json), [types](src/placements/types.ts).
The lowest floor uses ground, ordinary intermediate floors use middle, and the highest
uses crown; a two floor building has no middle layout and writes two files. A reachable
roof adds one more floor reference and one `floor-<roof index>` layout of kind `roof` at the
roof elevation: it carries the roof navigation once and no furnished rooms, lift stops or
duplicate placements, and only the roof housing's interior is published as a room
(`stair-a`). Six occupied storeys and a served roof publish seven floor references; count
occupied storeys by the layouts whose kind is not `roof`.
Each layout contains floor metadata, source openings, placements and NPC data.
Layout rooms may carry `style`, `template`, `role`, `ceilingDrop` and `levels`, and
furniture may carry `fit` ([Reference kinds](#reference-kinds)). A level zone is a raised or
sunken polygon of the room in world XZ with its walking `delta` (-0.6 to 1.5 m), an `edge`
(`step`, `guard` or `open`) and an optional stair. A pit's tray hangs below its storey's slab;
a pit deeper than 0.3 m stands only over a room whose `ceilingDrop` leaves its tray room
(the generator lowers that ceiling, or makes the pit shallower). A finished ceiling stands
`ceilingDrop` below the floor's ceiling plane. `bathtub` and `urinal` are furniture kinds; a person uses a
urinal as a toilet, and a bathtub has no anchor. `floor.voids` names building-level open
voids crossing a floor in world XZ, with their floor range and guarded edges; no generated
building publishes one yet.

Placements name exactly one `module` or `prop`, an instance `id`, `room`, XYZ
`position`, positive XYZ `scale` and `rotationY` in radians. Apply scale, then
rotation about positive Y, then position, then the building floor's elevation.
A stretched placement also carries `uvRepeat`, `[u, v]`: multiply the module's own UVs by
it. Absent means `[1, 1]`.
Preserve each GLB node's authored transform, including quantization transforms.
The GLB already contains its authored origin; `origin` is descriptive metadata.
XZ stays in the blueprint frame; layout Y starts at the walking surface.

## The look

A building is furnished in one family: `luxury` for rich and high rich tiers, `corporate`
for corpo and offices parcels at mid, rich and high rich tiers, `capsule` for mid, `damaged`
for poor, `industrial` for factory and military parcels. Each room takes its finish from
the family and its kind ([finish table](src/placements/finish.ts)). `src/styles/` holds each
family's own modules, fits and programs, with a README per style on the reference it adapts:
[luxury](src/styles/luxury/README.md) (with the Corpo Plaza bathroom and the Apartment 1702
loft), [corporate](src/styles/corporate/README.md), [capsule](src/styles/capsule/README.md),
[sandra](src/styles/sandra/README.md), [damaged](src/styles/damaged/README.md) and
[industrial](src/styles/industrial/REFERENCE.md). Their shared GLB recipes are published
once; building layouts retain dynamic room dimensions and exact shell openings.
Freestanding furniture uses the `fit-` module prefix so consumers include it in occupancy
and exclude it from enclosure reflectance. Large wall fields keep sparse joints; service
runs stretch only their straight sections, with brackets and couplings placed at their
authored physical sizes. Family furniture publishes its own dimensions and diffuser
positions. Material UVs use the selected variant's physical repeat when present, then the
entry's repeat; material maps stay shared outside the GLBs.

Lift cars, the car's own front (`lift-car-doors`, `lift-car-head`), moving landing leaves,
stationary landing members and full-height shaft walls are separate modules. A lift shaft is
3.5 m square and holds a 3.3 m car, about 3.07 m clear inside, with a 1.58 m clear doorway.
The Engine owns cab movement and floor selection and reads the car's controls from
`LIFT_CAR`; generated landing reveals and thresholds keep a clear body passage. The car's
leaves, head and sill stand at the car front, scaled across the car only, in the clearance
between the landing's leaves and the car, so the car is closed whenever it travels. Both
pairs of leaves meet at their module's zero with no seam and are wider than their doorway,
each closing behind its jamb or the car's cheek (`LIFT_LANDING`, `LIFT_CAR.door`). The shaft
side of every landing's wall line is closed from inside the landing head to the next floor,
its cheeks stop short of the car's leaves (`LIFT_SHAFT_FRONT`), and the landing's threshold
runs to the car's sill. Internal room apertures retain clear framed passages; they publish no
moving leaves, and an apartment's entrance is the only door that does (below).

Every wall face a room owns is finished by its family, its own face on the shell included;
a room wearing a reference style is finished by its style's systems instead
([Reference styles](#reference-styles)), and the family rules below apply to every other
room. A capsule public room keeps the nine-slice panel frame: one fitted field over the whole run
as the backing, four one-cell corners, a rail along the head and the foot, a stile up each
end, and a lit joint at the top and bottom, published as `cove` light records; each member
is 12 mm short of its cell, so the joints between them show field, and the ivory band
contrasts its charcoal field. Every other face is one fitted field over its run: the luxury
family's broad mineral, ivory and walnut panels with backed reveals and metal skirting, the
corporate family's graphite and mineral panels with warm metal inlays and a red base, the
capsule family's domestic and utility shells, and the plain fields of the damaged and
industrial families. A run shorter than 1.5 m and a door header always take one plain
field. An office, meeting, executive room or lounge looks onto public space through a glass
field.

For paired `balcony-grid`, `corporate-sectors`, `faceted-bays`, `white-grid`,
`mirror-shutters`, `mirror-frame` and `garden-taper` blueprints with a room envelope, Exterior owns
the closed inner facade, window frames and finished returns. Interior keeps those
exact surfaces instead of adding scaled window-return rings or a second wall around
the inset construction rectangle. That rectangle is where the rooms are planned; once the
building is planned, every room, sealed void, shaft and loft void standing on its edge
reaches out to the shell's inner face (its wall depth plus a 25 mm seam), so partitions,
floors and ceilings meet the facade and no band behind it joins the rooms of a floor. A
point of that band belongs to whatever stands where it lands pulled straight back into the
rectangle; a curved or chamfered facade is met by steps on the construction axes that start
and end on its face and carry no wall of their own. Core enclosures retain their walls. The
rule uses each generated blueprint and applies at every supported footprint and floor count.

A room's face on the shell is cut once by the union of every opening carried by any floor
that reuses this layout, the passage its own doors land on included, projected inward onto each facing lining even when a recessed or curved facade
stands metres beyond the room envelope, so one lined run serves floors whose windows sit elsewhere; an angled facade edge
keeps the shell's own face.

Floors are one fitted slab per room rectangle over a dark screed (stone, obsidian, marble
or timber by room). A leftover inside the rectangle the rooms and core stand in, void to
rooms, takes the slab and a plain ceiling field of the room along its longest side, so a
consumer cutting its storey plate by that rectangle finds no hole. Ceilings carry a fitted outer band, an inset field, recessed spot
modules and a cove module on every cove record; damaged and industrial families hang
exposed services instead of a band. Carpets lie under the seating and suite groups a rich
interior fits, in homes, lounges, receptions and the seated bay of a large shop floor; the
luxury family lays woven reference rugs there instead (`floor-rug-corpo` in homes,
`floor-rug-biotechnica` in public rooms).

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
lenses published with their `furniture` id; a piece standing as a catalog prop or an unlit
module publishes none. Furniture kinds with a built-in module (desks, office chairs,
counters, kitchen runs, beds with planted headboards, wardrobes, showers, toilets, basins,
lit planters, planted screens, aquarium walls, screens, art, shelves, stools, chairs,
sofas, tables, capsule pods, crates) are scaled per axis to their record; the rest resolve
catalog props, each turned by its catalog `frontYawDeg` to face its piece's front and
filling at least three fifths of the record's width and depth. The capsule, Sandra and
damaged families stand their own modules for the pieces they author, beds and wardrobes
included (`fit-capsule-bed`, `fit-capsule-wardrobe` or the H10 profile's
`fit-capsule-h10-wardrobe`, `fit-sandra-bed`, `fit-damaged-bed`, `fit-damaged-wardrobe`),
whatever models are present; the luxury and corporate families prefer a present catalog
model and stand their own module otherwise. Programs: a lobby stands its concierge desk at
the arrival, beside the entrance axis, facing the door or, where that would stand it in the
route to the core, the arrival aisle, with waiting bays flanking the entrance and planted
displays against opaque walls, or planters on the floor of a glazed arrival; a restaurant
runs a counter with its back bar and stools, dining tables between planted screens; a home
fits a working kitchen, a bedroom suite with bedside cabinets and a wardrobe, and complete
bathrooms of vanity, shower and toilet, a luxury home the Corpo Plaza vanity; a toilets room
stands its toilets in a row of 0.7 m stalls along one wall, so both are in use at once. A hall
furnishes by its floor area, not by a fixed handful: a shop floor takes its checkout,
shelving along the walls, display aisles across the plate and, past 80 m2, a seated bay on
its carpet, so a 2000 m2 room reads as a shop and not as an empty plate.

Rooms are planned in the floor's published `roomEnvelope`, kept behind `facade.wallDepth`,
defaulting to 0.12 m; a floor without one uses its outline inset by that depth. Once planned,
the rooms reach out across the band between that rectangle and the facade: to the shell's
inner face where the shell closes the facade, to the inner face of Interior's lining where
Interior lines it. Furniture, the vertical core, circulation and the doors between rooms keep
their planned places; a street door moves out to the face with its wall. The band beyond the
face is the exterior's own slab, and an exterior door reaches its room across it, through the part of its span that meets that room's floor. Window returns fit between
adjacent backing planes. Door thresholds join the floor to source passages; a pocket door's passage is its published `door.clearance`, its connection carries `clearDepth` 0 (the leaves retract into the cassette), and the cassette beside it is solid wall.

Construction uses the 0.5 m grid. Measured facade attachments and closing boundaries
retain exact source coordinates. Stair variants have 7 through 14 treads at 0.28 m
authored pitch; generous plates scale their tread to 0.30 m. Their fitted rise
stays between 0.16 and 0.18 m. Plates at least 22 m across each principal axis
first reserve 4.5 m wide stair shafts with 2 m landings and broad end-facing
portals; constrained plots retain the minimum profile. Props scale uniformly.
Stair risers and sloping soffits are closed. The canonical structural flight carries
rounded handrails; tier-specific flush tread/riser caps, glass or solid infill and
wall lighting follow [stair construction](docs/stair-construction.md). Each climb
owns its top landing and bearing, so its upper soffit remains present with the
current flight when the next floor is outside the streamed band. Stairwell walls use a full-depth service finish at
every tier and reach the full storey height. The lowest shaft has a complete finished
floor; landings reach partition lines beneath the wall finish. Shafts without an onward
flight have a ceiling. Arrival landings and doorway thresholds meet without uncovered strips.
Partition casings use separate `door-jamb` and `door-header` modules with fixed
80 mm members; wall cutouts follow their outer bounds to avoid coincident surfaces.
Threshold pieces fill only uncovered floor area. Lift thresholds meet the car floor.
A fitted roof door can face either enclosure axis; its landing and navigation
entry use that face's actual width or depth.
Prop IDs resolve through the existing [catalog](src/assets/catalog.json), whose
`modelUri` is relative to that catalog. Generation names only models the consumer holds:
`models`, default `presentModels()`, the files beside the catalog of the checkout that
runs. A consumer that publishes props from another folder, or runs another checkout, passes
`presentModels(<props folder>/models)` for the folder it publishes. Furniture whose fitting
models are absent wears the next present one or leaves the layout with its anchors, and
`missingModels` lists the absent models it wanted; the CLI prints them as a warning.
Anchors, roles, routines and role IDs follow the furniture that stays, so one seed seats and
staffs a building differently where the models differ. Local-only models come from ignored
licensed sources, so a checkout without them furnishes from the redistributable ones.

`building.modules` and `building.props` identify city resource catalogs, resolved
against the consumer's resource base. Layout file paths resolve beside building.json.
Modules carry their finish keys; prop materials belong to their existing models.

`building.floors[].openings` maps the layout's door IDs to this floor's door IDs, and
`treatments` carries this floor's own window returns and partition caps, built from its own openings (where a partition meets one of its windows, a jamb stands on the partition's line from the glazing's back plane to the partition's end over the glazed height, closing the reveal behind it), and the next shared stair flight's uniquely owned soffits and enclosure finish skins. The upper wall retains an opaque recessed body for downward views; every piece stays within the original structural volume. Exterior door placement and room connection IDs match the blueprint.
Core placements carry `connector` and an actual corridor room ID. `building.corePlacement`
is the stair the building was furnished around, the shape `coreFeasibility` returns for
the same blueprint and building type, so a window measured against the gate stays clear. A second stair is built
only where its flights keep the published headroom. `building.reservationCrossing` names
the exterior opening the core crosses when the plate holds no clear position.
[core-feasibility.json](schemas/core-feasibility.json) publishes the constants Exterior
fits a core with: a 3.5 m `elevatorShaft`, the `generousStair` profile of plates at least
22 m across, and the `stairRoofReserve` kept around stair A for its roof housing.
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
Every stair shaft (`stair-a`, `stair-b`) and lift shaft (`elev-<n>`) a floor serves is
also one of its rooms, of kind `corridor`: the polygon is the shaft, its floor is the real
flights and landings rather than a slab, and the placements, lights and lift-car record
inside it carry its room ID. A stair opens onto the room in front of it through an
`openFront` portal; a lift through a two-leaf connection with `clearDepth` 0.

Apartment and studio floors publish `building.floors[].apartmentEntrances`, per floor:
each dwelling's one numbered entrance, `<floor><position>` such as `101`, where positions
follow the physical bays of the first residential floor and survive room-ID changes
between layouts. Of a dwelling's doors onto public space the one a living room, studio or
bedroom opens onto a corridor or lift lobby is numbered, then the widest; any other stays
an ordinary framed passage. Each record carries two pocket leaves that retract into
carved wall and jamb channels with opaque skins, a concealed overhead runner and end
stops, and a numberplate beside a jamb on an opaque wall face (`fixed`); the
leaves are the Engine's to move and are never static placements. Rich tiers wear timber
and bronze, mid capsule enamel and zinc, poor the damaged kit. An entrance whose cassettes
would leave its wall (a corner, glass, another dwelling or a second opening) is not
carved and publishes no record; one with no opaque wall beside it publishes no plate.
A dwelling with no supported entrance, a floor past the 99th and a bay past the 99th
stay unnumbered, and the building keeps every other entrance. Ground lobbies and internal
doors get no apartment labels.

An `apartment-1702` pair of storeys publishes, in each storey's layout, `floor.duplexes`:
the private slice of every home that becomes one dwelling across both levels, with its
footprint, lounge void, stair opening and entries in world XZ, per
[floor.schema.json](schemas/floor.schema.json). Living, dining, guest bedroom, bathroom,
kitchen and utility stand below; the primary bedroom, bathroom, dressing, linen, study and
a gallery above, joined by the home's own stair. The public core and corridor stay on both
levels, the lower dwelling keeps its number and the upper slice gets none. Only identical
rectangular homes of at least 15 by 10 m that seat their partitions on both storeys
convert; a pair with none keeps its two ordinary apartment storeys.

Layout NPC records use `sourceFloor` and local identities. `expandBuilding` applies
floor identities, opening mappings, elevations and building connectors for Simulation.
Its navigation retains anchors, roles, routines, standing opportunities and floor grids.
Every venue publishes the roles that run it and its guests: a restaurant its host,
waiters, cook and bartender, a coffee shop its barista, a hotel its receptionist and porter,
a shop its vendor, an office its receptionist and guard, each on counter, seat and work
anchors. One body takes each place: a post's spot claims it before a seat, so the chair
pulled up to a desk or set behind a counter publishes no guest seat; only pieces of one
room contend, so a partition never costs a desk its post. A fitted roof retains its navigation access; a housing that cannot take the stair leaves the roof out of the navigation instead of closing the building. Runtime actor dimensions and dynamic
obstructions require consumer agreement in [issues](docs/ISSUES.md).

## Navigation

`dist/nav.js`, built from [src/nav.ts](src/nav.ts), routes over a building's published
`npc.nav` in a browser; it imports nothing outside this box. `findPath({nav, from, to})`
takes endpoints `{floor, x, z}`: nav floor indices, the roof access level included, and
XZ in the nav's frame. It never throws, whatever the input. It returns `{legs, connectors}` or
`{error: {code, message}}`, per [nav-route.schema.json](schemas/nav-route.schema.json).

A leg `{floor, points}` walks one floor from its first point to its last. A connector
`{id, kind, fromFloor, toFloor, from, to}` walks a stair or rides a lift between two entries
of one published connector; consecutive storeys on one connector merge. `legs[i]` ends at
`connectors[i].from` and `connectors[i].to` starts `legs[i + 1]`, so there is one more leg
than connectors. Add the floor's elevation for Y; the flight between stair entries is the
Engine's to animate.

An endpoint off the walkable grid moves to the nearest walkable cell centre within 1 m
(`NAV_SNAP_RADIUS`). Walks are grid A* with line-of-sight smoothing, and floors change
only through connectors. A route minimises walked metres plus 12 per stair storey, or 12
plus 2 per storey for a lift. Grids decode once per nav object, which also caches the walks
between its connector entries, and a malformed nav is named once: pass the same object on
every call for that building and do not mutate it.

| Error code | Meaning |
| --- | --- |
| `E_NAV_INPUT` | The nav does not match `npc.schema.json`, its bitmask is shorter than its grid, or an endpoint is not `{floor, x, z}` |
| `E_NAV_FLOOR` | An endpoint's floor has no navigation grid |
| `E_NAV_OFF_GRID` | An endpoint lies over 1 m from walkable floor |
| `E_NAV_UNREACHABLE` | No walk and connector sequence joins the endpoints |

## Validation and limits

Windows overlap only when both their horizontal and sill to head intervals overlap.
Doorway geometry remains clear up to 2.1 m, or to the head of the shell opening an exterior
connection lands on when that is lower. No two wall fields of a face overlap. Stair flights retain at least 1.2 m clear width and
2.1 m headroom. The shell check measures transformed module vertices and prop bounds.
Identical input and resource catalogs produce identical JSON and module bytes.

A home floor first plans complete homes: living room, bedrooms, kitchen and bathrooms,
each furnished in full (a full-size bed with its bedside pieces, complete kitchen and
bathroom fixtures on their clearances), and frontage no generous home can take holds smaller ones rather than
a shared lounge. A floor whose complete homes cannot all fit steps back to the plain
studio-and-bathroom allocation of its bays, then to that allocation furnished with what
fits, where a unit left without a bed or toilet stays rooms but is not published as a
home. Only a floor that holds no room at any step fails, with its first error.

| Error code | Meaning |
| --- | --- |
| `E_BLUEPRINT_INVALID` | Invalid schema, opening overlap or unsupported construction axes |
| `E_ASSIGNMENT_INVALID` | Incomplete assignments, or several storeys other than an `apartment-1702` pair |
| `E_FLOOR_TOO_SMALL` | Floor cannot hold one room beside its core and circulation |
| `E_UNREACHABLE_SPACE` | Circulation, door, stair or anchor fails clearance; an unreachable room is dropped instead |
| `E_SHELL_BREACH` | Module geometry or prop bounds reach forbidden shell space |

CLI argument and file errors exit nonzero. The modules command takes only `--out`.
Budget tests use Exterior `planAssembly` for a 40 m by 40 m, 6-floor mirror-frame
residence and a 56 m by 56 m, 12-floor corporate-sectors office. Each building's export
stays under 2.5 MB and generates within 30 seconds; the complete shared module kit (about
19 MB, published once per city) stays under 20 MB and exports within 30 seconds. Each
reference kind adds at most 400 KB of modules to the kit (kind A 720 KB for now, its E1
kitchen wall and layered portals), none over 10 k triangles, and a 40 m by 40 m six-floor
kind building is held to 3000 placements and 400 k module triangles per layout; the ratchet
in `tests/reference-budget.test.ts` records where a kind is still above them. Existing prop
geometry and Exterior assets are city resources, outside the building export.

## Dependencies

[Exterior piece kit](../exterior/src/kit/CONTRACT.md) supplies assembled blueprints.
[Assets](src/assets/CONTRACT.md) supplies prop IDs. [Materials](../materials/CONTRACT.md)
publishes the keys the modules wear and their tile sizes. GLB serialization uses glTF
Transform 4 and meshoptimizer 1.1. Tests, proof details and box boundaries are in
[docs/INDEX.md](docs/INDEX.md).
