import { Ajv2020 } from "ajv/dist/2020.js";
import requestSchema from "../../schemas/request.schema.json" with { type: "json" };
import blueprintSchema from "../../schemas/blueprint.schema.json" with { type: "json" };
import { InteriorError } from "../core/errors.js";
import { edgeLength, isCcw, polygonArea } from "../core/geom.js";
import { createRng } from "../core/rng.js";
import type { BuildingType, FloorAssignment, FloorKind, InteriorRequest } from "../core/types.js";
import { validateWindowGlazing } from "./validate-glazing.js";
import { validatePocketDoors } from "./validate-pocket.js";

const ajv = new Ajv2020({ allErrors: false, strict: false });
ajv.addSchema(blueprintSchema);
const checkRequest = ajv.compile(requestSchema);

const ELEVATION_TOLERANCE = 0.02;

export function validateRequest(input: unknown): InteriorRequest {
  if (!checkRequest(input)) {
    const err = checkRequest.errors?.[0];
    throw new InteriorError("E_BLUEPRINT_INVALID", `schema: ${err?.instancePath ?? ""} ${err?.message ?? "invalid"}`);
  }
  const request = input as unknown as InteriorRequest;
  validateBlueprint(request);
  validateAssignments(request);
  return request;
}

function validateBlueprint({ blueprint }: InteriorRequest): void {
  const floors = blueprint.floors;
  const base = floors[0]!.index;
  // A published stack may start above zero; its lowest above-ground floor is the ground.
  if (!floors.some((f) => f.index >= 0)) {
    throw new InteriorError("E_BLUEPRINT_INVALID", "blueprint has no floor at or above index 0");
  }
  floors.forEach((floor, i) => {
    if (floor.index !== base + i) {
      throw new InteriorError("E_BLUEPRINT_INVALID", `floor indices must be contiguous ascending, got ${floor.index} at position ${i}`);
    }
    if (i > 0) {
      const prev = floors[i - 1]!;
      const expected = prev.elevation + prev.height;
      if (Math.abs(floor.elevation - expected) > ELEVATION_TOLERANCE) {
        throw new InteriorError("E_BLUEPRINT_INVALID", `elevation ${floor.elevation} does not continue floor ${prev.index} (expected ${expected})`, floor.index);
      }
    }
    if (!isCcw(floor.outline)) {
      throw new InteriorError("E_BLUEPRINT_INVALID", "outline must be CCW with positive area", floor.index);
    }
    if (polygonArea(floor.outline) < 9) {
      throw new InteriorError("E_BLUEPRINT_INVALID", "outline area below 9 m2", floor.index);
    }
    validateOpenings(floor.outline, floor.openings, floor.height, floor.index, blueprint.facade?.wallDepth);
    validatePocketDoors(floor, blueprint.facade?.wallDepth);
  });
}

function validateOpenings(
  outline: InteriorRequest["blueprint"]["floors"][number]["outline"],
  openings: InteriorRequest["blueprint"]["floors"][number]["openings"],
  floorHeight: number,
  floor: number,
  wallDepth: number | undefined,
): void {
  const byEdge = new Map<number, { start: number; end: number; bottom: number; top: number; id: string }[]>();
  for (const o of openings) {
    if (o.edge >= outline.length) {
      throw new InteriorError("E_BLUEPRINT_INVALID", `opening ${o.id} references edge ${o.edge} of ${outline.length}`, floor);
    }
    const len = edgeLength(outline, o.edge);
    if (o.offset + o.width > len + 1e-6) {
      throw new InteriorError("E_BLUEPRINT_INVALID", `opening ${o.id} exceeds its edge (${o.offset}+${o.width} > ${len.toFixed(2)})`, floor);
    }
    if (o.sill + o.height > floorHeight + 1e-6) {
      throw new InteriorError("E_BLUEPRINT_INVALID", `opening ${o.id} taller than the floor`, floor);
    }
    validateWindowGlazing(o, wallDepth, floor);
    if (o.kind === "openFront") {
      if (floor !== 0 || o.sill !== 0) {
        throw new InteriorError("E_BLUEPRINT_INVALID", `open front ${o.id} must start at street level on floor 0`, floor);
      }
      const portal = o.portal!; // required by the consumer schema for openFront
      if (portal.clearWidth > o.width + 1e-6 || portal.clearHeight > o.height + 1e-6) {
        throw new InteriorError("E_BLUEPRINT_INVALID", `open front ${o.id} clear dimensions exceed its wall opening`, floor);
      }
    }
    const list = byEdge.get(o.edge) ?? [];
    for (const other of list) {
      if (o.offset < other.end - 1e-6 && other.start < o.offset + o.width - 1e-6
        && o.sill < other.top - 1e-6 && other.bottom < o.sill + o.height - 1e-6) {
        throw new InteriorError("E_BLUEPRINT_INVALID", `openings ${other.id} and ${o.id} overlap on edge ${o.edge}`, floor);
      }
    }
    list.push({ start: o.offset, end: o.offset + o.width, bottom: o.sill, top: o.sill + o.height, id: o.id });
    byEdge.set(o.edge, list);
  }
}

