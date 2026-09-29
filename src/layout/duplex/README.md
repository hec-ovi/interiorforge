# Apartment 1702 duplex producer

This directory is wired into public `generate` for the explicit
`building.interiorStyle: 'apartment-1702'` and `apartment` assignments with
`spans: 2`. The real 40 m and rotated 60 m producer outputs are checked against the
exported shell with the Engine player body.

`section.ts` accounts for a canonical 15 × 10 m private allocation: 150 m²
downstairs, 100 m² upstairs, a real 38 m² lounge opening and a separate 12 m²
stair opening. Its two-flight stair has native 0.30 m treads and actual private
entry/arrival landings. The canonical opening supports 3.0–3.6 m storey pitches.
A 4.5 m pitch explicitly requires a larger opening/allocation; it is never
squeezed into the diagram's unproved 3 × 4 m box.

`program.ts` creates one dwelling across both levels. Below are living/dining,
guest bedroom, bathroom, kitchen and utility storage. Above are primary bedroom,
bathroom, dressing, linen, study and a private gallery. The two metre approaches
beside the stair and the 1.6 m lower entrance are actual allocated space. The
upper floor has no independent public entrance or independent apartment number.

`furnish.ts` fits complete native-size groups and fixtures. It refuses homes
without their bed or toilet. Dressing and linen have wardrobe joinery, rather than service crates.
`routes.ts` additionally checks every private room and essential fixture front
with a 0.68 m body. Optional kitchen islands cannot consume primary worktop and
appliance approaches. Particular facade mounting and appearance still require
the rendered multi-view check.

`capability.ts` is an unfurnished structural specimen using existing published
modules. `tests/duplex-capability.test.ts` imports the Engine and checks
real `PlayerBody` ascent/descent, rotated geometry, and `StoreyPlates` removal of
the original shell plate over the private holes. It does not call the older
whole-floor `mezzanineOf` path, which removes global stops and is unsuitable for
private duplexes beside a common corridor.

The reference is Apartment 1702: its living void, lower stair approach, gallery
fascia/soffit and the reverse upper-bedroom/gallery connection. Room dimensions are
proposals, not measurements of the game. Its twin-basin vanity is
`styles/luxury/loft-bathroom.ts` (`LOFT_VANITY_FIT`, 2.2 × 0.6 m by 0.9 m high),
separate from the Corpo trough.

`apply.ts` converts only identical, rectangular private allocations that pass
facade-seat checks on both storeys. Other homes and the public core/corridor
remain on both levels. `placements/duplex.ts` emits private structure, cuts lower
ceilings and protects upper voids from residual-slab repair; only actual void
boundary walls become guarded open edges. Each private stair connects its own
pair. The entrance publisher excludes only upper duplex unit IDs, retaining the
lower dwelling's number and every ordinary home on that upper storey. A requested
pair with no legal complete allocation keeps its two ordinary apartment storeys and
publishes no `floor.duplexes` entry for them: the building is never lost to the
request, and no ordinary floor is labelled a duplex.

Actual shell dimensions remain authoritative. The 40 m balcony-grid sample has
195+142 m² and 221+168 m² private pairs at a 4.5 m pitch. Its comfortable stair
opening grows to 15 m², while the lounge void remains 38 m². Those are reported
as 337/389 m² homes, not labeled 250 m² homes. The 15×10 / 250 m² figure belongs
to the canonical section specimen.

`styles/luxury/loft-finish.ts` dresses only real duplex units: fixed-pitch timber
ceiling boards and fluted wall bays, dark stair undersides, real inlaid gallery
fascias, red living rugs, and disjoint timber seating insets within a pale
circulation floor over a continuous support. Wall coves are attached only to
opaque living/gallery walls with a real adjacent ceiling. They do not float through
the double-height opening; bedrooms retain their warm task lights. The upper air
wall closes through the floor/ceiling seam. The source's long straight stair and
bar below remain a known compositional difference from this compact switchback
adaptation.
