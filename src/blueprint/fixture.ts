import type { Document } from "@gltf-transform/core";
import { createRng } from "../core/rng.js";
import type { Point } from "../core/geom.js";
import { edgeLength } from "../core/geom.js";
import type {
  Blueprint, BlueprintFloor, BuildingType, FloorAssignment, FloorKind,
  InteriorRequest, Opening, Tier,
} from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { appendToDocument, createDocument } from "../glb/io.js";

export interface FixtureOptions {
  seed?: number;
  /** above-ground floor count */
  floors?: number;
  /** basement levels below ground */
  basements?: number;
  width?: number;
  depth?: number;
  /** exact CCW footprint, e.g. a real city parcel; overrides width, depth and rotation */
  outline?: Point[];
  /** rotates the whole parcel in world space, like real city parcels */
  rotationDeg?: number;
  type?: BuildingType;
  tier?: Tier;
  theme?: string;
  /** exterior facade style; curtain-wall glazes every face in bays that hang slab to slab */
  facadeStyle?: "curtain-wall" | "glass" | "panel" | "megablock";
  /** measured shell wall depth written on the blueprint, as exterior 0.22 publishes it */
  wallDepth?: number;
}

export interface Fixture {
  request: InteriorRequest;
  shellDoc: Document;
}

/** Height by floor kind, jittered a little per floor; lobby and special floors run tall. */
const KIND_HEIGHT: Record<FloorKind, number> = {
  lobby: 4.0, mall_floor: 4.0, corpo_office: 3.8, restaurant: 3.6, retail: 3.6,
  office: 3.4, gym: 3.4, coffee_shop: 3.2, terrace: 3.0, hotel_rooms: 2.9, apartment: 2.8,
  residence_studio: 2.6, mechanical: 2.6, parking: 2.6,
};

export function makeFixture(options: FixtureOptions = {}): Fixture {
  const seed = options.seed ?? 1;
  const floorCount = options.floors ?? 12;
  const basements = options.basements ?? 0;
  const width = options.width ?? 26;
  const depth = options.depth ?? 20;
  const type = options.type ?? "offices";
  const tier = options.tier ?? "mid";
  const theme = options.theme ?? "cyberpunk";
  const facadeStyle = options.facadeStyle ?? "panel";

  const rng = createRng(seed, "fixture");
  const chamfer = Math.min(width, depth) * rng.range(0.15, 0.3);
  const flat: Point[] = [
    [0, 0], [width, 0], [width, depth - chamfer], [width - chamfer, depth], [0, depth],
  ];
  const rot = ((options.rotationDeg ?? 0) * Math.PI) / 180;
  const outline: Point[] = options.outline ?? flat.map(([x, z]) => [
    Math.round((x * Math.cos(rot) - z * Math.sin(rot)) * 100) / 100,
    Math.round((x * Math.sin(rot) + z * Math.cos(rot)) * 100) / 100,
  ]);

  const assignments = defaultAssignments(type, floorCount, basements);
  const kinds = new Map<number, FloorKind>();
  for (const a of assignments) {
    for (let f = a.floor; f < a.floor + (a.spans ?? 1); f++) kinds.set(f, a.kind);
  }

  const floors: BlueprintFloor[] = [];
  const heightOf = (index: number): number => {
    const floorRng = createRng(seed, "fixture-floor", index);
    return round2(KIND_HEIGHT[kinds.get(index)!] + floorRng.range(-0.1, 0.1));
  };
  const lowest = basements > 0 ? -basements : 0;
  let elevation = 0;
  for (let i = lowest; i < 0; i++) elevation -= heightOf(i);
  for (let i = lowest; i < floorCount; i++) {
    const kind = kinds.get(i)!;
    const height = heightOf(i);
    floors.push({
      index: i,
      kind,
      elevation: round2(elevation),
      height,
      outline,
      openings: i < 0 ? [] : facadeStyle === "curtain-wall"
        ? makeBays(outline, i, height)
        : makeOpenings(createRng(seed, "fixture-floor", i), outline, i, kind, height),
    });
    elevation += height;
  }

  const facade = { style: facadeStyle, ...(options.wallDepth !== undefined ? { wallDepth: options.wallDepth } : {}) };
  const blueprint: Blueprint = { buildingId: `fixture-${type}-${seed}`, facade, floors };
  const request: InteriorRequest = {
    seed,
    building: { id: blueprint.buildingId, type, tier },
    shellGlb: "fixtures/shell.glb",
    blueprint,
    assignments,
    materialTheme: theme,
  };
  return { request, shellDoc: buildShell(blueprint, theme, tier) };
}

