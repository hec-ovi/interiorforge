# CONTRACT: blueprint

Purpose: guards the box input (schema and semantic validation of an InteriorRequest, shell consistency) and fabricates a deterministic fixture shell so the repo runs standalone with no exterior layer present.

## In / Out

- `validate.ts`
  - `validateRequest(request: unknown) -> InteriorRequest`: JSON-schema check against `schemas/request|blueprint.schema.json`, then semantics: contiguous floor indices, elevations consistent with heights, CCW outlines with positive area, openings inside their edge and floor height with no overlap, assignments covering every floor exactly once (a `spans: 2` entry covers the next floor too). Throws `E_BLUEPRINT_INVALID` or `E_ASSIGNMENT_INVALID`.
  - `validateShell(request, shellDoc) -> void`: shell GLB bounds must contain the blueprint footprint and reach the top floor. Throws `E_SHELL_MISMATCH`.
- `fixture.ts`
  - `makeFixture(options) -> { request, shellDoc }`: seeded exterior stand-in: chamfered rectangular outline (or an exact `outline`, e.g. a real city parcel), per-kind floor heights, entrance plus windows plus balcony doors in the blueprint, low-poly shell GLB (facade skins named with exterior's material kinds, floor separator planes, roof). Options: seed (number or string), floors, basements, width, depth, outline, rotation, facade style, wall depth, building type, tier, theme; all defaulted. `blueprint` takes an exact blueprint (real exterior output) instead: only the shell is fabricated and assignments derive from its floor kind slugs.
  - Deterministic: same options, identical request and shell bytes.

## Errors

`InteriorError` with `E_BLUEPRINT_INVALID`, `E_ASSIGNMENT_INVALID`, `E_SHELL_MISMATCH`.

## Depends on

- ../core/CONTRACT.md
- ../glb/CONTRACT.md
- ../../schemas/request.schema.json, blueprint.schema.json
