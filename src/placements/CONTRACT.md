# Placements

Converts distinct planned floors into shared module and catalog prop transforms.

`generate(request, {models}?)` accepts [request](../../schemas/request.schema.json) and returns
[building](../../schemas/building.schema.json) plus its declared
[layouts](../../schemas/floor-placement.schema.json) and `missingModels`. [Types](types.ts) define the
same transport. `writePlacements(result, out)` writes the manifest and its compact layout JSON files.

Generation plans each distinct construction plate and program once; equal intermediate
floors share `middle`, differing plates publish `floor-<index>`, and later equal plates
reuse the same declared layout. Ground and crown retain their own identities. Two occupied floors plan ground and crown,
and a stack with no room for a core plans its ground floor alone. Shared layouts
have identical outline, envelope, height, doors and programs;
the manifest maps the layout's door IDs to each floor's own. Windows vary per floor,
so a shell without authored inner returns publishes its per-floor window returns in
`building.floors[].treatments`. This packet also owns the next shared stair flight's soffits and wall finish skins: the upper floor retains walking surfaces and opaque recessed wall bodies. No repeated exposed faces or expanded collision volumes are introduced; private duplex stairs stay local. Paired architecture shells own their finished facade.

A reachable roof adds one `floor-<roof index>` layout and manifest floor, with kind
`roof`, at the roof elevation. It carries the roof navigation grid once and no furnished
rooms, elevator stops or duplicate placements. Exterior owns the outdoor surface and
enclosure; crown retains the final flight, landing and guard and its `roofAccess`
descriptor. Only the actual roof bulkhead interior publishes an enclosed circulation room;
the remaining roof stays outdoors. No extra slab, furnishing or NPC anchor is added.
The separate roof band allows the existing door consumer to wait for a real
loaded floor before opening the roof door. Thus six occupied storeys plus a served roof
publish seven floor references. A building with no reachable roof adds none.

The building's [family](finish.ts) (luxury, capsule, damaged, industrial) and each room's
kind pick its modules. [Walls](walls.ts) build one face per room on every run it owns,
its own face on the construction plate boundary included: a nine-slice frame (one fitted
field over the whole run as the backing, four one-cell corners, a rail at the head and the
foot, a stile at each end, a lit joint top and bottom published as a `cove` record) where
the run is at least 1.5 m long and high, a plain fitted field otherwise, a glass field
where an office room looks onto public space, and a door frame in every interior hole. A
line's holes are cut as one union ([wallCuts](../geometry/walls.ts)): overlapping holes
take one head and one sill, never a field across another opening, and casings that would
touch frame one opening. A boundary run is cut by the openings of every floor that reuses
the layout and the shell passages its doors land on; the shell's own openings keep their
frame and return. An exterior connection's head is its shell passage's. [Surfaces](surfaces.ts) lay one slab per room
rectangle, carpets under fitted groups, and ceilings with a fitted band, an inset field
and the family's services; a leftover inside the rectangle the rooms and core stand in takes
its neighbour's slab and a plain ceiling field. Each room-plan light stands as its module: spot, strip or cove,
and [balanceIllumination](../layout/lighting.ts) sets what each delivers so the room lands
in its kind's lux band.
Furniture with a built-in module scales per axis to its record, from the authored size
nearest it where the module has several (`nearestSize`: tables, the luxury low table, the
bar counter, the wall screen); other furniture
references existing catalog IDs at one uniform scale, turned by the model's `frontYawDeg`,
then the family's own bed or wardrobe where no present model fills the record, and
furnishings fitting none produce no prop or furniture anchor. Only a lit module keeps its
furniture light records, before the room's luminaires are balanced. Only models in `models` (default: the files present
beside the catalog) are placed, so furniture with no present model leaves with its anchors;
`missingModels` lists the absent ones furniture wanted.

