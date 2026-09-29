# Basic residential / capsule

The reference family is the V H10 and Japantown apartments: the H10 lounge, its
amber wet room and slotted service headboard, and the Japantown nested sleeping
niche, utility kitchen and wall-mounted ceramic basin with its exposed trap. These
are visual references, not measured dimensions.

`capsuleRoomFinish` supplies broad ivory domestic surfaces, charcoal shared areas,
amber utility rooms and restrained dark hex flooring. The 0.5 m construction cell
does not introduce 0.5 m visible seams. `capsuleRecipes` authors furniture in
metres with continuously shaded manufactured casings, crowned fabric cushions,
sewn edges, rounded metal plumbing, open shelving, recessed hardware and a real
pressed kitchen basin. The cabinet is hollow below the basin; the countertop
closes exactly around its rounded rim. `CAPSULE_FURNITURE` resolves domestic furniture without depending
on optional external models.

Room planning, door reservations, facade cuts, stairs and lifts remain owned by
their shared generators. Furniture never changes those reservations. Bed niches
fit the existing 2.5 × 1.5 m furniture reservation; this does not set apartment
area. The actual unit size follows the shared generous residential planning
rules. The sunken lounge of the reference is adapted as level furniture so it introduces
no unplanned floor opening or step in a circulation route.

Every custom furniture mesh fits its declared width, depth and height, including
handles and trim. The custom sofa and chair use the existing consumer's 0.49 m
seat support default; the bench and office chair reuse existing known modules.
Wall shelves retain the consumer's `wall-shelf-` prefix. Furniture lights align
with the shared fixture origins. Freestanding furniture retains the `fit-`
prefix required by the unchanged consumer's occupancy classification.
Materials use explicit published variants;
the molded enamel and hex floor are supplied by Materials.

`tests/capsule-style.test.ts` covers bounds, materials and module references, seat
contact by raycast, smooth surface normals, open sink cavities and worktop joins,
and 40/60 m residential fixtures without
external props. Full-building circulation and the exterior remain subject to the
shared integration checks.

## Utility construction

The molded utility family keeps its practical skin/carcass construction and avoids
timber, marble and ornamental furniture from the luxury family. Only low-level
surface primitives are reused from the smooth model helpers.

The exposed-trap basin is authored with its rim at 0.85 m and its tap within a
1.05 m complete reservation. The shower reserves 1.3 × 1.1 m and 2.2 m height.
Parent integration applies `CAPSULE_SIZES` from `profile.ts` to capsule
`RoomPlacer` dimensions so these fixtures remain scale 1. `CAPSULE_SHOWER_PARTS`
from `shower.ts` must be placed individually, using the same component branch as
the existing luxury shower. `fit-capsule-shower` is a combined catalog preview,
not a valid placed collider. Real unchanged Engine physics tests cover walking
into/out of the component assembly and standing inside it at four rotations.
The shared compact-fixture allocator fits complete kitchens and bathrooms; a room
too tight for the complete recipe keeps the fixtures that fit their own clearances.

## Distinct residential identities

`building.interiorStyle` selects `h10`, `japantown` or the separately authored
`sandra-dorsett` collection. The selection persists through seed and exterior
changes. The parent publisher records the resolved identity in the building
manifest. The broad capsule family still owns compatible planning interfaces.

H10 has an open wardrobe behind a continuous rounded fascia and a sleeping niche
with a recessed service headboard. Japantown has a sliding wardrobe front,
separate overhead cupboards, side-mounted niche shelving, a large rear display,
and a wraparound petrol enamel liner. Its kitchen includes a vented hood,
250 mm square-tile backing, side returns and a modeled task light. Its complete
height is 2.35 m while the counter stays at its authored height. All pieces fit
their declared reservations; the shaped surrounds have closed depth returns.

Geometry uses stable metre-scale corner radii and continuously shaded rolled
profiles. Curved seating preserves the existing 0.49 m seated contact height.

`layout.ts` targets approximately 75 m² dwellings on legal facade seats across
all four orientations, with wet functions near services, daylight bedrooms and
a connected public approach. It validates candidate partition seats before
publication and retains the shared core and facade reservations. Area targets
are planning choices, not measurements of the reference.
Continuous glass bays of 17–20 m, as on the white-grid facade, lack the structural
partition seats required for ordinary 75 m² homes; no private wall is invented
through that glazing to make the numbers fit. A floor whose complete homes cannot
all be fitted falls back to the plain studio allocation.

Sandra's independent lattice, joinery and seating assets, with their own
architecture, fixtures and reference notes, live in `../sandra/`.
