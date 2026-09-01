import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import npcSchema from "../../schemas/npc.schema.json" with { type: "json" };
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { buildNpcSupport, findPath } from "./index.js";

const fix = makeFixture({ seed: 33, floors: 8, basements: 1 });
const plan = planBuilding(fix.request, resolveAssignments(fix.request));
const npc = buildNpcSupport(plan, fix.request);

describe("buildNpcSupport", () => {
  it("emits schema-valid NpcSupport", () => {
    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(npcSchema);
    const asJson = JSON.parse(JSON.stringify(npc));
    expect(check(asJson), JSON.stringify(check.errors)).toBe(true);
  });

  it("is deterministic", () => {
    const again = buildNpcSupport(planBuilding(fix.request, resolveAssignments(fix.request)), fix.request);
    expect(JSON.stringify(again)).toBe(JSON.stringify(npc));
  });

  it("anchors cover entrances, elevators and stairs on every served floor", () => {
    const served = plan.floors.filter((f) => f.rooms.length > 0);
    expect(npc.anchors.some((a) => a.kind === "entrance" && a.floor === 0)).toBe(true);
    for (const floor of served) {
      const waits = npc.anchors.filter((a) => a.floor === floor.floor && a.kind === "elevator_wait");
      const stairs = npc.anchors.filter((a) => a.floor === floor.floor && a.kind === "stair_entry");
      expect(waits.length).toBe(floor.core.elevators.length);
      expect(stairs.length).toBe(floor.core.stairs.length);
    }
  });

  it("staffs the building and every routine step targets an existing anchor of its loop", () => {
    const roleKinds = new Set(npc.roles.map((r) => r.role));
    expect(roleKinds).toContain("receptionist");
    expect(roleKinds).toContain("office_worker");
    expect(roleKinds).toContain("cleaner");
    const anchorIds = new Set(npc.anchors.map((a) => a.id));
    const roleIds = new Set(npc.roles.map((r) => r.id));
    for (const routine of npc.routines) {
      expect(roleIds.has(routine.role)).toBe(true);
      expect(routine.steps.length).toBeGreaterThan(0);
      for (const s of routine.steps) expect(anchorIds.has(s.anchor)).toBe(true);
    }
    for (const role of npc.roles) expect(anchorIds.has(role.homeAnchor)).toBe(true);
  });

  it("routes from the entrance to every anchor in the building, across floors", () => {
    const entrance = npc.anchors.find((a) => a.kind === "entrance" && a.floor === 0)!;
    for (const anchor of npc.anchors) {
      const legs = findPath(
        npc,
        { floor: entrance.floor, position: entrance.position },
        { floor: anchor.floor, position: anchor.position },
      );
      expect(legs, `no path to ${anchor.id} (${anchor.kind})`).not.toBeNull();
      const last = legs!.at(-1)!;
      expect(last.kind).toBe("walk");
    }
  });

  it("cross-floor paths ride a connector, elevators for long travel", () => {
    const entrance = npc.anchors.find((a) => a.kind === "entrance")!;
    const top = npc.anchors.filter((a) => a.floor === 7)[0]!;
    const legs = findPath(npc, { floor: 0, position: entrance.position }, { floor: 7, position: top.position })!;
    expect(legs.map((l) => l.kind)).toEqual(["walk", "ride", "walk"]);
    const ride = legs[1] as { kind: "ride"; connector: string };
    expect(npc.nav.connectors.find((c) => c.id === ride.connector)!.kind).toBe("elevator");
  });

  it("routes across floors on a rotated parcel", () => {
    const rot = makeFixture({ seed: 9, floors: 6, rotationDeg: -52 });
    const rplan = planBuilding(rot.request, resolveAssignments(rot.request));
    const rnpc = buildNpcSupport(rplan, rot.request);
    const entrance = rnpc.anchors.find((a) => a.kind === "entrance" && a.floor === 0)!;
    expect(entrance).toBeTruthy();
    let unreachable = 0;
    for (const anchor of rnpc.anchors) {
      const legs = findPath(
        rnpc,
        { floor: entrance.floor, position: entrance.position },
        { floor: anchor.floor, position: anchor.position },
      );
      if (!legs) unreachable++;
    }
    expect(unreachable).toBe(0);
  });

  it("walkup buildings route between floors on stairs alone, entrances stay at street level", () => {
    const small = makeFixture({ seed: 3, floors: 4, width: 9, depth: 10, type: "residential" });
    const splan = planBuilding(small.request, resolveAssignments(small.request));
    const snpc = buildNpcSupport(splan, small.request);
    expect(snpc.nav.connectors.every((c) => c.kind === "stair")).toBe(true);
    expect(snpc.anchors.filter((a) => a.kind === "entrance").every((a) => a.floor === 0)).toBe(true);
    const entrance = snpc.anchors.find((a) => a.kind === "entrance")!;
    const top = snpc.anchors.filter((a) => a.floor === 3)[0]!;
    const legs = findPath(snpc, { floor: 0, position: entrance.position }, { floor: 3, position: top.position })!;
    expect(legs).not.toBeNull();
    const ride = legs.find((l) => l.kind === "ride") as { connector: string };
    expect(snpc.nav.connectors.find((c) => c.id === ride.connector)!.kind).toBe("stair");
  });

  it("returns null for an unreachable target instead of throwing", () => {
    const entrance = npc.anchors.find((a) => a.kind === "entrance")!;
    expect(findPath(npc, { floor: 0, position: entrance.position }, { floor: 999, position: [0, 0] })).toBeNull();
  });
});
