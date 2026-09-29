import type { Point } from '../../core/geom.js';
import type {
    BlueprintFloor, FloorInterior, FloorKind, Furniture, InteriorRequest, LevelZone, LightFixture, ReferenceKind, Room, RoomKind, StyleId, Tier,
} from '../../core/types.js';
import type { CorePlan } from '../../layout/core-plan.js';
import type { UvFloorData } from '../../layout/plan-floor.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { RoomFinish } from '../../placements/finish.js';
import type { Placement } from '../../placements/types.js';

/** Types of the reference style layer: one `StyleSpec` per reference style and the generic
 *  parametric systems (panel walls, glazing, ceilings, floors, portals, runs, kitchen walls,
 *  housings, planters, levels) the kinds describe themselves with. Specs are data; the
 *  placers live beside this file, one per system, and the registry
 *  (`styles/reference/registry.ts`) maps marker ids to specs.
 *
 *  Naming (each prefix has a consumer side effect, see the placement CONTRACT):
 *  `wall-field-<sid>` panel marker and plain backing, `wall-panel-<sid>-*` columns,
 *  `wall-light-line-<sid>` lit joints, `ceiling-field-<sid>` ceiling marker,
 *  `ceiling-<sid>-*` ceiling pieces, `ceiling-cove-<sid>-*` every lens, `floor-slab-<sid>`
 *  floor marker, `floor-slab-<sid>-support|pit-*|platform|tread`, `floor-finish-<sid>-*`,
 *  `door-jamb-<sid>`/`door-header-<sid>` casings, `wall-portal-<pid>-*`/`door-header-<pid>`
 *  portals, `lift-landing-jamb-<sid>`/`lift-landing-header-<sid>`, `fit-<sid>-*` assembly
 *  pieces, `housing-<sid>-*`, `trim-<sid>-*`, `wall-screen-<sid>-*`. */

export type { StyleId, ReferenceKind, LevelZone };

/** A lit joint or lens line: an emissive module and its light record of the same id. */
export interface LitJoint {
    module: string;
    /** metres above the floor, or the head/foot band of the system it belongs to */
    y: number | 'head' | 'foot';
    facing: 'up' | 'down';
    lumensPerMetre: number;
    kelvin: number;
    color?: [number, number, number];
    /** how far the lens stands proud of the face it runs on */
    proud: number;
}

/** What a style's dress pass sees: the floor after walls, surfaces and props, before the
 *  room lights are balanced. */
export interface DressContext {
    builder: PlacementBuilder;
    floor: FloorInterior;
    uv: UvFloorData;
    core: CorePlan;
    bp: BlueprintFloor;
    request: InteriorRequest;
    /** the published rooms of this floor wearing the style */
    rooms: Room[];
    /** floor-relative ceiling plane */
    ceilingY: number;
    frame: Frame;
}

/** One reference style: the finish, furniture fits, lights and dressing of one reference
 *  interior. Every hook is optional except `finish`; the family code is the fallback. */
export interface StyleSpec {
    id: StyleId;
    kind: ReferenceKind;
    tier: Tier;
    /** the room's surfaces: marker ids (`wall-field-<sid>`, `floor-slab-<sid>`,
     *  `ceiling-field-<sid>`) route to the systems, plus casing/portal/glazing ids */
    finish(room: RoomKind, floorKind: FloorKind, base: RoomFinish): RoomFinish;
    /** a `fit-*` module the piece stands as at its canonical size, or null for the family chain */
    fit?(item: Furniture, room: Room): string | null;
    lights?: { plannedCoves: boolean; kelvin?: number; color?: [number, number, number]; spot?: string; cove?: string };
    /** lift landing surround; same bounds as `lift-landing-jamb` / `lift-landing-header` */
    lift?: { jamb: string; header: string };
    /** apartment entrance kit; the tier's default when absent */
    entrance?: 'luxury' | 'capsule' | 'damaged';
    /** PanelSystem id a common room wears on runs it shares with a dwelling (unit frontage) */
    frontage?: string;
    /** HousingSpec ids placed over this style's doors, portals or runs */
    housings?: string[];
    /** housings, trims, signage; runs before the room lights are balanced */
    dress?(ctx: DressContext): LightFixture[];
}

/** One room's face of one wall run, as the wall systems see it. `t` runs along the wall
 *  line in core-frame metres (u on an H line, v on a V line); y is floor-relative. */
