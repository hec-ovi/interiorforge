import { Ajv2020 } from "ajv/dist/2020.js";
import type { Document } from "@gltf-transform/core";
import requestSchema from "../../schemas/request.schema.json" with { type: "json" };
import blueprintSchema from "../../schemas/blueprint.schema.json" with { type: "json" };
import { InteriorError } from "../core/errors.js";
import { edgeLength, isCcw, polygonArea, polygonBounds } from "../core/geom.js";
import { createRng, type Rng } from "../core/rng.js";
import type { BuildingType, FloorAssignment, FloorKind, InteriorRequest } from "../core/types.js";
import { sceneBounds } from "../glb/io.js";

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
  if (!floors.some((f) => f.index === 0)) {
    throw new InteriorError("E_BLUEPRINT_INVALID", "blueprint has no ground floor (index 0)");
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
    validateOpenings(floor.outline, floor.openings, floor.height, floor.index);
  });
}

function validateOpenings(
  outline: InteriorRequest["blueprint"]["floors"][number]["outline"],
  openings: InteriorRequest["blueprint"]["floors"][number]["openings"],
  floorHeight: number,
  floor: number,
): void {
  const byEdge = new Map<number, { start: number; end: number; id: string }[]>();
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
    const list = byEdge.get(o.edge) ?? [];
    for (const other of list) {
      if (o.offset < other.end && other.start < o.offset + o.width) {
        throw new InteriorError("E_BLUEPRINT_INVALID", `openings ${other.id} and ${o.id} overlap on edge ${o.edge}`, floor);
      }
    }
    list.push({ start: o.offset, end: o.offset + o.width, id: o.id });
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

/** Assignments win when provided; otherwise each floor derives from its blueprint kind slug,
 *  falling back to the building type for unknown slugs. Deterministic. */
export function resolveAssignments(request: InteriorRequest): FloorAssignment[] {
  if (request.assignments) return request.assignments;
  const rng = createRng(request.seed, "assignments");
  return request.blueprint.floors.map((floor) => ({
    floor: floor.index,
    kind: kindFromSlug(floor.kind, request.building.type, floor.index, rng),
  }));
}

/** Exterior emits the atlas parcel type verbatim on every typed floor, plus lobby, entry,
 *  basement, bar and executive. Each slug picks its program, so a mixed building gets a real
 *  restaurant, shop or mall floor whatever its overall type is. */
const SLUG_KIND: Record<string, FloorKind> = {
  lobby: "lobby", entry: "lobby",
  offices: "office", office: "office", corpo: "corpo_office", corpo_office: "corpo_office",
  executive: "corpo_office",
  hospital: "office", clinic: "office", police: "office", military: "office",
  factory: "mechanical", mechanical: "mechanical",
  restaurant: "restaurant", bar: "restaurant",
  coffee: "coffee_shop", coffee_shop: "coffee_shop", cafe: "coffee_shop",
  commerce: "retail", mall: "mall_floor",
  gym: "gym", hotel: "hotel_rooms", hotel_rooms: "hotel_rooms", residence_studio: "residence_studio",
  apartment: "apartment", basement: "parking", parking: "parking",
  terrace: "terrace", roof: "terrace",
};

function kindFromSlug(slug: string, type: BuildingType, floor: number, rng: Rng): FloorKind {
  if (slug === "residential") return rng.next() < 0.35 ? "residence_studio" : "apartment";
  const known = SLUG_KIND[slug];
  if (known) return known;
  if (floor < 0) return "parking";
  if (floor === 0) return "lobby";
  switch (type) {
    case "residential": return "apartment";
    case "hotel": return "hotel_rooms";
    case "corpo": return "corpo_office";
    case "factory": return "mechanical";
    case "commerce": return "retail";
    case "mall": return "mall_floor";
    case "coffee_shop": return "coffee_shop";
    case "restaurant": return "restaurant";
    default: return "office"; // offices and institutional parcels
  }
}

const SHELL_XZ_TOLERANCE = 0.75;
const SHELL_TOP_TOLERANCE = 0.5;

export function validateShell(request: InteriorRequest, shellDoc: Document): void {
  const { min, max } = sceneBounds(shellDoc);
  let bpMinX = Infinity, bpMinZ = Infinity, bpMaxX = -Infinity, bpMaxZ = -Infinity;
  for (const floor of request.blueprint.floors) {
    const b = polygonBounds(floor.outline);
    bpMinX = Math.min(bpMinX, b.x);
    bpMinZ = Math.min(bpMinZ, b.z);
    bpMaxX = Math.max(bpMaxX, b.x + b.w);
    bpMaxZ = Math.max(bpMaxZ, b.z + b.d);
  }
  if (
    min[0] > bpMinX + SHELL_XZ_TOLERANCE || min[2] > bpMinZ + SHELL_XZ_TOLERANCE ||
    max[0] < bpMaxX - SHELL_XZ_TOLERANCE || max[2] < bpMaxZ - SHELL_XZ_TOLERANCE
  ) {
    throw new InteriorError("E_SHELL_MISMATCH", "shell footprint does not contain the blueprint footprint");
  }
  const top = request.blueprint.floors.at(-1)!;
  if (max[1] < top.elevation + top.height - SHELL_TOP_TOLERANCE) {
    throw new InteriorError("E_SHELL_MISMATCH", `shell height ${max[1].toFixed(2)} below top floor ${(top.elevation + top.height).toFixed(2)}`);
  }
}
