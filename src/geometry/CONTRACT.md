# CONTRACT: geometry

Purpose: turns a building plan into interior meshes and completes the shell GLB: slabs with real shaft holes, walls with door and window openings, walkable stairs, elevator shafts, furniture boxes.

## In / Out

- `buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document) -> { doc, stepsByFloor, floorMeshes }`: `floorMeshes` is the same geometry split by floor band (one MeshBuilder per blueprint floor: slab to next slab, stair climb included, shaft floors with the lowest served floor); `doc` carries their merge.
  - Deletes the shell's separator-plane nodes (exterior naming `floor:<index>/slab`) and re-emits per-room finish floors, soffits and shaft floor plates so stairs and elevators pass through real holes.
  - Interior walls between rooms with door openings and lintels (2.1 m head, wider storefront openings run taller), every band cut flush with the facade lining. The facade lining (`lining.ts`) is the ring between the plate at the shell wall depth (layout/shell.ts) and the plate one lining deeper, one sector per outline edge between the corner bisectors, its holes recessed inside the blueprint openings, closed at either end where the reveal would stand in another edge's wall, and lined back to the skin clearance.
  - Shell fit check (`shell-fit.ts`): every vertex is measured against its floor's outline before the document is written; a vertex inside the shell wall depth that is not an opening's reveal lining, or a reveal vertex standing in another edge's wall, throws `E_SHELL_BREACH` naming the floor that holds it (the upper floor on a slab line).
  - Vertical core: internal shaft divider walls, elevator door openings with closed metal door panels, stair shafts with entry openings, and continuous U-return stairs. Flights are 1.2 m clear, risers are 0.16 to 0.18 m, treads are 0.28 m and landings are 1.2 m. A geometry-level probe checks 2.1 m above every tread and landing against stairs, slabs, walls and fixtures before export.
  - Furniture as boxes at their planned position, rotation and size.
  - `stepsByFloor: Map<floor, Rect3[]>`: world tread rectangles per floor for the floor JSON.
- All meshes use material keys `theme/kind/tier`; single-sided, CCW, world-meter UVs (glb box discipline). Elevator door panels carry 0..1 UVs instead: their material is an exact placement, never tiled. The materials box resolves the keys into maps afterwards.
- Deterministic: identical plan, identical bytes.

## Errors

- `E_UNREACHABLE_SPACE`: a stair run cannot keep the player's clear width or headroom.
- `E_SHELL_BREACH`: interior geometry reaches the shell wall.

## Depends on

- ../core/CONTRACT.md
- ../glb/CONTRACT.md
- ../layout/CONTRACT.md (BuildingPlan)
