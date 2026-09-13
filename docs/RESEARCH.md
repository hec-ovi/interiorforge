# Dimensions and materials

[Layout constants](../src/layout/constants.ts) define the current construction grid,
corridor, door, stair, lift and room dimensions. [Core feasibility](../schemas/core-feasibility.json)
publishes the current arithmetic consumed by other boxes.

These are generator settings, not a building-code certificate. Product dimensions and
actor envelopes require the agreements in [ISSUES.md](ISSUES.md).

[Panel palettes](../src/geometry/panels/palettes.json) select surface keys and pitches.
[Material bindings](../src/geometry/materials.ts) select variants; the configured
Materials catalog supplies their physical scale and PBR maps.
