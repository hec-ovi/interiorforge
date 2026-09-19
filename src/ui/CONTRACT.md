# Preview

Draws shared module and prop instances and displays floor metadata and navigation.

`mountApp(root, viewer, sampleName?, viewIndex?)` accepts a DOM root and
[Viewer3D](views/viewer3d.ts), returning [AppState](app-state.ts).
`npm run preview` starts Vite; `?sample=<name>&view=<n>` opens a [sample](samples/CONTRACT.md)
at one of its cameras and marks the root `data-ready` once the scene stands. The initial
fixture has six floors and no basements. The loader accepts an assembled blueprint and
optional building request JSON. Vite serves the Materials database at `/materials` and
the city's shared resources (`URBE_SHARED_DIR`, default the sibling engine's
`out/shared`) at `/shared`.

`Viewer3D.setPlacements(result)` consumes the [placement result](../placements/types.ts).
It loads shared modules and catalog models, retains their authored transforms and
creates Three.js instances using placement scale, rotation, position and floor elevation.
Modules wear their published maps from the materials route, lit diffusers at preview
emissive strength, and fall back to key colours without it. Local catalog models use the asset route.
Floor slicing, room inspection, light sources, eye cameras and navigation remain available.
`expandBuilding` supplies presentation records and route identities.

Controls emit generation settings, selected files and camera actions. State events
are result, mode, floor, selection, path and busy. Views display state; Layout and
Placements own generation rules. Errors appear as generation, loading or preview notices.
Missing local prop geometry stays absent until the resource catalog is installed.

Depends on the [root API](../../CONTRACT.md), [Modules](../modules/CONTRACT.md),
[Assets](../assets/CONTRACT.md), [NPC](../npc/CONTRACT.md), Three.js and Vite.