function validateAssignments({ blueprint, assignments }: InteriorRequest): void {
  if (!assignments) return; // derived later via resolveAssignments
  const base = blueprint.floors[0]!.index;
  const covered = new Array<boolean>(blueprint.floors.length).fill(false);
  for (const a of assignments) {
    const spans = a.spans ?? 1;
    for (let f = a.floor; f < a.floor + spans; f++) {
      const slot = f - base;
      if (slot < 0 || slot >= covered.length) {
        throw new InteriorError("E_ASSIGNMENT_INVALID", `assignment at floor ${a.floor} lies outside the blueprint floors`);
      }
      if (covered[slot]) {
        throw new InteriorError("E_ASSIGNMENT_INVALID", `floor ${f} assigned more than once`);
      }
      covered[slot] = true;
    }
  }
  const missing = covered.indexOf(false);
  if (missing !== -1) {
    throw new InteriorError("E_ASSIGNMENT_INVALID", `floor ${missing + base} has no assignment`);
  }
}

/** Assignments win when provided; otherwise each floor derives from its blueprint kind slug.
 *  A slug that names no program of its own takes the parcel's: a shared plan's dressing class
 *  (`commerce`, `residential`), the parcel type Exterior repeats on every typed floor, and the
 *  entrance hall (`lobby`, `entry`) at street level. Deterministic. */
export function resolveAssignments(request: InteriorRequest): FloorAssignment[] {
  if (request.assignments) return request.assignments;
  const type = request.building.type;
  const ground = Math.min(...request.blueprint.floors.map((floor) => floor.index).filter((index) => index >= 0));
  // A home building is studios or apartments throughout, drawn once so its floors share a layout.
  let home: FloorKind | undefined;
  const program = (level: 0 | 1): FloorKind => {
    const kind = PARCEL_PROGRAM[type][level];
    if (kind !== "apartment") return kind;
    home ??= createRng(request.seed, "assignments").next() < 0.35 ? "residence_studio" : "apartment";
    return home;
  };
  return request.blueprint.floors.map((floor) => {
    const slug = floor.kind, level = floor.index === ground ? 0 : 1;
    if (floor.index < 0) return { floor: floor.index, kind: SLUG_KIND[slug] ?? "parking" };
    const generic = GENERIC_SLUGS.has(slug) || slug === type || (level === 0 && ENTRY_SLUGS.has(slug));
    // exterior's generic venue slug: a shop floor is the venue its parcel names
    const kind = generic ? program(level) : slug === "shop" ? VENUE_BY_TYPE[type] ?? "retail" : SLUG_KIND[slug] ?? program(level);
    return { floor: floor.index, kind };
  });
}

/** Each parcel type's own program: at street level, and on every floor above it. A venue
 *  opens at street level with offices above; a mall and a factory fill every floor. */
export const PARCEL_PROGRAM: Record<BuildingType, readonly [FloorKind, FloorKind]> = {
  residential: ["lobby", "apartment"], hotel: ["lobby", "hotel_rooms"],
  offices: ["lobby", "office"], corpo: ["lobby", "corpo_office"],
  hospital: ["lobby", "office"], clinic: ["lobby", "office"], police: ["lobby", "office"], military: ["lobby", "office"],
  factory: ["mechanical", "mechanical"], mall: ["mall_floor", "mall_floor"],
  commerce: ["retail", "office"], restaurant: ["restaurant", "office"], coffee_shop: ["coffee_shop", "office"],
};

/** A shared plan's dressing classes: they say what the shell looks like, not what it holds. */
const GENERIC_SLUGS: ReadonlySet<string> = new Set(["commerce", "residential"]);
const ENTRY_SLUGS: ReadonlySet<string> = new Set(["lobby", "entry"]);

/** Slugs that name a program of their own, whatever the parcel is: a restaurant, bar or gym
 *  floor in a hotel, an executive floor, a basement car park, a roof terrace. */
const SLUG_KIND: Record<string, FloorKind> = {
  lobby: "lobby", entry: "lobby",
  offices: "office", office: "office", corpo: "corpo_office", corpo_office: "corpo_office",
  executive: "corpo_office",
  hospital: "office", clinic: "office", police: "office", military: "office",
  factory: "mechanical", mechanical: "mechanical",
  restaurant: "restaurant", bar: "restaurant",
  coffee: "coffee_shop", coffee_shop: "coffee_shop", cafe: "coffee_shop",
  mall: "mall_floor",
  gym: "gym", hotel: "hotel_rooms", hotel_rooms: "hotel_rooms", residence_studio: "residence_studio",
  apartment: "apartment", basement: "parking", parking: "parking",
  terrace: "terrace", roof: "terrace",
};

/** Maps a generic `shop` floor to the venue named by its parcel type. */
const VENUE_BY_TYPE: Partial<Record<BuildingType, FloorKind>> = {
  restaurant: "restaurant", coffee_shop: "coffee_shop", mall: "mall_floor", commerce: "retail",
};