export interface WallFace {
    readonly builder: PlacementBuilder;
    readonly room: string;
    readonly kind: RoomKind;
    readonly axis: 'H' | 'V';
    /** the line's coordinate across its axis (v on an H line, u on a V line) */
    readonly c: number;
    /** which side of the line the room lies on */
    readonly side: 1 | -1;
    readonly frame: Frame;
    /** rotationY every piece of this face stands at; local +z points into the room */
    readonly rotation: number;
    /** +1 when piece-local +x runs with increasing t, -1 when against it */
    readonly along: 1 | -1;
    /** height of this run: floor to its top (a stair wall reaches the storey) */
    readonly height: number;
    /** floor-relative finished ceiling plane */
    readonly ceilingY: number;
    /** floor elevation; light records are building-local */
    readonly elevation: number;
    /** construction grid origin along t, for phase 'grid' */
    readonly gridOrigin: number;
    /** floor-relative world position of a point on the face, `proud` metres into the room */
    at(t: number, y: number, proud?: number): [number, number, number];
    /** one module standing on the face at t (centre along the run), y (its base) */
    piece(module: string, t: number, y: number, scale: [number, number, number], extra?: { id?: string; proud?: number }): Placement;
    /** a fresh light/placement id for a lens and its record */
    nextId(): string;
    /** light records of this floor's walls; push lens records here */
    readonly lights: LightFixture[];
}

/** A panel wall: the nine-slice rule on the construction module. Registry key = the marker
 *  field id `wall-field-<sid>`, itself a valid plain field for leftovers and stairs. */
export interface PanelSystem {
    id: string;
    /** stretched x/y behind the columns, depth 0..0.088 */
    backing: string;
    /** repeating column widths; multiples of 0.5 unless `exact` */
    pitch: number[];
    exact?: boolean;
    phase: 'grid' | 'centred';
    /** height of the baked lower column (all fixed seams) */
    rows: number;
    /** module id of a full column 0..rows of this width: bevels, seams, fixings baked, unscaled */
    column(width: number): string;
    /** module id of the rows..head piece of this width, stretched in y only */
    top(width: number): string;
    /** clipped column skin, stretched x and y */
    fill: string;
    /** bevel strip at a cut side, stretched y */
    edge?: string;
    /** gap between columns (column width = pitch - seam) */
    seam: number;
    /** recessed band to the ceiling, stretched x */
    head?: { height: number; module: string; lens?: LitJoint };
    /** null = no skirting */
    foot?: { height: number; module: string } | null;
    litJoints?: LitJoint[];
    /** clipped columns narrower than this become fill */
    minColumn: number;
}

/** Profile a panel system's modules are drawn from (`panelRecipes`). */
export interface PanelProfile {
    /** material slot of the panel skin */
    skin: string;
    /** material slot of the backing */
    backing?: string;
    bevel: { radius: number; segments: number };
    seams: { y: number; width: number; slot: string }[];
    fixings?: { inset: [number, number]; radius: number; slot: string; pairs: number };
    /** [backing face, panel face] depth from the partition line */
    depth: [number, number];
    head?: { slot: string; depth: number };
    foot?: { slot: string; depth: number };
}

export interface GlazingSystem {
    id: string;
    pitch: number;
    mullion: { module: string; width: number };
    transoms: number[];
    frosting?: { y0: number; y1: number; module: string };
    base?: { height: number; module: string };
    rooms: RoomKind[];
    onto: RoomKind[];
}

/** A ceiling: registry key = the marker ceiling id `ceiling-field-<sid>`, a valid plain field. */
export interface CeilingSystem {
    id: string;
    backing: string;
    grid: {
        pitch: [number, number];
        /** baked multi-cell module */
        block: string;
        blockCells: [number, number];
        joint: number;
        phase: 'grid' | 'room-centre';
    };
    perimeter?: { width: number; drop: number; edge: string; corner: string; lens?: LitJoint };
    coffers?: { size: [number, number]; rise: number; edge: string; corner: string; lens?: LitJoint };
    steps?: { inset: number; drop: number; fascia: string; lens?: LitJoint }[];
    fields?: { every: number; module: string; lumens: number };
    /** move the room's planned spot records to grid-cell centres */
    snapSpots: boolean;
}

/** A floor: registry key = the marker slab id `floor-slab-<sid>`, a valid plain slab. */
export interface FloorSystem {
    id: string;
    /** `floor-slab-<sid>-support`, top 2 mm below Y0, one per rectangle */
    support: string;
    tile: { size: [number, number]; joint: number; block: string; blockTiles: [number, number]; phase: 'grid' | 'room' };
    border?: { width: number; module: string; inlay?: { width: number; module: string } };
    pit?: PitSpec;
}

