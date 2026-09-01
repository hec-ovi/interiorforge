# urbe interior

Deterministic building interior generator for the urbe city project. Takes an exterior GLB shell and its floor blueprint, returns the completed GLB (rooms, walkable stairs, elevators, furniture placeholders) plus a JSON per floor and an NPC support file (anchors, roles, routines, nav data with a reference pathfinder).

Same seed and inputs, identical output. No LLM calls in generation.

## Use

```
npm install
npm test                 # every box's tests in one pass
npm run generate -- --seed 1 --floors 12 --out out
npm run preview          # 3D building view plus standalone floor editor
```

Without `--request`, a fixture shell is fabricated so the box runs with no other layer present.

## Surface

The coupling surface is [CONTRACT.md](CONTRACT.md) and `schemas/`. The box map lives in [docs/INDEX.md](docs/INDEX.md); research conclusions behind the layout rules in [docs/RESEARCH.md](docs/RESEARCH.md).
