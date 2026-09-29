# Worn residential style

The design follows the dystopic residential tier, the William Hare building and the
Jig-Jig Street hotel room. William Hare supplies public circulation evidence, not an
invented private apartment. Jig-Jig supplies furniture depth and recesses; its purple,
animal and themed graphics are explicitly excluded.

Public spaces have broad mineral walls with a separately mounted washable petrol dado.
The dado starts from the floor, so paint never restarts above a door or a window.
Bathrooms get glazed tile; private ceilings remain plain. Visible service pipes run
beneath the ceiling only where there is adequate headroom, with fixed-size coupling
rings and hangers. Geometry follows the emitted solid wall spans and ceiling rectangles.

The ground floor uses the existing clearance-aware reception plan: caretaker counter,
resident mail bank, plain seating, noticeboard and community storage. New built-in
kitchens, refrigerators, seating, tables and storage keep residences furnished when
optional downloaded assets are unavailable. Furniture keeps the planner's dimensions.
The public/core route stays owned by the shared room planner.

Runtime conventions are deliberate: freestanding modules start `fit-` for occupancy;
wall fittings start `wall-shelf-`/`wall-art-`; structural finishes keep wall/floor prefixes.
New chairs/sofas have a centered 0.49m seat for the unchanged NPC runtime. Benches and
stools retain the existing canonical models whose support heights the runtime knows.

## Detailed models

Beds have actual tubular frames, welted mattresses, sewn closed blankets and
separate pillows, after the Jig-Jig rail bed with its padded back. Seats have crowned
upholstery, soft seams and rolled metal frames. The kitchen has a pressed open bowl,
a continuous worktop fitted to its rounded opening, recessed cabinet doors and
separate controls. The ground caretaker desk has a drawer pedestal, staff approach,
writing surface and folded-metal privacy panel.

Gunmetal/umber maps use 0.5 m repeats; fine stainless uses the existing
`interior-alloy/rich#satin-fine` 0.1 m repeat. Countertops close around their
openings and no cabinet partition crosses a sink. Principal models use 3,072–14,380
triangles and are shared across placements. `damaged-models.test.ts` checks real bowl
openings, seat planes, mesh normals, materials and real PlayerBody shower walking at
four rotations. The shower publishes separate bounded components so its interior
is usable; the combined module exists only for catalog preview.

## Complete dwellings

The source architecture owns windows, structural facade depth, repeated bands and
taper. Courtyard shared halls use petrol; `damagedArchitectureFinish` selects
gunmetal dado for the denser megablock.

A thin gap beside a stair must not enlarge an entire adjacent home and move a distant
partition off its structural facade pier. `absorbDamagedSlivers` closes only the
actual overlapping span of the gap and preserves the original dwelling boundaries.

`layout.ts` uses the shared facade-aware standard-home packer with a separate worn
dwelling programme. Approximately 75 m² homes retain a bedroom, bathroom and kitchen
with direct living-room access. A legal internal facade pier permits a partial-width
daylight bedroom and useful adjacent living bay; full-width bedrooms remain an option
where a complete living composition still fits. The helper checks actual internal
door positions, clear passages and a full-size sofa/table/media group before accepting
an envelope. Models are not shrunk to rescue failed layouts. All rotations preserve
the same private room and doorway relationships. A floor where no complete worn home
fits falls back to the plain studio allocation rather than failing the building.

Shared integration assembles `DAMAGED_SHOWER_PARTS` and `CAPSULE_SHOWER_PARTS`
through the existing bounded shower path, preserving the furniture identity on the tray.
The architecture dispatcher also selects `damagedArchitectureFinish`. Corporate and
luxury furniture hooks remain intact.

The shared numbered private-door producer applies `damagedApartmentEntrances` with
two sliding leaves, 1.2 m clear entrances and real wall cassettes. The first residential
floor establishes consecutive numbers; setback homes retain their corresponding bay
numbers. Roof doors retain the mechanism required by their access assembly.

## Connected services and architecture-specific rooms

Public circulation evidence (William Hare, Clouds, Judy's stairwell and the No-Tell
motel) is kept distinct from the private Jig-Jig room evidence.

Public infrastructure has two differently sized smooth trunks, an open cable
carrier, separate fixed-size rungs, suspension frames and coupling rings. Each
meter bank receives a real overhead branch, curved elbow, clipped wall feed and
branching top manifold; its lower conduits continue to the floor. Doors sit inside
rolled cabinet reveals with separate registers, labels, latches, bolts and a
service loop. The feed must fit within the same room's ceiling rectangle, so it
cannot shortcut through a stair/core void. Only straight lengths scale: clips,
collars, pipe radii, bends and tray rungs retain their authored dimensions.

The courtyard retains its mineral residential fields and painted shared dado.
The megablock's private rooms use Jig-Jig-derived molded umber fields, independently
swept rolled skirting, sparse panel joints at spans of up to 3 m, and fixed-size
vented headers. This is a geometry/profile distinction, not a color-only swap.
The continuous neutral polymer finish has no source graphics, purple or animal
motifs. Wet rooms remain separate glazed surfaces.

Rotation tests check branch/elbow/riser continuity at four orientations and preserve
overhead clearance; the real PlayerBody shower walking tests also pass at four
rotations.
