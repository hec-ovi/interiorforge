import type { Point } from "../../core/geom.js";
import type { FloorKind, FurnitureKind, RoomKind } from "../../core/types.js";
import type { EdgeName, PlanRoom } from "../plan-types.js";
import type { ProgramChange } from "../service-program.js";
import type { UvRect } from "../uv.js";

/** Authored parametric spaces: one reference apartment, lobby, office or capsule home,
 *  described in a local frame and fitted into whatever floor rectangle the allocators
 *  hand over. Dimensions only: no image ids, notes or file names ever live here.
 *
 *  Local frame: v = 0 is the entry wall (the public side), v grows into the space and
 *  u runs along the entry wall. Values are metres. */

import type { ReferenceKind, StyleId, TemplateKey } from "../../core/types.js";
import type { PublicSlot } from "../../styles/reference/kinds.js";
export type { PublicSlot, ReferenceKind, StyleId, TemplateKey };
export type Axis = "u" | "v";

export const TEMPLATE_KEYS: readonly TemplateKey[] = ["e1-apartment", "e2-floor", "e5-lobby2", "e6-apartment2",
  "b1-floor", "b2-suite", "b3-apartment", "b4-loft", "c1-capsule", "c2-corridors", "c3-poor", "c4-bathroom",
  "c5-machine", "c6-studio", "c7-room", "r1-office"];
export const STYLE_IDS: readonly StyleId[] = ["e1", "e2", "e5", "e6", "b1", "b2", "b3", "b4",
  "c1", "c2", "c3", "c4", "c5", "c6", "c7", "r1"];

/** A wall line of the template. `exact` keeps an off-grid reference value; `facade` is
 *  recomputed at fit time from the target (a partition meeting glass needs a legal seat). */
export interface TemplateLine { id: string; axis: Axis; ref: number; exact?: boolean; facade?: boolean }

/** The interval between two consecutive lines of one axis. `weight` 0 is rigid: the span
 *  keeps `ref` whenever the target allows it. `max` null (or absent) is unbounded. */
export interface TemplateSpan { from: string; to: string; min: number; max?: number | null; weight: number }

export interface LevelSpec {
  u: [string, string]; v: [string, string]; delta: number; edge: "step" | "guard" | "open";
  stair?: { along: Axis; at: number; width: number };
}

export interface TemplateRoom {
  id: string; kind: RoomKind; role?: string; style?: StyleId;
  /** bounding lines; absent only for the remainder */
  u?: [string, string]; v?: [string, string];
  /** exactly one per level: the envelope minus every other room */
  remainder?: boolean;
  level?: "lower" | "upper";
  /** lower drop numbers go first; the area joins `into` (default: the remainder) */
  optional?: { drop: number; into?: string };
  /** smallest clear size [along u, along v] the room may be solved to */
  minClear?: [number, number];
  keepouts?: { u: [string, string]; v: [string, string] }[];
  /** reference clear ceiling height of the room, metres; fitted into `ceilingDrop` */
  ceiling?: number;
  ceilingDrop?: number;
  levels?: LevelSpec[];
}

export interface TemplateDoor {
  id: string;
  /** room ids; '@public' is the common room the space opens onto */
  between: [string, string];
  width: number; leaves: 1 | 2 | 3 | 4; kind: "swing" | "pocket" | "portal" | "open";
  /** 0..1 along the fitted shared stretch, from the reference */
  along: number;
  owner?: string; portal?: string;
  /** a door that may be left out when its stretch is gone (the rooms stay connected otherwise) */
  optional?: boolean;
}

export type FixtureAlong = { line: string; offset: number } | { centred: true };

export interface TemplateFixture {
  id: string; room: string; kind: FurnitureKind;
  /** 'asm-<sid>-<name>' built-in assembly or 'fit-<module>' exact module */
  fit?: string;
  required: boolean;
  /** local wall of its room the piece backs onto */
  wall?: EdgeName | "free";
  along: FixtureAlong;
  /** [along its wall, depth, height] at rotation 0 (back to v0) */
  size: [number, number, number];
  rotationDeg: 0 | 90 | 180 | 270;
  elevation?: number;
  /** axes an assembly grows along with its wall (kitchen or bar length) */
  stretch?: Axis[];
  /** for 'free' pieces: offset of the centre from the room's low corner, local metres */
  at?: [number, number];
}

export interface SpaceTemplate {
  id: TemplateKey; version: 1; scope: "dwelling" | "public"; style: StyleId;
  use: { floorKinds: FloorKind[]; kinds: ReferenceKind[]; slot?: PublicSlot };
  envelope: { width: number; depth: number; min: [number, number]; max: [number, number] };
  entry: { room: string; door: string } | null;
  /** local edges that should lie on the facade; a target without them is skipped */
  daylight: ("v1" | "u0" | "u1")[];
  mirror: "allow" | "never";
  lines: TemplateLine[]; spans: TemplateSpan[];
  rooms: TemplateRoom[]; doors: TemplateDoor[]; fixtures: TemplateFixture[];
  twoLevel?: { voids: { u: [string, string]; v: [string, string] }[];
    stair: { u: [string, string]; v: [string, string]; run: Axis } };
  source?: { key: string; revision: string };
}

export type { AuthoredPiece } from "../plan-types.js";

/** The rectangle a template is fitted into, in the core (uv) frame. */
export interface TemplateTarget {
  rect: UvRect;
  /** exact ownership, CCW; may be notched by shafts */
  polygon: Point[];
  holes?: Point[][];
  /** edge of `rect` facing the public room */
  entryEdge: EdgeName;
  publicRoom: PlanRoom;
  /** rect edges lying on the plate boundary */
  facadeEdges: EdgeName[];
  /** whether a partition may meet the facade at this uv point (a legal pier/seat) */
  seatLegal(point: Point): boolean;
  gridOrigin: Point;
  /** entry door the allocator validated; the template keeps its width and prefers its place */
  entryDoor?: { width: number; leaves: 1 | 2 | 3 | 4; clearDepth?: number; at: Point };
}

export interface TemplateFit {
  rooms: PlanRoom[];
  mirrored: boolean;
  dropped: string[];
  changes: ProgramChange[];
  cost: number;
  /** true when every rigid span kept its reference value */
  exact: boolean;
}

/** Checks a candidate unit (core-frame rooms plus the public room) the way the floor will:
 *  facade seats, furnishing of required fixtures. False rejects the candidate. */
export type FitProbe = (rooms: PlanRoom[], template: SpaceTemplate) => boolean;
