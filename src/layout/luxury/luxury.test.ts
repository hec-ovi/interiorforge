import { expect, it } from "vitest";
import { createRng } from "../../core/rng.js";
import { fitLuxuryGroup } from "./fit.js";
import type { LuxuryGroup } from "./schema.js";

it("fits full-size coordinated groups and their access space deterministically", () => {
  for (const kind of ["salon", "seating", "kitchen", "suite"] as LuxuryGroup[]) {
    const fit = () => fitLuxuryGroup({ kind, bounds: { u: 10, v: -20, lu: 12, lv: 10 },
      rng: createRng(12), accepts: rect => rect.u >= 12 });
    const group = fit()!;
    expect(group).not.toBeNull();
    expect(fit()).toEqual(group);
    expect(group.reservation.u).toBeGreaterThanOrEqual(12);
    for (const piece of group.pieces) {
      const [width, depth] = piece.rotationDeg % 180
        ? [piece.size[1], piece.size[0]] : piece.size;
      expect(piece.at[0] - width / 2).toBeGreaterThanOrEqual(group.reservation.u);
      expect(piece.at[1] - depth / 2).toBeGreaterThanOrEqual(group.reservation.v);
      expect(piece.at[0] + width / 2).toBeLessThanOrEqual(group.reservation.u + group.reservation.lu);
      expect(piece.at[1] + depth / 2).toBeLessThanOrEqual(group.reservation.v + group.reservation.lv);
    }
    if (kind === "salon") {
      const sofas = group.pieces.filter(piece => piece.kind === "sofa");
      expect(sofas).toHaveLength(2);
      const table = group.pieces.find(piece => piece.kind === "low_table")!;
      for (const sofa of sofas) {
        const angle = sofa.rotationDeg * Math.PI / 180;
        const delta = [table.at[0] - sofa.at[0], table.at[1] - sofa.at[1]];
        expect(delta[0]! * Math.sin(angle) + delta[1]! * Math.cos(angle)).toBeGreaterThan(1);
        expect(sofa.size).toEqual([3.5, 1.05, 0.9]);
      }
    }
  }
});

it("returns no group when the room or its reserved routes cannot hold the complete arrangement", () => {
  for (const [size, available] of [[3, true], [12, false]] as const) {
    expect(fitLuxuryGroup({ kind: "salon", bounds: { u: 0, v: 0, lu: size, lv: size },
      rng: createRng(2), accepts: () => available })).toBeNull();
  }
});
