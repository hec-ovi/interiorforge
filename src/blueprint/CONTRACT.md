# CONTRACT: blueprint

Purpose: guards the box input (schema and semantic validation of an InteriorRequest, shell consistency) and fabricates a deterministic fixture shell so the repo runs standalone with no exterior layer present.

## In / Out

- `validate.ts`
  - `validateRequest(input: unknown) -> InteriorRequest`: checks the [request schema](../../schemas/request.schema.json) and its [blueprint schema](../../schemas/blueprint.schema.json), including facade partition anchors and moving-door clear depth, then semantics: contiguous floor indices, elevations consistent with heights, CCW outlines with positive area, openings inside their edge and floor height with no overlap, and every `openFront` on floor 0 with sill 0 and portal width and height inside its wall cut. Supplied assignments must cover every floor exactly once; a `spans: 2` entry covers the next floor too. Throws `E_BLUEPRINT_INVALID` or `E_ASSIGNMENT_INVALID`.
  - `validateShell(request: InteriorRequest, shellDoc: Document) -> void`: shell GLB bounds must contain the blueprint footprint and reach the top floor. Throws `E_SHELL_MISMATCH`.
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
