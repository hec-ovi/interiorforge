# CONTRACT: ui

Purpose: renders the generated building, one-floor inspection, room details and walk-path checks in a browser.

Status: implemented at 0.30.0. Run with `npm run preview`.

## Inputs

- `mountApp(root: HTMLElement, viewer: Viewer3D, sampleName?: string) -> AppState`: mounts the preview and starts one fixture generation with `{ seed: 1, floors: 12, basements: 1, type: "offices", tier: "mid" }`. Optional `luxury` loads the [JSON sample](samples/CONTRACT.md), selects its residence and starts at eye height. The browser reads this choice from `?sample=luxury`.
- `npm run preview`: serves ignored normalized interior models at `/interior-assets/<filename>` so locally licensed imports can appear in generated preview buildings.
- `Viewer3D`: `{ el: HTMLElement, setGlb(Uint8Array): Promise<void>, setFloorSlice({ y0, y1 } | null): void, setLights(readonly LightFixture[] | null): void, standIn([x, z], eyeY, headingDeg): void }`. Tests inject this interface; `createViewer3d() -> Viewer3D` supplies the Three.js implementation.
- `createControls(state, onGenerate, onLoadFiles, onStandIn) -> HTMLElement`: emits fixture `AppParams`, a selected `File[]`, or an eye-view request. A building load requires a shell `.glb` and blueprint `.json`; an exterior request `.json` supplies type, tier and theme when present.
- `createPlanView(state) -> HTMLElement`: a room click selects it. Two shift-clicks request a same-floor path.
- `createSampleTour(title, views, onSelect) -> HTMLElement`: renders one button per JSON view title, emitting its index. The controller disables it while busy and hides it when another building is generated or loaded.
- `showToast({ type?, title?, message, duration? }) -> () => void`: renders one dismissible notice and returns its dismiss function.

`InteriorResult` follows the [root contract](../../CONTRACT.md); its floor and NPC data follow the [floor schema](../../schemas/floor.schema.json) and [NPC schema](../../schemas/npc.schema.json). `AppParams` uses the root `BuildingType` and `Tier` unions.

## Outputs

- `AppState`: `{ params, result, mode, floorIndex, selectedRoom, path, busy }` plus setters, `floorData()` and event subscriptions.
- Building mode gives the viewer the complete GLB. Floor mode clips it to the selected floor, instantiates that floor's lights, renders rooms, doors, furniture, anchors and the selected path, and exposes selected-room details.
- Eye view calls `standIn` at 1.65 m above the selected floor, centered in the selected room or the largest room. Its slice includes the published finished ceiling, including double-height rooms. The floor selector follows both manual and sample selection.

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

Fixture preview uses linear RGB when supplied, world lens axes and normals, inverse-square falloff, shadowed spot samples and AgX tone mapping at 1.05 exposure. It reserves 12 GPU texture units for materials, then fits up to 12 shadow samples. Nearby fixtures receive one source each before spare samples refine long lenses. Selected-fixture flux stays constant. A room environment at 0.5 intensity and 0.15 interior fill make material surfaces readable, with no unoccluded sun. This environment is preview illumination, not exported lighting or a baked-light solution.

The floor plan draws square NPC body slots and their approach lines from `npc.placements`; tooltips identify vendor, staff and unassigned story positions.
