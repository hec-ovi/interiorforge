import { describe, expect, it } from "vitest";
import { makeFixture } from "./fixture.js";
import { resolveAssignments, validateRequest, validateShell } from "./validate.js";
import { writeGlb } from "../glb/io.js";
import { InteriorError } from "../core/errors.js";
import type { InteriorRequest } from "../core/types.js";

const clone = <T>(v: T): T => structuredClone(v);

describe("validateRequest", () => {
  const { request } = makeFixture({ seed: 5, floors: 8, basements: 1 });

  it("accepts a fixture request, including basements", () => {
    expect(validateRequest(clone(request))).toBeTruthy();
  });

  it("accepts exterior v0.3 extras it does not consume", () => {
    const r = clone(request) as InteriorRequest & { blueprint: Record<string, unknown> };
    r.blueprint.seed = "abc";
    r.blueprint.signage = [];
    r.blueprint.roof = { elevation: 30, outline: [[0, 0], [1, 0], [1, 1]], parapetHeight: 1, artifacts: [] };
    r.blueprint.floors[1]!.openings[0]!.state = "half";
    r.blueprint.floors[1]!.openings[0]!.material = "urbe/glass/standard";
    expect(validateRequest(r)).toBeTruthy();
  });

  it("rejects a schema violation", () => {
    const r = clone(request) as unknown as Record<string, unknown>;
    delete r.building;
    expect(() => validateRequest(r)).toThrowError(expect.objectContaining({ code: "E_BLUEPRINT_INVALID" }));
  });

  it("rejects non-contiguous floors and broken elevations", () => {
    const gap = clone(request);
    gap.blueprint.floors.splice(2, 1);
    expect(() => validateRequest(gap)).toThrowError(expect.objectContaining({ code: "E_BLUEPRINT_INVALID" }));

    const drift = clone(request);
    drift.blueprint.floors[3]!.elevation += 0.5;
    expect(() => validateRequest(drift)).toThrowError(expect.objectContaining({ code: "E_BLUEPRINT_INVALID" }));
  });

  it("rejects a clockwise outline", () => {
    const r = clone(request);
    r.blueprint.floors[1]!.outline = [...r.blueprint.floors[1]!.outline].reverse();
    expect(() => validateRequest(r)).toThrowError(expect.objectContaining({ code: "E_BLUEPRINT_INVALID" }));
  });

  it("rejects overlapping and overflowing openings", () => {
    const overlap = clone(request);
    const [a] = overlap.blueprint.floors[1]!.openings;
    overlap.blueprint.floors[1]!.openings.push({ ...a!, id: "dup", offset: a!.offset + 0.1 });
    expect(() => validateRequest(overlap)).toThrowError(expect.objectContaining({ code: "E_BLUEPRINT_INVALID" }));

    const overflow = clone(request);
    overflow.blueprint.floors[1]!.openings[0]!.offset = 9999;
    expect(() => validateRequest(overflow)).toThrowError(expect.objectContaining({ code: "E_BLUEPRINT_INVALID" }));
  });

  it("rejects assignment gaps, double covers and out-of-range spans", () => {
    const gap = clone(request);
    gap.assignments = request.assignments!.slice(1);
    expect(() => validateRequest(gap)).toThrowError(expect.objectContaining({ code: "E_ASSIGNMENT_INVALID" }));

    const dup = clone(request);
    dup.assignments = [...request.assignments!.slice(0, -1), { ...request.assignments!.at(-1)!, spans: 2 as const }];
    expect(() => validateRequest(dup)).toThrowError(expect.objectContaining({ code: "E_ASSIGNMENT_INVALID" }));
  });
});

describe("resolveAssignments", () => {
  it("passes explicit assignments through and derives from slugs when absent", () => {
    const { request } = makeFixture({ seed: 3, floors: 6 });
    expect(resolveAssignments(request)).toBe(request.assignments);

    const derived = clone(request);
    delete (derived as Partial<InteriorRequest>).assignments;
    derived.blueprint.floors[2]!.kind = "residential";
    derived.blueprint.floors[3]!.kind = "unknown-slug";
    const a = resolveAssignments(derived);
    expect(a.map((x) => x.floor)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(a[0]!.kind).toBe("lobby");
    expect(["residence_studio", "apartment"]).toContain(a[2]!.kind);
    expect(a[3]!.kind).toBe("office");
    expect(resolveAssignments(derived)).toEqual(a);
  });
});

describe("shell", () => {
  it("fixture shell matches its blueprint; a foreign shell does not", () => {
    const fix = makeFixture({ seed: 9, floors: 5 });
    expect(() => validateShell(fix.request, fix.shellDoc)).not.toThrow();

    const tiny = makeFixture({ seed: 9, floors: 5, width: 8, depth: 8 });
    expect(() => validateShell(fix.request, tiny.shellDoc)).toThrowError(
      expect.objectContaining({ code: "E_SHELL_MISMATCH" }),
    );
  });

  it("fixture output is deterministic", async () => {
    const a = makeFixture({ seed: 7, floors: 6, basements: 2 });
    const b = makeFixture({ seed: 7, floors: 6, basements: 2 });
    expect(a.request).toEqual(b.request);
    const bytesA = await writeGlb(a.shellDoc);
    const bytesB = await writeGlb(b.shellDoc);
    expect(Buffer.from(bytesA).equals(Buffer.from(bytesB))).toBe(true);
  });
});

describe("InteriorError", () => {
  it("carries code and floor", () => {
    const err = new InteriorError("E_FLOOR_TOO_SMALL", "core does not fit", 4);
    expect(err.code).toBe("E_FLOOR_TOO_SMALL");
    expect(err.floor).toBe(4);
    expect(err.message).toContain("floor 4");
  });
});
