import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { buildInterior } from "./index.js";
import { MaterialKeys } from "./materials.js";
import { BAND_SEAL, BASEBOARD, DADO_TOP, layerBands, TOP_TRIM } from "./wall-detail.js";
import { canonicalHoles } from "./walls.js";

const keys = new MaterialKeys("cyberpunk", "mid");
const bands = { y0: 0, ceilingY: 3.2, field: keys.wall(), accent: keys.accent(), trim: keys.trim(), casing: keys.door(), frame: keys.windowFrame() };

describe("wall bands", () => {
  it("stacks trim, dado, field and top trim from floor to ceiling", () => {
    const drawn: [string, number, number][] = [];
    layerBands(bands, 0, 3.6, (material, _proud, y0, y1) => drawn.push([material, y0, y1]));
    expect(drawn.map((d) => d[0])).toEqual([
      bands.trim, bands.accent, bands.field, bands.trim, bands.field,
    ]);
    expect(drawn[0]![2]).toBeCloseTo(BASEBOARD + BAND_SEAL, 6);
    expect(drawn[1]![2]).toBeCloseTo(DADO_TOP + BAND_SEAL, 6);
    expect(drawn[3]![1]).toBeCloseTo(3.2 - TOP_TRIM - BAND_SEAL, 6);
    // transitions overlap inside the solid sections, with no coplanar caps or light gap
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]![1]).toBeLessThan(drawn[i - 1]![2]);
  });

  it("closes every band section into a solid box", () => {
    const capped: string[] = [];
    layerBands(bands, 2.1, 3.6, (_m, _p, _y0, _y1, caps) => capped.push(caps), { bottom: true });
    expect(capped.every((c) => c === "both")).toBe(true);
  });

  it("a built floor carries baseboards, a dado and one accent wall per room", () => {
    const fix = makeFixture({ seed: 8, floors: 4, basements: 1 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const { doc } = buildInterior(plan, fix.request, fix.shellDoc);
    const names = doc.getRoot().listMeshes().map((m) => m.getName());
    expect(names.some((n) => n.includes("/metal/"))).toBe(true); // trim bands
    expect(names.some((n) => n.includes("/concrete/") && n.includes("#plain"))).toBe(true); // dado and accents
    expect(names.some((n) => n.includes("/plaster/") && n.includes("#"))).toBe(true); // patterned field
  });

  it("draws one fitted casing for the doorway shared by two rooms", () => {
    const doorway = { at: 4, width: 1, y0: 0, y1: 2.5 };
    expect(canonicalHoles([doorway, { ...doorway }])).toEqual([doorway]);
  });
});
