import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { buildInterior } from "./index.js";
import { MaterialKeys } from "./materials.js";
import { BASEBOARD, DADO_TOP, layerBands, TOP_TRIM } from "./wall-detail.js";

const keys = new MaterialKeys("cyberpunk", "mid", 1);
const bands = { y0: 0, ceilingY: 3.2, field: keys.wall(), accent: keys.accent(), trim: keys.trim(), casing: keys.door(), frame: keys.windowFrame() };

describe("wall bands", () => {
  it("stacks trim, dado, field and top trim from floor to ceiling", () => {
    const drawn: [string, number, number][] = [];
    layerBands(bands, 0, 3.6, (material, _proud, y0, y1) => drawn.push([material, y0, y1]));
    expect(drawn.map((d) => d[0])).toEqual([
      bands.trim, bands.accent, bands.field, bands.trim, bands.field,
    ]);
    expect(drawn[0]![2]).toBeCloseTo(BASEBOARD, 6);
    expect(drawn[1]![2]).toBeCloseTo(DADO_TOP, 6);
    expect(drawn[3]![1]).toBeCloseTo(3.2 - TOP_TRIM, 6);
    // the bands meet exactly: no gap and no overlap up the wall
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]![1]).toBeCloseTo(drawn[i - 1]![2], 6);
  });

  it("caps only the ends that are seen", () => {
    const capped: string[] = [];
    layerBands(bands, 2.1, 3.6, (_m, _p, _y0, _y1, caps) => capped.push(caps), { bottom: true });
    expect(capped[0]).toBe("both"); // the underside of a lintel
    expect(capped.slice(1).every((c) => c === "none")).toBe(true);
  });

  it("a built floor carries baseboards, a dado and one accent wall per room", () => {
    const fix = makeFixture({ seed: 8, floors: 4, basements: 1 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const { doc } = buildInterior(plan, fix.request, fix.shellDoc);
    const names = doc.getRoot().listMeshes().map((m) => m.getName());
    expect(names.some((n) => n.includes("/metal/"))).toBe(true); // trim bands
    expect(names.some((n) => n.includes("/concrete/") && n.includes("#panel"))).toBe(true); // dado and accents
    expect(names.some((n) => n.includes("/plaster/") && n.includes("#"))).toBe(true); // patterned field
  });
});