function defaultAssignments(type: BuildingType, floorCount: number, basements: number): FloorAssignment[] {
  const out: FloorAssignment[] = [];
  for (let b = basements > 0 ? -basements : 0; b < 0; b++) out.push({ floor: b, kind: "parking" });
  out.push({ floor: 0, kind: "lobby" });
  const top = floorCount - 1;
  const residentialKind = (i: number): FloorKind => (i % 3 === 0 ? "residence_studio" : "apartment");
  for (let i = 1; i < top; i++) {
    if (type === "residential") out.push({ floor: i, kind: residentialKind(i) });
    else if (type === "hotel") out.push({ floor: i, kind: i === 1 ? "restaurant" : "hotel_rooms" });
    else if (type === "commerce") out.push({ floor: i, kind: "retail" });
    else if (type === "mall") out.push({ floor: i, kind: "mall_floor" });
    else if (i === 1 && floorCount > 4) out.push({ floor: i, kind: "restaurant" });
    else if (i === top - 1 && floorCount > 6) out.push({ floor: i, kind: "gym" });
    else out.push({ floor: i, kind: type === "corpo" ? "corpo_office" : "office" });
  }
  if (top > 0) out.push({ floor: top, kind: floorCount > 5 ? "coffee_shop" : "office" });
  return out;
}

function makeOpenings(
  rng: ReturnType<typeof createRng>, outline: Point[], floor: number, kind: FloorKind, floorHeight: number,
): Opening[] {
  const openings: Opening[] = [];
  let n = 0;
  for (let edge = 0; edge < outline.length; edge++) {
    const len = edgeLength(outline, edge);
    let cursor = 1.2;
    if (floor === 0 && edge === 0) {
      // lobby entrance: storefront triple door centered on the front edge
      const doorWidth = 2.7;
      openings.push({
        id: `f${floor}-entrance`, kind: "door", edge,
        offset: round2(len / 2 - doorWidth / 2), width: doorWidth,
        height: Math.min(2.8, floorHeight - 0.4), sill: 0,
      });
      continue;
    }
    const windowHeight = round2(Math.min(1.5, floorHeight - 1.4));
    while (cursor + 2.4 < len) {
      const w = round2(rng.range(1.4, 2.2));
      if (cursor + w + 1.0 > len) break;
      const isBalcony = kind === "apartment" && edge === 2 && openings.every((o) => o.kind !== "balconyDoor");
      openings.push(
        isBalcony
          ? { id: `f${floor}-o${n++}`, kind: "balconyDoor", edge, offset: round2(cursor), width: 1.6, height: 2.2, sill: 0 }
          : { id: `f${floor}-o${n++}`, kind: "window", edge, offset: round2(cursor), width: w, height: windowHeight, sill: 0.9 },
      );
      cursor += w + rng.range(0.8, 1.5);
    }
  }
  return openings;
}

/** Curtain wall: one glazed bay per face, corner to corner, reaching the slab above over a
 *  spandrel; the ground front keeps the entrance. */
function makeBays(outline: Point[], floor: number, floorHeight: number): Opening[] {
  const spandrel = 0.9;
  const margin = 0.12;
  return outline.map((_, edge): Opening => {
    const len = edgeLength(outline, edge);
    if (floor === 0 && edge === 0) {
      return {
        id: `f${floor}-entrance`, kind: "door", edge, offset: round2(len / 2 - 1.35), width: 2.7,
        height: Math.min(2.8, floorHeight - 0.4), sill: 0,
      };
    }
    return {
      id: `f${floor}-bay${edge}`, kind: "window", edge, offset: margin, width: round2(len - 2 * margin),
      height: round2(floorHeight - spandrel), sill: spandrel,
    };
  });
}

function buildShell(blueprint: Blueprint, theme: string, tier: Tier): Document {
  const mb = new MeshBuilder();
  // exterior's material kinds, so a fixture shell resolves against the same database
  const facade = `${theme}/wall/${tier}`;
  const slab = `${theme}/floor-slab/${tier}`;
  const top = blueprint.floors.at(-1)!;
  const roofY = top.elevation + top.height;
  const outline = blueprint.floors[0]!.outline;

  for (let e = 0; e < outline.length; e++) {
    const p0 = outline[e]!;
    const p1 = outline[(e + 1) % outline.length]!;
    // outward-facing skin: interior of a CCW outline lies left of the edge
    mb.addQuad(facade, [
      [p0[0], 0, p0[1]], [p0[0], roofY, p0[1]], [p1[0], roofY, p1[1]], [p1[0], 0, p1[1]],
    ]);
  }
  mb.addHorizontalPolygon(slab, outline, roofY, "up");
  const doc = createDocument(mb);
  // the skin is the shell's, not the interior's
  for (const node of doc.getRoot().listNodes()) node.setName(node.getName().replace(/^interior:/, "shell:"));

  // one node per separator plane, named by exterior's convention so interior can replace
  // them with slabs holding real stair and elevator holes
  for (const floor of blueprint.floors) {
    const sep = new MeshBuilder();
    sep.addHorizontalPolygon(slab, floor.outline, floor.elevation, "up");
    appendToDocument(doc, sep);
    const added = doc.getRoot().listNodes().filter((n) => n.getName() === `interior:${slab}`).at(-1)!;
    added.setName(`floor:${floor.index}/slab`);
    added.getMesh()?.setName(`floor:${floor.index}/slab`);
  }
  return doc;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
