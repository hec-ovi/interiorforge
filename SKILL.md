---
name: urbe-interior
description: Generate shared Interior modules and three reusable placement layouts from an assembled Exterior blueprint.
---

# Interior 0.31.12

Use this box to publish the room module kit once, then placement JSON per building.
Run commands from Interior. The consumer supplies an assembled Exterior blueprint.

```sh
npm run modules -- --out out/modules
npm run generate -- --request request.json --out out/building
```

The [request schema](schemas/request.schema.json) requires `seed`, `building`
with `id`, Atlas `type` and `tier`, `blueprint`, and `materialTheme`.
`assignments` is optional and derives from blueprint kinds. Each assignment covers
one floor. Middle floors share geometry and program. `shellGlb` is optional metadata.

```ts
import { generate, makePlacementFixture, writePlacements } from './src/index.js';

const request = makePlacementFixture({ seed: 'demo', floors: 6, width: 40, depth: 40 });
const result = await generate(request);
await writePlacements(result, 'out/building');
```

The result is `{building, layouts}`. Layout keys are `ground`, `middle`, `crown`.
Each placement gives `module` or `prop`, `id`, `room`, `position`, `rotationY`,
`scale` and optional source `opening` or core `connector`. Use metres and radians
about positive Y.
Add `building.floors[].elevation` to layout Y and use its `openings` map for blueprint
identities. Module origins and material slots are in `modules.json`; props resolve
through the existing Assets catalog. Resource bases belong to the consumer.

Use `expandBuilding(result)` for absolute floor data and NPC records, then
`findPath(npc, from, to)` for routes. Each endpoint has `floor` and `position: [x,z]`.
See [CONTRACT.md](CONTRACT.md) for slab ownership, lift poses and the five generation
error codes. Run `npm test` and `npm run typecheck` before handing the result to Engine.