export interface PitSpec {
    size: [number, number];
    radius: number;
    depth: number;
    straight: string;
    end: string;
    rim: string;
    lens: { color: [number, number, number]; lumensPerMetre: number };
}

export interface PortalSpec {
    id: string;
    radius: number;
    band: number;
    depth: [number, number];
    slot?: { base: number; height: number; width: number; lit?: LitJoint };
    reveal?: { lit: boolean; color?: [number, number, number] };
    /** outer PortalSpec ids placed concentrically */
    layers?: string[];
    rooms: RoomKind[];
    minWidth: number;
    minHeight: number;
    skin: { face: string; reveal: string; ret: string };
}

/** A straight built-in run: fixed ends, a stretched middle, fixed-pitch repeats, a filler. */
export interface RunSpec {
    start?: string;
    mid: string;
    end?: string;
    repeat?: { module: string; pitch: number };
    filler: string;
    height: number;
    depth: number;
}

export type KitchenBayRole = 'door' | 'drawers' | 'sink' | 'hob' | 'display';

/** An embedded kitchen wall: fixed bays, stretched fillers and a bulkhead to the ceiling. */
export interface KitchenWallSpec {
    /** carcass pitch, e.g. 0.6 */
    bay: number;
    toe: { height: number; setback: number; module: string };
    base: { height: number; depth: number; bays: Record<KitchenBayRole, string>; filler: string; endPanel: string; endWidth: number };
    /** bay roles in order, anchored so the sink sits under a window within the run */
    pattern: KitchenBayRole[];
    worktop: { top: number; thickness: number; depth: number; lip: number; slab: string; sinkCut: string; hobCut: string };
    backsplash: { height: number; panels: number[]; module: string; pull?: string };
    uppers: { bottom: number; height: number; tiers: { depth: number; bays: string[] }[]; underLens: string };
    /** from the uppers' top to the ceiling, stretched x/y */
    bulkhead: { module: string };
    column?: { width: number; depth: number; modules: { stack: string[]; screen: string } };
    lens: { y: number; z: number; lumensPerMetre: number; color?: [number, number, number] };
}

export interface HousingSpec {
    id: string;
    body: string;
    cap: string;
    insert?: { module: string; pitch: number };
    over: 'doors' | 'portals' | 'runs';
    depth: number;
    height: number;
    /** lowest underside, at least 2.1 m */
    minBottom: number;
    lens?: LitJoint;
}

export interface PlanterSpec {
    end: string;
    body: string;
    soil: string;
    /** planted 1 m bay */
    bay: string;
    height: number;
}

/** Places one built-in in the item's local frame (x across, +z front, origin at the record
 *  centre); returns the light records of its lenses. */
export type AssemblyPlacer = (builder: PlacementBuilder, floor: FloorInterior, item: Furniture, ceilingY: number) => LightFixture[];

export type AssemblySpec =
    | { type: 'kitchen'; spec: KitchenWallSpec }
    | { type: 'run'; spec: RunSpec }
    | { type: 'planter'; spec: PlanterSpec }
    | { type: 'custom'; place: AssemblyPlacer };

/** A room as the surface systems see it: uv geometry of the whole room, so fragments of
 *  one room keep one phase. */
export interface SurfaceRoom {
    id: string;
    kind: RoomKind;
    style?: StyleId;
    /** uv polygon of the whole room */
    polygon: Point[];
    holes?: Point[][];
    /** uv bounds of the whole room */
    bounds: UvRect;
    /** construction grid origin (uv) */
    gridOrigin: Point;
    /** floor-relative ceiling plane of the storey (before the room's ceilingDrop) */
    ceilingY: number;
    /** floor-relative underside of the slab above: coffers rise at most to this minus 0.15 */
    soffitY: number;
    /** floor elevation: light records are building-local, placements floor-relative */
    elevation: number;
    /** raised or sunken zones, uv polygons */
    levels?: LevelZone[];
    ceilingDrop?: number;
}

/** Everything one reference kind contributes, as data; the registry merges the four. */
export interface KindExports {
    kind: ReferenceKind;
    styles: StyleSpec[];
    panels: PanelSystem[];
    glazing: GlazingSystem[];
    ceilings: CeilingSystem[];
    floors: FloorSystem[];
    portals: PortalSpec[];
    /** keyed by the furniture fit id `asm-<sid>-<name>` */
    assemblies: Record<string, AssemblySpec>;
    housings: HousingSpec[];
    /** module recipe sets this kind draws; merged into the shared catalog */
    recipes: RecipeSet[];
}
