import { describe, expect, it } from "vitest";
import type { Point } from "../core/geom.js";
import { clipPolygonToConvex, polygonArea, polygonBounds } from "../core/geom.js";
import { readGlbBytes } from "../glb/io.js";
import { generateInterior, makeFixture } from "../index.js";

interface Surface {
  material: string;
  polygon: Point[];
  y: number;
}

/** Inspect serialized public outputs, including the separate bands loaded together in play. */
async function surfacesOf(glb: Uint8Array, facing: "up" | "down" = "down"): Promise<Surface[]> {
  const doc = await readGlbBytes(glb);
  const surfaces: Surface[] = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith("interior:")) continue;
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute("POSITION")!.getArray()!;
      const index = primitive.getIndices()!.getArray()!;
      for (let i = 0; i < index.length; i += 3) {
        const vertices = [0, 1, 2].map((offset) => {
          const k = index[i + offset]! * 3;
          return [position[k]!, position[k + 1]!, position[k + 2]!];
        });
        const y = vertices[0]![1]!;
        if (!vertices.every((v) => v[1] === y)) continue;
        const polygon = vertices.map((v): Point => [v[0]!, v[2]!]);
        const area = polygonArea(polygon);
        if ((facing === "down" ? area : -area) <= 1e-8) continue;
        if (facing === "up") polygon.reverse();
        surfaces.push({ material: primitive.getMaterial()!.getName(), polygon, y });
      }
    }
  }
  return surfaces;
}

function overlap(a: Surface[], b: Surface[]): number {
  let area = 0;
  type BoundedSurface = { surface: Surface; bounds: ReturnType<typeof polygonBounds> };
  const cells = (bounds: BoundedSurface["bounds"]): string[] => {
    const keys: string[] = [];
    for (let x = Math.floor(bounds.x / 2); x <= Math.floor((bounds.x + bounds.w) / 2); x++) {
      for (let z = Math.floor(bounds.z / 2); z <= Math.floor((bounds.z + bounds.d) / 2); z++) keys.push(`${x}:${z}`);
    }
    return keys;
  };
  const buckets = new Map<string, BoundedSurface[]>();
  for (const surface of b) {
    const entry = { surface, bounds: polygonBounds(surface.polygon) };
    for (const cell of cells(entry.bounds)) {
      const bucket = buckets.get(cell) ?? [];
      bucket.push(entry);
      buckets.set(cell, bucket);
    }
  }
  for (const left of a) {
    const bounds = polygonBounds(left.polygon);
    const candidates = new Set(cells(bounds).flatMap((cell) => buckets.get(cell) ?? []));
    for (const { surface: right, bounds: other } of candidates) {
      if (left === right || left.y !== right.y || other.x + other.w <= bounds.x
        || other.x >= bounds.x + bounds.w || other.z >= bounds.z + bounds.d
        || other.z + other.d <= bounds.z) continue;
      const intersection = clipPolygonToConvex(left.polygon, right.polygon);
      if (intersection.length >= 3) area += Math.abs(polygonArea(intersection));
    }
  }
  return area;
}

function select(surfaces: Surface[], kind: string, y: number): Surface[] {
  return surfaces.filter((surface) => surface.material.includes(`/${kind}/`) && surface.y === Math.fround(y));
}

function ceilingAt(surfaces: Surface[], y: number): Surface[] {
  return [...select(surfaces, "interior-luxury-ceiling", y), ...select(surfaces, "door", y)];
}

function areaOf(surfaces: Surface[]): number {
  return surfaces.reduce((area, surface) => area + polygonArea(surface.polygon), 0);
}

