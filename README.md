# Interior 0.30.1

A TypeScript API that fills one building shell with rooms, furniture, lights and NPC
navigation. The seed controls variation within geometry and clearance rules.

## Run

```sh
npm ci
npm test
npm run typecheck
npm run generate -- --seed 1 --floors 2 --keys-only --out out
npm run preview
```

Pass `--request request.json` to use a supplied shell/blueprint. `--floor-glbs` adds
floor assets; `--floor-glbs-only` writes those without a combined building.
`--embed` packs catalog maps into the GLB. Missing catalogs produce material keys.

[SKILL.md](SKILL.md) provides request defaults and a copyable library example.
[CONTRACT.md](CONTRACT.md) defines calls, outputs, errors and slab ownership.
[docs/INDEX.md](docs/INDEX.md) maps implementation responsibilities.
[docs/ISSUES.md](docs/ISSUES.md) lists pending boundary and product decisions.

## Preview and materials

The standalone preview accepts a generated fixture or a shell GLB, blueprint JSON and
optional Exterior request JSON. Select floors, inspect room plans and NPC placements,
and test walking routes. `?sample=luxury` supplies a residence with JSON camera stations.

Rich tiers use stone and walnut, poor uses worn panels and exposed services, and mid
uses capsule panels. Studio-style panels keep fixed corners around broad fitted fields; cabinet fronts share their available middle span. Complete furniture groups reserve access space before placement.
The [panel palettes](src/geometry/panels/palettes.json),
[material bindings](src/geometry/materials.ts) and [asset catalog](src/assets/catalog.json)
are the current inventory. Imported models retain their source materials and proportions.

Core feasibility checks geometric fit; successful preflight does not certify the final
room program or runtime character traversal.
