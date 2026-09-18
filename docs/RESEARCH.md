# Dimensions and materials

[Layout constants](../src/layout/constants.ts) define the construction grid,
corridor, door, stair, lift and room dimensions. [Core feasibility](../schemas/core-feasibility.json)
publishes the arithmetic consumed by other boxes.

These are generator settings. Product dimensions and actor envelopes require the
agreements in [ISSUES.md](ISSUES.md).

[Module recipes](../src/modules/recipes.ts) define shared geometry and material slots.
The configured Materials catalog supplies physical scale and PBR maps.
