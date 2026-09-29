---
name: urbe-interior
description: Generate shared Interior modules and reusable placement layouts from an assembled Exterior blueprint.
---

# Interior 0.39.0

Use this box to publish the room module kit once, then placement JSON per building.
Run commands from Interior. The consumer supplies an assembled Exterior blueprint.

```sh
npm run modules -- --out out/modules
npm run generate -- --request request.json --out out/building
```

The [request schema](schemas/request.schema.json) requires `seed`, `building`
with `id`, Atlas `type` and `tier`, `blueprint`, and `materialTheme`.
`assignments` is optional and derives from blueprint kinds. Each assignment covers
one floor, except an `apartment` assignment with `spans: 2` under
`building.interiorStyle: 'apartment-1702'`, which pairs two storeys into private duplexes.
`interiorStyle` may also name a mid capsule profile, `h10`, `japantown` or `sandra-dorsett`.
Rich and high rich homes, hotels, offices and corpo parcels, and poor homes and hotels,
furnish as a reference kind (`A`, `B`, `C`, `R`), derived from type, tier and architecture
or forced by `building.kind`; `building.references` narrows the space templates the
building fits (`e1-apartment` … `r1-office`). The manifest publishes `kind`, and kind rooms
publish `style`, `template`, `role` and `ceilingDrop`; a kind `B` home pairs its top two
storeys into a loft unless the assignments are explicit. Equal middle floors share geometry and program; distinct plates or programmes
publish an additional `floor-<index>` layout. `shellGlb` is optional metadata.

```ts
import { generate, makePlacementFixture, writePlacements } from './src/index.js';

const request = makePlacementFixture({ seed: 'demo', floors: 6, width: 40, depth: 40 });
const result = await generate(request);
await writePlacements(result, 'out/building');
```

The result is `{building, layouts, missingModels}`; `missingModels` lists local furniture
models this checkout lacks, whose furniture wore another model or left the layout with its
anchors and roles. When the props you publish live elsewhere, pass
`{models: await presentModels('<props folder>/models')}` as generate's second argument. Layout keys are `ground`, `middle`, `crown` and
`floor-<index>` for distinct intermediate floors; read the manifest's declared entries.
Each placement gives `module` or `prop`, `id`, `room`, `position`, `rotationY`,
`scale` and optional source `opening` or core `connector`. Use metres and radians
about positive Y.
Add `building.floors[].elevation` to layout Y and use its `openings` map for blueprint
identities. A reachable roof adds a last floor reference whose layout has kind `roof`;
`building.floors[].apartmentEntrances` carries each floor's numbered pocket entrances. Module origins and material slots (`key#variant`, tile-unit UVs) are in
`modules.json`; props resolve through the existing Assets catalog. Resource bases belong
to the consumer. `npm run preview` with `?sample=hotel`, `restaurant` or `residence`
shows a published kit plan furnished in its family.

Use `expandBuilding(result)` for absolute floor data and NPC records, then
`findPath({nav: npc.nav, from, to})` for routes, from `src/index.ts` or the browser build
`dist/nav.js` (`npm run build`). Each endpoint is `{floor, x, z}`; the result is
`{legs, connectors}` or `{error: {code, message}}`.
See [CONTRACT.md](CONTRACT.md) for slab ownership, lift poses and the five generation
error codes.
