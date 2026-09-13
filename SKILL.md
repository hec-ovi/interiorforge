---
name: urbe-interior
description: Generate furnished building interiors and NPC navigation from an Exterior shell and blueprint using the local Urbe Interior API.
---

# Interior 0.30.1

Fills one supplied building shell with rooms, furniture, lights and NPC navigation.

Call `generateInterior(request, options?)` from `src/index.ts`, or run
`npm run generate -- --request request.json --keys-only --out out` from this repo.
No HTTP server is provided. Shell paths resolve from the caller's working directory.

| Request field | Default |
| --- | --- |
| `seed`: nonempty string or uint32 | Required |
| `building`: `{id, type, tier}` | Required; vocabulary in [request schema](schemas/request.schema.json) |
| `shellGlb`: shell GLB path | Required; `options.shellDoc` supplies an in-memory shell instead |
| `blueprint`: floor outlines, stack, openings and facade | Required; [consumed schema](schemas/blueprint.schema.json) |
| `materialTheme`: catalog theme ID | Required |
| `assignments`: `{floor, kind, spans?}[]` | Derived from blueprint floor labels and building type; `spans` defaults to 1 |

Options: `textures.mode` defaults to `external` (`embed` or `keys` also supported),
`floorGlbs` defaults to false, `assets` defaults to true. Material directory uses
`textures.dir`, then `URBE_MATERIALS_DIR`, then the sibling `materials` folder.
A missing catalog returns `textures.mode: "keys"`. See [contract](CONTRACT.md) for transports.

The promise returns `{glb, floors, npc, textures, floorGlbs?}`. GLBs are `Uint8Array`;
`floorGlbs` is a `Map<number, Uint8Array>`. [Floor](schemas/floor.schema.json) and
[NPC](schemas/npc.schema.json) records are JSON. `generateFloorInteriors` returns
floor GLBs and the same data, without `glb`. `findPath(npc, from, to)` consumes
`{floor, position: [x,z]}` endpoints and returns walk/connector legs or `null`.
Use meters, building-local XZ coordinates and +Y up. Keep resource snapshots fixed
for reproducibility. Combined generation mutates a supplied shell document.

Errors throw `InteriorError {code, floor?, message}`: `E_BLUEPRINT_INVALID`,
`E_SHELL_MISMATCH`, `E_ASSIGNMENT_INVALID`, `E_FLOOR_TOO_SMALL`,
`E_UNREACHABLE_SPACE`, `E_SHELL_BREACH`, `E_MATERIAL_UNRESOLVED`.
Meanings are in [CONTRACT.md](CONTRACT.md#errors); do not retry unchanged inputs.

Copy this standalone example into `example.ts` and run `node --import tsx example.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { generateInterior, makeFixture } from "./src/index.js";

const { request, shellDoc } = makeFixture({ seed: "demo", floors: 2 });
const result = await generateInterior(request, {
  shellDoc, textures: { mode: "keys" }, assets: false,
});
await mkdir("out", { recursive: true });
await writeFile("out/building.glb", result.glb);
await writeFile("out/npc.json", JSON.stringify(result.npc));
```
