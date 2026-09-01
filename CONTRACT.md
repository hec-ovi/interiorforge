# CONTRACT: interior

Purpose: deterministically fills one building shell with interiors per floor and exports NPC routine placeholders and walk paths for that instance.

Status: draft, schemas pending research.

## In (must cover)
- seed
- exterior GLB shell and floor blueprint
- building type and per-floor assignments
- theme material set id

## Out (must cover)
- completed GLB with interiors
- per-floor JSON: rooms, stairs and elevator holes, furniture placement
- NPC instance support: roles, placeholder positions, routines, walk paths with obstacle avoidance

## Errors
Closed set, to be defined.

## Depends on
- ../exterior/CONTRACT.md
- ../materials/CONTRACT.md
