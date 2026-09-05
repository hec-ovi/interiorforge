import { describe, expect, it } from "vitest";
import type { Point } from "../core/geom.js";
import { clipPolygonToConvex, polygonArea } from "../core/geom.js";
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
  for (const left of a) {
    for (const right of b) {
      if (left.y !== right.y) continue;
      const intersection = clipPolygonToConvex(left.polygon, right.polygon);
      if (intersection.length >= 3) area += Math.abs(polygonArea(intersection));
    }
  }
  return area;
}

function select(surfaces: Surface[], kind: string, y: number): Surface[] {
  return surfaces.filter((surface) => surface.material.includes(`/${kind}/`) && surface.y === Math.fround(y));
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
      const ceiling = select(bands[i]!, "ceiling", floor.ceilingElevation);
      const concrete = select(bands[i + 1]!, "concrete", floor.ceilingElevation);
      expect(ceiling.length).toBeGreaterThan(0);
      finishedArea += ceiling.reduce((area, surface) => area + polygonArea(surface.polygon), 0);
      exposedConcreteArea += concrete.reduce((area, surface) => area + polygonArea(surface.polygon), 0);
      expect(overlap(ceiling, concrete)).toBeLessThan(0.0001);
      expect(overlap(select(combined, "ceiling", floor.ceilingElevation), select(combined, "concrete", floor.ceilingElevation)))
        .toBeLessThan(0.0001);
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
