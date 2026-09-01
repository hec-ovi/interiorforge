# CONTRACT: geometry

Purpose: turns a building plan into interior meshes and completes the shell GLB: slabs with real shaft holes, walls with door and window openings, walkable stairs, elevator shafts, furniture boxes.

## In / Out

- `buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document) -> { doc, stepsByFloor }`
  - Deletes the shell's separator-plane nodes (exterior naming `floor:<index>/slab`) and re-emits per-room finish floors, soffits and shaft floor plates so stairs and elevators pass through real holes.
  - Interior walls between rooms with door openings and lintels (2.1 m head, wider storefront openings run taller); facade lining walls inset 0.02 from the shell skin with window and door holes matching the blueprint openings.
  - Vertical core: internal shaft divider walls, elevator door openings with closed metal door panels, stair shafts with entry openings, U-return stair flights and landings sized per floor height (riser <= 0.17, tread 0.28), continuous bottom to top.
  - Furniture as boxes at their planned position, rotation and size.
  - `stepsByFloor: Map<floor, Rect3[]>`: world tread rectangles per floor for the floor JSON.
- All meshes use material keys `theme/kind/tier`; single-sided, CCW, world-meter UVs (glb box discipline). Elevator door panels carry 0..1 UVs instead: their material is an exact placement, never tiled. The materials box resolves the keys into maps afterwards.
- Deterministic: identical plan, identical bytes.

## Errors

None of its own; inputs are already validated.

## Depends on

- ../core/CONTRACT.md
- ../glb/CONTRACT.md
- ../layout/CONTRACT.md (BuildingPlan)
