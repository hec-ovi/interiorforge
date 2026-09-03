# CONTRACT: geometry

Purpose: turns a building plan into interior meshes and completes the shell GLB with slabs, openings, stairs, shafts, lights and shaped furniture.

## In / Out

- `buildInteriorBands(plan: BuildingPlan, request: InteriorRequest) -> { stepsByFloor, floorMeshes }`: builds and validates one sealed `MeshBuilder` per blueprint floor without a combined document. A floor band runs from its slab to the next slab, includes its stair climb, and carries shaft floors with the lowest served floor.
- `buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document) -> { doc, stepsByFloor, floorMeshes }`: mutates and returns the supplied shell document after merging the floor bands.
  - Deletes the shell's separator-plane nodes (exterior naming `floor:<index>/slab`) and re-emits per-room finish floors, soffits and shaft floor plates so stairs and elevators pass through real holes.
  - Interior walls between rooms with door openings and lintels at 2.5 m, 3 m for three or more leaves, or one casing band below a lower ceiling. A shared doorway produces one casing. Its closed face trims stand outside the wall faces while the closed wall end owns the reveal, leaving no overlapping visible planes. Baseboard, dado, field and ceiling trim are closed solids with a hidden 2 mm overlap at thickness changes, so no open ledge or coplanar cap remains. Every band is cut flush with the facade lining. The facade lining (`lining.ts`) is the ring between the plate at the shell wall depth (`layout/shell.ts`) and the plate one lining deeper, one sector per outline edge between the corner bisectors. Its holes sit inside blueprint openings, close where a reveal would enter another edge's wall, and line back to the skin clearance. An `openFront` hole uses `portal.clearWidth` and `portal.clearHeight`; its clear volume contains no leaf or panel.
  - Shell fit check (`shell-fit.ts`): every vertex is measured against its floor's outline before the document is written; a vertex inside the shell wall depth that is not an opening's reveal lining, or a reveal vertex standing in another edge's wall, throws `E_SHELL_BREACH` naming the floor that holds it (the upper floor on a slab line).
  - Vertical core: internal shaft divider walls, elevator door openings with closed metal door panels, stair shafts with entry openings, and continuous U-return stairs. Flights are 1.2 m clear, risers are 0.16 to 0.18 m, treads are 0.28 m and landings are 1.2 m. Stair A continues from the last served floor to a fitted roof bulkhead; a closed platform meets the stair's finished inside edge across the arrival landing and reaches the enclosure door threshold. A geometry-level probe checks 2.1 m above every tread and landing against stairs, slabs, walls and fixtures before export.
  - Shaped furniture assemblies per kind at their planned position, rotation and size, including seeded room clutter. Wardrobes are fitted painted-steel carcasses with separate leaves, centre reveals, vents, handles and recessed supports, all inside their declared bounds. Electronic art and display screens use a dark metal stepped-radius housing, a separate narrow central rear mount inside the declared depth, and a uniformly inset screen.
  - Each light is a plain metal housing with a separate emissive lens mapped once across its face. Cove fixtures add a shielding lip and expose the lens upward; ceiling fixtures expose it downward.
  - `stepsByFloor: Map<number, Record<string, Rect3[]>>`: tread rectangles by floor and stair id. Each rectangle has a world-space center and frame-axis dimensions; the floor's `coreAngleDeg` supplies its rotation.
- All meshes use material keys `theme/kind/tier`; single-sided, CCW, world-meter UVs (glb box discipline). Elevator door panels carry exact-placement 0..1 UVs. The materials box resolves the keys into maps afterwards.
- The same plan, request and shell produce the same geometry and material order.

## Errors

- `E_UNREACHABLE_SPACE`: a stair run cannot keep the player's clear width or headroom, or emitted geometry blocks a room doorway or open-front portal.
- `E_SHELL_BREACH`: interior geometry reaches the shell wall.

## Depends on

- [core](../core/CONTRACT.md)
- [glb](../glb/CONTRACT.md)
- [layout](../layout/CONTRACT.md) (`BuildingPlan`)
