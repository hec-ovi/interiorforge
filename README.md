# Interior 0.32.0

A TypeScript generator for furnished buildings made from shared room modules.
One building stores ground, middle and crown layouts. Every middle floor references
the same table, including rooms, furniture, lights and NPC navigation.

## Run

```sh
npm ci
npm run modules -- --out out/modules
npm run generate -- --seed demo --floors 6 --out out/building
npm test
npm run typecheck
npm run preview
```

Use `--request request.json` for an assembled Exterior blueprint. The request
includes seed, building identity and type, tier, blueprint and material theme.
Without a request, the CLI produces a rectangular sample and prints its seed.
An omitted seed is random and can be reused.

The city shares `modules.json`, its GLBs and the existing furniture catalog: panel
frames, slabs, ceiling bands and fields, light housings, the core and built-in
furniture, each wearing a Materials key. Each building has `building.json` and three
layout JSON files. The Engine instances module and prop IDs using `position`,
`rotationY`, `scale` and floor elevation. The preview uses those same placements,
textured from the sibling Materials box; `?sample=hotel|restaurant|residence` opens a
published kit plan at its review cameras.

[CONTRACT.md](CONTRACT.md) defines schemas, frames, clearance rules and errors.
[SKILL.md](SKILL.md) provides a complete example.
[docs/INDEX.md](docs/INDEX.md) maps the implementation.
[docs/ISSUES.md](docs/ISSUES.md) records remaining consumer decisions.

## Checks

Contract tests cover the CLI and public calls, JSON schemas, indexed compressed
modules, deterministic bytes, middle reuse, opening rectangles, pocket doors, navigation,
stair and backing clearance, service program reductions, nine-slice frames, published
emitters, furnished programs with their staff, both building budgets, and the compiled
feasibility entry. Tests use at most two workers. `out/proof/budget.json` records
measured bytes, seconds and placement counts.
