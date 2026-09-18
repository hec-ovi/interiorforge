# Blueprint

Validates consumed blueprints and supplies standalone samples.

`validateRequest(unknown)` returns [InteriorRequest](../../schemas/request.schema.json).
`resolveAssignments(request)` returns [floor assignments](../../schemas/request.schema.json).
`makePlacementFixture(options)` returns a rectangular request with three repeatable
bands. `makeFixture(options)` returns a request and sample shell for feasibility tools.
[Fixture options](fixture.ts) define dimensions, seed, type, tier and supplied blueprint.

[Consumed blueprint](../../schemas/blueprint.schema.json) validation checks contiguous
indices, elevations, winding, opening bounds, glazing and pocket door envelopes.
Openings overlap only when their horizontal and vertical intervals both overlap.
Disjoint sill to head intervals permit stacked windows. Pocket chambers must remain
inside the cassette and clear of the passage and other openings. Open fronts start
at ground elevation. Assignments cover each floor exactly once.

Errors are `E_BLUEPRINT_INVALID` and `E_ASSIGNMENT_INVALID`. Placement generation
further requires one storey assignments and compatible repeated middle geometry.
Depends on [Core](../core/CONTRACT.md) and [GLB](../glb/CONTRACT.md).
