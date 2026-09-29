# Sandra Dorsett residential identity

The reference is Sandra Dorsett's own apartment, not the rescue/scavenger
apartment. No confirmed exterior pairing is documented; the 40/60 m sets are
compatible authoring candidates rather than claims about the original building.

It supplies a timber lattice vestibule with a cream bench and bordered mats; a deep
open bookcase and glazed storage framing a portal; low cream seating, a dark table,
timber screens and a technical kitchen; a conventional bed, curved writing desk and
alternating woven fields; overlapping pale wardrobe fronts with a red recess,
shelves and hanging rod; technical cabinetry with a recessed toe zone and angular
sink; and a dark vanity with pale/dark vertical fields and woodgrain backing.

The newly modeled identity comes from thin joinery, multiple screen planes, open storage,
cream upholstery and dark low furniture. These models do not add a molded sleeping
capsule, orange utility shell or monumental stone furniture. Models use existing canonical
metre-scale materials without external asset dependencies.

## Integration

`index.ts` exports `sandraRecipes`, `sandraFurnitureFor(kind)` and
`sandraRoomFinish(room, floorKind, base?)`. Root owns recipe registration and the
`building.interiorStyle === 'sandra-dorsett'` selectors. Unmapped furniture kinds
retain the existing functional kitchen and bathroom modules. Do not put new static
door leaves into the plan: the shared numbered-apartment door system owns those.

All mapped furniture keeps the existing mid-tier footprint and height. New seats
meet the unchanged consumer's 0.49 m support surface. The double bed is a conventional
1.6 × 2.1 m platform; the independently authored single is 1 × 2.05 m. Both keep
the current 0.55 m height reservation and real leg/pillow sizes. Their divided head rail
is deliberately low. A taller wall headboard needs a separately reserved wall
fixture, rather than secretly exceeding that geometry envelope.

The planner must choose a conventional bed for Sandra instead of `sleeping_pod`.
Mapping a 2.5 × 1.5 m pod reservation onto the conventional bed would distort its
geometry and its sleeping position. `sandraFurnitureFor('sleeping_pod')` therefore
returns undefined; it is not a substitute for that planner choice.

`sets.ts` publishes separate 40 × 40 m serviced and 60 × 40 m paired-rounded
request helpers. Both explicitly request Sandra's interior identity and a 0.5 m
construction grid, with six occupied floors plus the roof and approximately 75 m²
units on the repeated floors. Beds keep their full geometry; a bedroom that cannot
hold one is resolved by the shared floor fallback, never by shrinking the bed.

## Geometry checks

`tests/sandra-style.test.ts` checks complete mesh bounds, material/catalog keys,
the actual depth separation of lattice and infill, open wardrobe recesses, desk
knee clearance/front cutout and real seat contact. These are geometry checks;
full-building circulation is covered by the shared integration tests. Its
controlled H10/Sandra generation test requires a conventional bed in every bedroom.

Frosted infill uses `sandra-frosted-glass/mid#infill` at 1 m repeat, with rough
transmitted light through the deep lattice. The floor uses the published
`sandra-tatami/mid#bordered` at 1.8 × 1.8 m repeat: two 0.9 × 1.8 m tan mats,
with fine directional rush texture and charcoal bindings. These are authored
dimensions, not measurements extracted from the reference. Metric UV repeats
retain that size on long room slabs; there is no modeled border that expands
with a room's scale. The separate `#woven` detail variant repeats at 0.45 m.
