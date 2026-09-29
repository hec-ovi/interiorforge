# Compact home fixtures

Bathrooms and kitchens in capsule and damaged homes use `compact-fixtures.ts`.
The fixtures retain their published dimensions, including the capsule shower's
1.30 × 1.10 m footprint. The planner commits the complete group atomically.

The recorded failures had two causes:

- Small bathrooms placed the toilet and sink greedily before trying the shower.
  All eleven recorded 2.5 × 3 m poor bathrooms fit complete groups with the exact
  original room, doors, facade keepouts and circulation reservations retained.
- Short-wall placement sampled a seeded offset and 0.25 m increments. It could
  miss the only valid kitchen-run interval, leaving just a fridge. The complete
  planner always considers both exact ends and the middle, then 0.10 m samples.

Compact fixture rooms reserve arrival at their real doorway approach. Their
geometric centre is not an independent destination that must stay empty. This
is enabled only for capsule/damaged families in `plan-floor.ts`; rich and
corporate circulation targets keep their existing behavior.

The helper reserves fronts and verifies a connected 0.68 m body path from the
door approach to each fixture. Kitchen checks use both actual sink/cooktop
stations, so an unused counter end may adjoin the fridge without declaring the
entire long worktop frontage to be an empty aisle. A studio's already placed bed
is a physical obstacle during this path search. Operations and paths are then
reserved against later furniture. Studios now also request their fridge.

Room edges and the supplied construction envelope are the physical limits. The
helper does not add a second facade-depth offset to an edge already clipped to
that envelope. Wall-mounted decoration ownership remains with the existing
`wallPiece` checks; this does not re-enable mounts on virtual envelope edges.

No room allocation growth, fixture downscaling, removed keepouts or engine
collision exceptions are used. The search stops after 4,000 complete arrangements
have failed their body-path check: a room with no legal arrangement reports that
nothing fits instead of trying every combination of 0.10 m offsets, and the room
then keeps the fixtures that fit their own clearances. The recorded-room tests
(`tests/fixture-data/compact-failures.json`) preserve all fifteen original failure
cases. Real Engine `floorBoxes` and `PlayerBody` tests walk from a doorway
to every bathroom and kitchen use position and back.
