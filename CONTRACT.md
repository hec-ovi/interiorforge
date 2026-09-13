# Interior 0.30.0

Fills one building shell with furnished floor geometry and NPC navigation.

## Input and calls

[Request schema](schemas/request.schema.json), [consumed Exterior blueprint](schemas/blueprint.schema.json),
[TypeScript inputs and results](src/core/types.ts). Units: meters, building-local XZ, +Y up, CCW outer polygons.

| Entry in `src/index.ts` | Input | Result |
| --- | --- | --- |
| `generateInterior` | Request and optional [GenerateOptions](src/index.ts) | Promise of `{glb, floors, npc, textures, floorGlbs?}` |
| `generateFloorInteriors` | Same request/options except `floorGlbs` | Promise of `{floorGlbs, floors, npc, textures}` |
| `makeFixture` | Optional [FixtureOptions](src/blueprint/fixture.ts) | `{request, shellDoc}` for standalone generation |
| `coreFeasibility` | Consumed blueprint | [Core fit result](src/layout/schema/core-feasibility.schema.json) |
| `findPath` | NPC data and two `{floor, position: [x,z]}` endpoints | Walk and connector legs, or `null` |

`coreFeasibility` is also available from browser-safe `src/feasibility.ts` and built
`dist/feasibility.js` (`npm run build:feasibility`). It checks the core only;
room programs, furniture and routes are checked during generation.

Assignments default from blueprint labels and building type. Options default to
external textures, imported assets enabled and no floor GLBs. `shellDoc` skips disk
loading; combined generation mutates it. `assets: false` selects procedural furniture;
`assets: {read}` supplies a model reader. Both generators support those asset options.
[TextureOptions](src/materials/index.ts) accepts `mode: external|embed|keys`, `dir`,
`baseUrl`, and a preloaded `theme`. Directory: explicit value, `URBE_MATERIALS_DIR`,
then sibling `materials`. Missing catalog gives key-only output; embedding requires disk maps.

## Output

- GLB bytes: combined shell/interior, optionally a map of floor index to interior GLB.
- [Floor JSON](schemas/floor.schema.json): kind, elevation, ceiling, core, opening reservations,
  rooms/connections, furniture and light sources; optional loft ownership.
- [NPC JSON](schemas/npc.schema.json): building ID, anchors, role counts, routines,
  optional standing placements, grids and inter-floor/roof connectors.
- Texture report: `{mode: external|embedded|keys, materials, baseUrl?}`.

Same request, options, shell, material catalog and asset snapshot produce identical
output. The floor streams use independent seeds. Opening reservations constrain
partitions, core and furniture. Geometry checks shell bounds, doorway and stair clearance.
Navigation describes the exported grid; runtime collision and actor dimensions need
consumer agreement in [issues](docs/ISSUES.md).

Combined output replaces shell `floor:<index>/slab` nodes. Streamed floor GLBs contain
interior bands only; their consumer must remove the corresponding shell slabs to avoid
duplicate surfaces. Floors use `NNN` tags, negative floors `mN`. The CLI writes
`building.glb`, `floors/*.json`, `npc.json`, and requested `floors/*.glb`.
Usage and a complete example: [SKILL.md](SKILL.md).

## Errors

Closed generator domain set, thrown as `InteriorError {code, floor?, message}`:

| Code | Meaning |
| --- | --- |
| `E_BLUEPRINT_INVALID` | Request schema or blueprint semantics invalid |
| `E_SHELL_MISMATCH` | Shell unreadable or its bounds do not contain the blueprint |
| `E_ASSIGNMENT_INVALID` | Assignments omit, duplicate or reference absent floors, or have invalid spans |
| `E_FLOOR_TOO_SMALL` | Core, reservations or required room program cannot fit |
| `E_UNREACHABLE_SPACE` | Room, anchor, core, opening or stair clearance fails |
| `E_SHELL_BREACH` | Generated geometry crosses the shell boundary or cannot close a surface |
| `E_MATERIAL_UNRESOLVED` | Required material or map cannot resolve in the selected mode |

`findPath` returns `null` for an ordinary route miss. CLI file I/O failures exit nonzero.

## Dependencies

[Exterior](../exterior/CONTRACT.md) supplies the shell and blueprint;
[Materials](../materials/CONTRACT.md) supplies optional PBR catalogs.
The standalone fixture and key-only mode require neither box at runtime.
Implementation packages: glTF Transform 4.x and Ajv 8.x. Preview: Three.js and Vite.
Consumers: Engine loads GLBs/floor data; Simulation reads NPC support.
Boundary proposals and unresolved product choices: [docs/ISSUES.md](docs/ISSUES.md).
