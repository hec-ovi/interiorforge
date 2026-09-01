# CONTRACT: ui

Purpose: browser preview of a generated building: panoptic 3D navigation of the whole GLB and a standalone floor editor that isolates one floor for inspection and path testing. Presentation only; all generation runs through the root `generateInterior`.

Run: `npm run preview` (Vite dev server).

## Components

- `views/viewer3d.ts`: `Viewer3D` interface: `setGlb(bytes)`, `setFloorSlice({y0, y1} | null)`, `el`. `createViewer3d()` implements it with three.js (orbit controls, clipping planes for the floor slice); tests inject a fake.
- `views/plan-view.ts`: `createPlanView(state)`: SVG floor plan of the selected floor: room polygons (click to select), doors, furniture, anchors, nav path overlay. Two plan clicks run `findPath` on the current floor and draw the route.
- `widgets/controls.ts`: `createControls(state, onGenerate, onLoadFiles)`: fixture parameters (seed, floors, basements, type, tier), generate button, real-building loader (shell .glb + blueprint .json + exterior request .json in one multi-file pick), mode toggle (building | floor), floor selector.
- `widgets/info-panel.ts`: `createInfoPanel(state)`: details of the selected room (kind, unit, doors, furniture, anchors) and path status.
- `app-state.ts`: `createAppState()`: params, result, mode, floor index, selection, path; `on(event, cb)` with events `result`, `mode`, `floor`, `selection`, `path`, `busy`.
- `components/dom.ts`: `el()` element builder, labeled field helpers.

## Events / flow

`controls` -> `onGenerate(params)` -> main regenerates (fixture + generateInterior) -> `state.setResult` -> viewer gets GLB bytes, plan and info re-render. Mode `floor` slices the 3D view to the selected floor's y range and shows the plan.

## Invariants

- No business logic: the plan renders `FloorInterior` and `NpcSupport` data as-is; paths come from the npc box `findPath`.
- Square corners everywhere; dark neutral palette.

## Depends on

- ../core/CONTRACT.md (types), root CONTRACT.md surface (`generateInterior`, `makeFixture`, `findPath`)
- three.js (viewer only)
