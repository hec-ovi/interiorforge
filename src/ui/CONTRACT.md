# CONTRACT: ui

Purpose: renders the generated building, one-floor inspection, room details and walk-path checks in a browser.

Status: implemented at 0.28.1. Run with `npm run preview`.

## Inputs

- `mountApp(root: HTMLElement, viewer: Viewer3D) -> AppState`: mounts the preview and starts one fixture generation with `{ seed: 1, floors: 12, basements: 1, type: "offices", tier: "mid" }`.
- `Viewer3D`: `{ el: HTMLElement, setGlb(Uint8Array): Promise<void>, setFloorSlice({ y0, y1 } | null): void, setLights(readonly LightFixture[] | null): void, standIn([x, z], eyeY, headingDeg): void }`. Tests inject this interface; `createViewer3d() -> Viewer3D` supplies the Three.js implementation.
- `createControls(state, onGenerate, onLoadFiles, onStandIn) -> HTMLElement`: emits fixture `AppParams`, a selected `File[]`, or an eye-view request. A building load requires a shell `.glb` and blueprint `.json`; an exterior request `.json` supplies type, tier and theme when present.
- `createPlanView(state) -> HTMLElement`: a room click selects it. Two shift-clicks request a same-floor path.
- `showToast({ type?, title?, message, duration? }) -> () => void`: renders one dismissible notice and returns its dismiss function.

`InteriorResult` follows the [root contract](../../CONTRACT.md); its floor and NPC data follow the [floor schema](../../schemas/floor.schema.json) and [NPC schema](../../schemas/npc.schema.json). `AppParams` uses the root `BuildingType` and `Tier` unions.

## Outputs

- `AppState`: `{ params, result, mode, floorIndex, selectedRoom, path, busy }` plus setters, `floorData()` and event subscriptions.
- Building mode gives the viewer the complete GLB. Floor mode clips it to the selected floor, instantiates that floor's lights, renders rooms, doors, furniture, anchors and the selected path, and exposes selected-room details.
- Eye view calls `standIn` at 1.65 m above the selected floor, centered in the selected room or the largest room.

## Events

- State subscriptions use the closed names `result | mode | floor | selection | path | busy` and receive `() => void`.
- Controls emit `onGenerate(AppParams)`, `onLoadFiles(File[])` and `onStandIn()`.
- Plan selection emits `selection`; a completed path pick emits `path` with `PathLeg[] | null`.

## Errors

The UI contains browser failures and renders one of these closed outcomes:

- `Generation Failed`: fixture generation, material resolution or viewer GLB loading failed. The message is the caught error message.
- `Load Failed`: selected files are incomplete, invalid, or fail parsing, generation or viewer loading. The message is the caught error message.
- `Preview Failed`: Three.js import or viewer startup failed. The message is the caught error message.
- `Unreachable`: `findPath` returned `null`; this is a path result, not an exception.

A material theme request that is unavailable yields key-only rendering.

## Invariants

- Presentation code calls [root generation](../../CONTRACT.md) and [NPC pathfinding](../npc/CONTRACT.md); it contains no layout or simulation rules.
- The plan renders [floor](../../schemas/floor.schema.json) and [NPC](../../schemas/npc.schema.json) data without changing them.
- Generated and loaded GLBs reach the viewer through `setGlb`. Busy state clears on success and failure.
- Form controls and toast dismissal use keyboard-accessible native elements. All UI elements have square corners.

## Dependencies

- [root contract](../../CONTRACT.md)
- [core contract](../core/CONTRACT.md)
- [glb contract](../glb/CONTRACT.md)
- [materials contract](../materials/CONTRACT.md)
- [npc contract](../npc/CONTRACT.md)
- Three.js 0.185, DOM, WebGL, `ResizeObserver`, Vite
