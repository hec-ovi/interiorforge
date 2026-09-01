# urbe interior

Deterministic building interior generator for the urbe city project. Takes an exterior GLB shell and its floor blueprint, returns a finished furnished textured GLB (rooms, walkable stairs, elevators, furniture placeholders, materials resolved through the materials database) plus a JSON per floor and an NPC support file (anchors, roles, routines, nav data with a reference pathfinder).

Same seed and inputs, identical output. No LLM calls in generation.

## Use

```
npm install
npm test                 # every box's tests in one pass
npm run generate -- --seed 1 --floors 12 --out out
npm run generate -- --embed --out out      # one self-contained GLB, maps included
npm run generate -- --keys-only --out out  # material keys, resolved by the consumer
npm run preview          # 3D building view plus standalone floor editor
```

Textures come from the sibling `materials` box by default (`URBE_MATERIALS_DIR` or `--materials DIR` points elsewhere), written as URIs relative to the output directory. Without a materials database the output keeps its material keys, so the box still runs on its own.

Without `--request`, a fixture shell is fabricated so the box runs with no other layer present.

## Surface

The coupling surface is [CONTRACT.md](CONTRACT.md) and `schemas/`. The box map lives in [docs/INDEX.md](docs/INDEX.md); research conclusions behind the layout rules in [docs/RESEARCH.md](docs/RESEARCH.md).
