# CONTRACT: blueprint

Purpose: guards the box input (schema and semantic validation of an InteriorRequest, shell consistency) and fabricates a deterministic fixture shell so the repo runs standalone with no exterior layer present.

## In / Out

- `validate.ts`
  - `validateRequest(input: unknown) -> InteriorRequest`: checks the [request schema](../../schemas/request.schema.json) and its [blueprint schema](../../schemas/blueprint.schema.json), including facade partition anchors, moving-door clear depth, and the fitted roof enclosure, then semantics: contiguous floor indices, elevations consistent with heights, CCW outlines with positive area, openings inside their edge and floor height with no overlap, and every `openFront` on floor 0 with sill 0 and portal width and height inside its wall cut. Supplied assignments must cover every floor exactly once; a `spans: 2` entry covers the next floor too. Throws `E_BLUEPRINT_INVALID` or `E_ASSIGNMENT_INVALID`.
  - `validateShell(request: InteriorRequest, shellDoc: Document) -> void`: shell GLB bounds must contain the blueprint footprint and reach the top floor. Throws `E_SHELL_MISMATCH`.
  - A window's optional `glazing` field must fit its overall opening in U and Y; `glassDepth <= housingBackDepth <= facade.wallDepth` when wall depth is published. A 1 micrometre tolerance covers floating-point arithmetic. Violations throw `E_BLUEPRINT_INVALID` with floor and opening identity. Other opening kinds retain their overall cuts.
  - A pocket door requires measured `facade.wallDepth`. Its cassette fits the face, floor and wall depth; clearance matches the opening's U/Y rectangle and cassette back depth. Indexed leaves match the opening's leaf count and maximum absolute travel. Each chamber fits inside the cassette, has ordered front/back depths, meets its travel-side passage edge, and contains the translated equal-width closed span in U. Chambers do not overlap the passage, other chambers or other openings on that face. The doorway is not the leaf's vertical bounds; Exterior owns actual leaf, finish and hardware containment, also checked by consumer motion probes. Semantic failures throw `E_BLUEPRINT_INVALID` with floor and opening identity, using a 1 micrometre tolerance. Swing, roller and minimal clear-depth metadata retain their existing behavior.
- `fixture.ts`
  - `makeFixture(options?: FixtureOptions) -> { request: InteriorRequest, shellDoc: Document }`: seeded exterior stand-in with a chamfered rectangular outline or a supplied exact outline, per-kind floor heights, openings and a low-poly shell GLB. Options: `seed`, `floors`, `basements`, `width`, `depth`, `outline`, `rotationDeg`, `type`, `tier`, `theme`, `facadeStyle`, `wallDepth`, `blueprint`. With `blueprint`, only the shell is fabricated and assignments derive from its floor kind slugs.
  - Deterministic: the same options produce the same request and serialized shell.

## Errors

`InteriorError` with `E_BLUEPRINT_INVALID`, `E_ASSIGNMENT_INVALID`, `E_SHELL_MISMATCH`.

## Depends on

- [core](../core/CONTRACT.md)
- [glb](../glb/CONTRACT.md)
- [request schema](../../schemas/request.schema.json)
- [blueprint schema](../../schemas/blueprint.schema.json)
