# Corporate office reference fit-out

This package serves `corpo` and `offices` at mid, rich and high-rich tiers. Poor
offices retain the damaged family. Existing desk/chair catalogs, glazed office
partitions, meeting-room allocations and mechanical-floor programmes remain in
use. Executive desks have their own modeled assembly; ordinary workstations keep
the reviewed catalog desks.

## Reference evidence and limits

The Gutierrez office sequence establishes projecting drawer rails, pale inset
fronts, occupied binder rows, a fixed low blue bench, a veined desktop with a fine
warm edge, broad smooth dark panels, gold joints, a low red course, continuous
timber ceiling and framed artwork below a picture-light hood. It documents one
office, not an entire office tower.

The Biotechnica public spaces supply the public contrast: dark ceiling fields,
luminous square panels, clear circulation and glazed planted cases. The reception,
open office and boardroom programmes are explicit adaptations of this evidence,
not reconstructions of a photographed building.

## Models, placement and materials

`library.ts` authors separate stepped timber carcasses, projecting drawer rails,
recessed grips and inset pale faces. Private libraries retain occupied upper
shelves: bound covers, paper blocks, label pockets, finger rings and stacked
folders are separate geometry. `seating.ts` supplies a fixed navy upholstered
bench with its support at the unchanged consumer's 0.49 m sitting datum.
`desk.ts` gives the executive a dark veined top, warm metal edge, recessed visitor
face, modest drawer pedestal and open knee bay. `executive.ts` uses the shared
atomic workstation fitter for a freestanding desk beside the arrival line;
ordinary catalog desks remain available as the existing fallback.

`reception.ts` locates the staff counter and waiting pockets from the actual
exterior entrance, rather than choosing a remote perimeter corner. The lower
transaction surface, staff chair and route to the core remain fitted through
shared clearance checks. A planted display is requested only where its full
3 × .75 × 2.7 m reservation fits. It reuses the existing Biotechnica botanical
assembly, with lights recorded on the assembly's actual lenses.

`materials.ts` binds published continuous walnut/smoked veneer, smooth ink
lacquer, dark polished stone, fine alloy, navy upholstery and subdued rug fields.
No flooring plank image is used on cabinet faces. The executive walking finish is
continuous walnut, not a claim of individual planks inferred from its bitmap.
`walls.ts` adds 3 mm vertical warm-metal inlays at broad-panel intervals and a
25 mm red base; short door headers are excluded. Public ceilings use dark fields
and square diffusers; workrooms retain pale service ceilings. Warm lamp records
and separately modeled lenses remain consistent.

Private offices receive the original teal/copper artwork, while common spaces
retain a readable directory. The image itself is opaque, matte and non-emissive;
the 1.28 × .64 m image plane preserves its native 2:1 aspect. Frame and lamp hood
are geometry. Materials publishes the painting as
`cyberpunk/gutierrez-art/rich#teal-copper`, an original generated image rather than
a cropped game texture.

## Paired buildings

The three pairs in `fixtures/corporate/` are sectors 56 × 40 m / twelve storeys,
white-grid 40 × 40 m / eight storeys, and mirror-frame 64 × 40 m / eight storeys.
Each Interior programme consumes its generated Exterior blueprint.

`tests/corporate-style.test.ts` covers programme preservation, object bounds,
normal/UV validity, physical fixture records, material resolution, the exact art
surface, wall trim around door headers and core-to-work/counter navigation in all
three real paired shells, and that a diffuser's emitting face is not hidden behind
its metal frame.