A room wearing a registered reference style ([registry](../styles/reference/registry.ts))
is finished through the style instead of its family: `style.finish` names the marker ids
its walls, floor and ceiling route to (`wall-field-<sid>` to a `PanelSystem`,
`floor-slab-<sid>` to a `FloorSystem`, `ceiling-field-<sid>` to a `CeilingSystem`), and its
casing, portal and glazing ids; the architecture palette never overwrites it. Walls place
the panel system on every fragment of the room's runs (a common room's `frontage` system on
runs it shares with a dwelling, the plain marker on stair runs), glazing where the system
names both rooms, and one layered portal where both sides name it and its headroom holds.
Floors lay the floor system per rectangle with level zones cut out and raised on a closed
support; ceilings hang at the room's `ceilingDrop`, never below the highest opening head
of a room at the plate edge, and planned lights follow the drop. A piece whose `fit` names a
registered `asm-*` assembly is built as that assembly, whose lens records replace the
plan's for that piece; a `fit-*` piece, or one the style fits, stands as that module at its
canonical size. Each style's dress pass and housings run before the room lights are
balanced, so every lens record counts. A style may also name its lift surround and
apartment entrance kit.

Transforms apply positive XYZ scale, radians about positive Y, position, then floor
elevation. A stretched placement publishes `uvRepeat`, the factor its module's tile-unit
UVs multiply by, so a fitted piece never stretches its map past the material's own size. No geometry is serialized here. Temporary transformed vertices prove shell,
door and stair clearance. Prop bounds participate in those checks.
The last landing of each stair, including a served roof, guards the absent ascending
flight's half of its edge. The descending lane and full 1.2 m turning depth stay clear;
ground-level shafts with no flight need no guard.

Walls, surfaces, window returns and prop bounds stay inside the floor's `roomEnvelope`,
or, without one, inside `facade.wallDepth`, default 0.12 m. The band out to the outline
is open floor over the exterior slab: no partition, no surface, walkable for navigation.
Window return width includes its jambs at adjacent backing planes. Source openings
retain their dimensions. Exterior thresholds join the actual placed room floor to the passage,
which for a pocket door is its full published clearance behind the cassette back plane.
The room envelope may stand farther inside than the facade backing; thresholds bridge that
complete distance, split at stepped floor edges, and never overlay an existing room slab.
Generated Exterior shells recess the corresponding structural support by the 20 mm finish
thickness, keeping the finished passage flush without coplanar shell and tile faces.
`building.floors[].program` records reduced services as requested and fitted width
and depth, or null for omission. Repeated floors carry their source layout's changes.

`expandBuilding(result)` returns absolute [floor](../../schemas/floor.schema.json)
and [NPC](../../schemas/npc.schema.json) data with distinct floor identities and
building connectors. Layout source identities remain unchanged on disk.

Errors: `E_BLUEPRINT_INVALID`, `E_ASSIGNMENT_INVALID`, `E_FLOOR_TOO_SMALL`,
`E_UNREACHABLE_SPACE`, `E_SHELL_BREACH`. Inputs remain unchanged. Equivalent inputs
produce byte identical output.

Depends on [Blueprint](../blueprint/CONTRACT.md), [Layout](../layout/CONTRACT.md),
[Geometry](../geometry/CONTRACT.md), [Modules](../modules/CONTRACT.md),
[Assets](../assets/CONTRACT.md) and [NPC](../npc/CONTRACT.md).

Apartment and studio floors in every tier publish optional `building.floors[].apartmentEntrances`.
These are per-floor numbered private boundaries, never static placement rows or Exterior
openings. Physical bay positions survive generated room-ID changes between layouts. Two
pocket leaves translate into actual carved wall/jamb channels with opaque skins, concealed
runners and end stops. Mid uses capsule enamel/zinc, poor uses the damaged kit, and rich
uses timber/bronze. Each cassette needs half the clear opening width plus 90 mm beside its
jamb; an entrance whose chamber would cross an opening, corner or another unit is left
uncarved and unpublished, a framed passage, and the floor keeps its other entrances.
Numberplate fitting follows cavity construction and requires its whole footprint on an
opaque face; with none on either side the entrance keeps its number and stands no plate.
Ground lobbies and internal bathroom/kitchen/bedroom connections get no apartment labels.

A stair climb owns its top arrival landing and recessed bearing under the next
outgoing tread. The receiving floor omits the duplicate base slab and passes that
linked support to threshold generation. The roof threshold adds only its extension.
Tier-specific tread caps remain flush with the canonical tread height; segmented
guard infill keeps collision aligned without introducing a full-height invisible
box under the flight. See [construction profiles](../../docs/stair-construction.md).
