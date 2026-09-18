# Luxury furnishing

Fits complete furniture groups inside reserved room space.

`fitLuxuryGroup` takes [GroupFit](schema.ts): room bounds, seeded order and a clearance
predicate. It returns [FittedGroup](schema.ts) or null. [Recipes](recipes.json) define
salon, seating, kitchen and suite groups with their approach space.

Quarter turns and 0.5 m placement steps retain authored sizes. The complete reservation
must pass clearance before any group member is accepted. Layout applies groups to rich
and high rich rooms. Placements resolves fitted members against catalog props.
Depends on [Layout](../CONTRACT.md).