describe("slab underside ownership", () => {
  it("shares one ceiling plane across streamed bands and combined output, with concrete above unfinished rooms", async () => {
    // A wide rotated curtain-wall hotel has different room subdivisions above its lobby.
    // Full-height glazing raises the finished ceiling to the upper slab's concrete soffit.
    const fixture = makeFixture({
      seed: 92, floors: 3, width: 60, depth: 24, rotationDeg: 175.87,
      type: "hotel", tier: "rich", facadeStyle: "curtain-wall",
    });
    const result = await generateInterior(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" }, floorGlbs: true,
    });
    const floors = result.floors;
    const bytes = [...result.floorGlbs!.values()];
    const bands = await Promise.all(bytes.map((glb) => surfacesOf(glb)));
    const floorTops = await Promise.all(bytes.map((glb) => surfacesOf(glb, "up")));
    const combined = await surfacesOf(result.glb);
    let finishedArea = 0, exposedConcreteArea = 0;
    for (let i = 0; i < floors.length - 1; i++) {
      const floor = floors[i]!;
      const ceiling = ceilingAt(bands[i]!, floor.ceilingElevation);
      const concrete = select(bands[i + 1]!, "concrete", floor.ceilingElevation);
      expect(select(ceiling, "interior-luxury-ceiling", floor.ceilingElevation).length).toBeGreaterThan(0);
      expect(select(ceiling, "door", floor.ceilingElevation).length).toBeGreaterThan(0);
      finishedArea += areaOf(ceiling);
      exposedConcreteArea += areaOf(concrete);
      expect(overlap(ceiling, ceiling)).toBeLessThan(0.0001);
      expect(overlap(ceiling, concrete)).toBeLessThan(0.0001);
      const combinedCeiling = ceilingAt(combined, floor.ceilingElevation);
      const combinedConcrete = select(combined, "concrete", floor.ceilingElevation);
      expect(overlap(combinedCeiling, combinedCeiling)).toBeLessThan(0.0001);
      expect(overlap(combinedCeiling, combinedConcrete)).toBeLessThan(0.0001);
      expect(areaOf(combinedCeiling)).toBeCloseTo(areaOf(ceiling), 4);
      expect(areaOf(combinedConcrete)).toBeCloseTo(areaOf(select(bands.flat(), "concrete", floor.ceilingElevation)), 4);
      const roomFloor = floorTops[i]!.filter((surface) => surface.y === Math.fround(floor.elevation))
        .map((surface) => ({ ...surface, y: Math.fround(floor.ceilingElevation) }));
      const finishedRooms = floor.rooms.filter((room) => !["mechanical_room", "parking_area", "terrace_open"].includes(room.kind));
      let supportedCeilingArea = 0;
      for (const room of finishedRooms) {
        const mask: Surface = { material: "room", polygon: room.polygon, y: Math.fround(floor.ceilingElevation) };
        const finish = room.kind === "storage" ? select(roomFloor, "concrete", mask.y)
          : [...select(roomFloor, "interior-luxury-floor", mask.y), ...select(roomFloor, "door", mask.y)];
        const supported = overlap([mask], finish);
        expect(overlap([mask], ceiling), `${floor.floor}: ${room.kind}`).toBeCloseTo(supported, 2);
        supportedCeilingArea += supported;
      }
      // Each room mask and its serialized vertices round separately; retain the per-room error bound.
      expect(Math.abs(areaOf(ceiling) - supportedCeilingArea)).toBeLessThan(finishedRooms.length * 0.005);
      for (const room of floor.rooms.filter((room) => room.kind === "mechanical_room")) {
        const mask: Surface = { material: "room", polygon: room.polygon, y: Math.fround(floor.ceilingElevation) };
        const above = floorTops[i + 1]!.filter((surface) => surface.y === Math.fround(floors[i + 1]!.elevation))
          .map((surface) => ({ ...surface, y: mask.y }));
        const supported = overlap([mask], above);
        expect(supported).toBeGreaterThan(1);
        expect(overlap([mask], concrete)).toBeCloseTo(supported, 2);
      }
    }
    expect(finishedArea).toBeGreaterThan(100);
    expect(exposedConcreteArea).toBeGreaterThan(10);
    expect(combined).toHaveLength(bands.flat().length);
  });
});
