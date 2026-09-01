# interior: deterministic building interior generator

You own this box. You build only what lives in this repo.

## Context (general, do not expand it)
This repo is one isolated layer of a larger build: a seeded, deterministic city world that ends as a playable 3D game (map, buildings, transit, NPCs, quests). Nine layers are built in parallel by separate sessions, each locked to its own repo, coupled only through CONTRACT.md files. Never read another layer's code or tests, only its CONTRACT.md. Your raw requirements are in docs/REQUIREMENTS.md, in the user's own words: they win over any summary here.

## Scope
- In: the exterior GLB shell and its floor blueprint, building type, per-floor assignments (lobby, offices, restaurant, coffee shop, gym, residences, special floors).
- Out: the completed GLB with interiors (rooms, stairs, elevators, furniture, internal materials) plus a JSON per floor: room layout, and NPC support: placeholder positions, roles and path routines inside the instance (vendor behind the counter, security round, receptionist, cleaner, elevator use, stairs, bathroom, idle spots, obstacle-avoiding walk paths from any point to any point).
- Vertical consistency: elevator shaft and stair holes align across all floors, stairs are real and walkable, every floor of a 70 floor building exists and is real.
- Floor heights vary with sense: around 2 to 3 meters normal, up to 4 for special floors (lobby, loft, double corpo floor).
- Templates per floor kind (office, restaurant, coffee shop, residence studio, full apartment, lobby, gym) reused across buildings with seeded variance so nothing is monotonous.
- Doors single, double, triple or quadruple, never absurd. Widths, corridors, distances follow interior architecture principles from research.
- Room split logic per floor: does this floor make sense as one studio plus two full homes, a full office floor, a ground floor restaurant, a terrace coffee shop.
- Standalone floor editor mode: open floor N of a building, inspect and polish it in the preview.

## Out of scope
No exterior geometry, no city context, no quest logic (routine placeholders only), no material image generation.

## Depends on
../exterior/CONTRACT.md, ../materials/CONTRACT.md

## Consumers
../simulation, ../engine

## Working order
1. Deep research first: 2026 state of the art on procedural interior layout (floor plan generation, room graphs, stair and elevator placement rules, egress standards). Compact conclusions to docs/RESEARCH.md.
2. Draft CONTRACT.md with schemas before code (simulation is blocked on your NPC routine schema).
3. Implement with tests and the preview.
4. Keep CONTRACT.md and docs/INDEX.md current.

## Hard requirements
- Deterministic: same seed and inputs give identical output. No LLM calls.
- Standalone: runs from a fixture exterior GLB and blueprint with no other layer present.
- Known failure modes to design against: empty gaps, walls at wrong angles, inverted material faces, spots where an NPC or player gets stuck, stairs that do not connect.
- Preview UI follows src/ui/ with views/, widgets/, components/.

## Coordination
- Read docs/FEEDBACK.md at the start of every session.
- Write blockers and cross-layer questions to docs/ISSUES.md.

## Master requirements (background only)
docs/FULL-REQUIREMENTS.md holds the user's complete raw requirements for the whole project, so you see your surroundings. Read it once for awareness. It never widens your scope: what you build is defined by this file and docs/REQUIREMENTS.md only.
