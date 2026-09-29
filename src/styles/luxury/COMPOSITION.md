# Luxury room composition

These are proposed metre-scale arrangements, not dimensions claimed to have been
measured from the game.

Public lounges follow the Biotechnica public floor: low pale seating in an L,
a substantial planted enclosure, dark low table, a quiet rug and a separate
reading function. The reception counter has a 3.8 × 1.0 m working body and a
real staff chair behind it. Its position is scored against the entrance so
large concave lobbies do not hide the counter in a distant rear arm.

Private living rooms follow the Corpo Plaza apartment: media joinery faces the
sofa, with a low table, side chair and planted screen. A smaller linear version
keeps the full sofa, table, screen and credenza while omitting the optional
chair and divider. Screens must have an
actual opaque room wall behind them; the rectangle enclosing a concave room
and facade glazing are not mounting surfaces. Dining uses a complete table and
four-chair group, or a proper two-seat arrangement where the larger group
cannot fit around the required routes. Bedrooms use the full 2 × 2.3 m bed and two real bedside
cabinet reservations; compact suites keep the same furniture dimensions and
fit a shorter clear approach envelope. A bedroom too tight for either keeps the
fitted suite group, then a bed on its own, at full size; a home still needs its bed.

`composition.ts` fits these relationships to the current room polygons and
holes at every quarter turn. The shared placer checks real wall/facade depth,
door approaches, existing furniture and the published public circulation
reservations. Empty approach space may overlap another walking route, while
solid furniture may not. Each accepted group reserves its remaining useful
approach area before the next function is fitted. Rectangular 40/60 m plates,
concave reception arms and revised private footprints use the same algorithm.

A home without a living-room meal place tries a real two-seat breakfast
arrangement in its kitchen before adding an optional pantry. The cooker and
fridge retain 0.9 m and 0.8 m operating areas, respectively. Body-sized paths
to the doorway, fridge and both worktop stations are verified before the table
is accepted. Every generous home's kitchen reserves those operating areas
and proven paths before optional storage, including homes that already have
living-room dining. Furniture dimensions and door clearances stay intact.

`luxury-composition.test.ts` checks full-size bedroom furniture at multiple
dimensions and orientations, opaque support behind media walls, complete
public seating/reading functions, staff positions and physical non-overlap.
`public-furnishing-clearance.test.ts` independently measures continuous
furniture separation from the actual exterior-to-interior walking routes.
