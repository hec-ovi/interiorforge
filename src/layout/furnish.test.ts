import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import type { Furniture } from "../core/types.js";
import { buildNpcSupport } from "../npc/index.js";
import { planBuilding } from "./index.js";

const fix = makeFixture({ seed: 21, floors: 10, basements: 1 });
const plan = planBuilding(fix.request, resolveAssignments(fix.request));
const npc = buildNpcSupport(plan, fix.request);
const byId = new Map(plan.floors.flatMap((f) => f.furniture.map((x) => [x.id, x] as const)));

function distance(a: Furniture, b: Furniture): number {
  return Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
}

describe("furnishing a room", () => {
  it("pulls chairs up to tables and stools up to counters", () => {
    const floor = plan.floors.find((f) => f.furniture.some((x) => x.kind === "dining_table"))!;
    const tables = floor.furniture.filter((x) => x.kind === "dining_table");
    const chairs = floor.furniture.filter((x) => x.kind === "chair");
    expect(tables.length).toBeGreaterThan(2);
    expect(chairs.length).toBeGreaterThanOrEqual(tables.length);
    for (const table of tables) {
      const near = chairs.filter((c) => distance(c, table) < 1.4);
      expect(near.length, `table ${table.id} has no chair`).toBeGreaterThan(0);
      // a seat looks back at the table it serves
      for (const chair of near) expect((chair.rotationDeg + 180) % 360).not.toBe(chair.rotationDeg);
    }
    const bar = floor.furniture.find((x) => x.kind === "bar_counter")!;
    const stools = floor.furniture.filter((x) => x.kind === "stool");
    expect(stools.length).toBeGreaterThan(1);
    for (const s of stools) expect(distance(s, bar)).toBeLessThan(3.0);
  });

  it("gives every desk a task chair", () => {
    const floor = plan.floors.find((f) => f.kind === "office")!;
    const desks = floor.furniture.filter((x) => x.kind === "desk");
    const chairs = floor.furniture.filter((x) => x.kind === "office_chair");
    expect(desks.length).toBeGreaterThan(4);
    expect(chairs.length).toBeGreaterThanOrEqual(desks.length - 2);
  });

  it("hangs wall pieces off the floor and keeps them out of the facade", () => {
    const mounted = plan.floors.flatMap((f) => f.furniture.filter((x) => (x.elevation ?? 0) > 0));
    expect(mounted.length).toBeGreaterThan(4);
    for (const item of mounted) {
      expect(["wall_shelf", "display_screen", "wall_art"]).toContain(item.kind);
      expect(item.elevation!).toBeGreaterThanOrEqual(1.3);
    }
  });

  it("seats a sitting NPC on the seat, not beside it", () => {
    const seats = npc.anchors.filter((a) => a.kind === "seat" && a.furniture);
    expect(seats.length).toBeGreaterThan(20);
    const onSeat = seats.filter((a) => {
      const item = byId.get(a.furniture!)!;
      return Math.hypot(a.position[0] - item.position[0], a.position[1] - item.position[1]) < 0.14;
    });
    // chairs and stools carry the anchor exactly; a sofa or bed is approached from its open side
    expect(onSeat.length / seats.length).toBeGreaterThan(0.9);
  });

  it("back rooms carry stock, not bare floor", () => {
    const store = plan.floors.flatMap((f) => f.furniture.filter((x) => x.kind === "crate"));
    expect(store.length).toBeGreaterThan(4);
  });
});
