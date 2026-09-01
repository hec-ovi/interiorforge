# Box map

Root box: the interior generator (CONTRACT.md). Inner boxes, one folder each:

- `src/core`: seeded RNG, 2D geometry (clipping, exact polygon insets), walkable grid, shared types, error type. Depends on nothing.
- `src/glb`: GLB read and write, mesh builder with winding and UV discipline. Depends on core.
- `src/blueprint`: request validation, assignment resolution, standalone fixture shell. Depends on core, glb.
- `src/layout`: shell wall model, vertical core plan, corridors, rooms, furniture, lights, nav grid, reachability validation. Depends on core.
- `src/npc`: anchors, roles, routines, nav export, reference pathfinder. Depends on core, layout.
- `src/materials`: resolves material keys through ../materials and textures the GLB (external URIs, embedded maps, or keys only). Depends on core, glb.
- `src/geometry`: interior meshes completing the shell GLB, stairs, walls, lights, `furniture/` (one shaped model per kind), and the shell fit check. Depends on core, glb, layout.
- `src/ui`: browser preview: panoptic 3D view plus standalone floor editor. Depends on core, root surface, three.js.

Root `src/index.ts` wires blueprint -> layout -> npc -> geometry -> materials into `generateInterior`; `src/cli.ts` runs it from the terminal.

Dependency edges flow one way: ui and cli sit on top, core sits at the bottom, no cycles.
