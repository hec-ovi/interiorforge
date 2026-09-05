import { describe, expect, it } from "vitest";
import type { InteriorRequest, Opening, PocketDoorMotion } from "../core/types.js";
import { validateRequest } from "./validate.js";

function fixture(count: 1 | 2 = 2, direction: -1 | 1 = -1) {
  const opening: Opening = { id: "entry", kind: "door", edge: 0, offset: 10, sill: 0, width: 3, height: 2.5, leaves: count };
  const travel = opening.width / count + 0.05;
  const motion: PocketDoorMotion = { kind: "pocket", maxTravel: travel, clearDepth: 0, leaves: [] };
  for (let index = 0; index < count; index++) {
    const sign = count === 1 ? direction : index === 0 ? -1 : 1;
    motion.leaves.push({ leaf: index as 0 | 1, travelU: sign * travel,
      pocket: { offset: sign < 0 ? opening.offset - travel : opening.offset + opening.width,
        sill: 0, width: travel, height: opening.height, frontDepth: 0.05, backDepth: 0.25 },
    });
  }
  const start = Math.min(opening.offset, ...motion.leaves.map((leaf) => leaf.pocket.offset)) - 0.1;
  const end = Math.max(opening.offset + opening.width, ...motion.leaves.map((leaf) => leaf.pocket.offset + leaf.pocket.width)) + 0.1;
  const cassette = { offset: start, sill: 0, width: end - start, height: 2.7, backDepth: 0.4 };
  const clearance = { offset: opening.offset, sill: opening.sill, width: opening.width, height: opening.height, backDepth: cassette.backDepth };
  opening.door = { cassette, clearance, motion };
  const floor = { index: 0, kind: "lobby", elevation: 0, height: 4,
    outline: [[0, 0], [30, 0], [30, 20], [0, 20]] as [number, number][], openings: [opening] };
  const request: InteriorRequest = { seed: "pocket-validation", building: { id: "pocket", type: "offices", tier: "mid" },
    shellGlb: "fixture.glb", materialTheme: "cyberpunk", blueprint: { buildingId: "pocket", facade: { wallDepth: 0.4 }, floors: [floor] } };
  return { request, opening, floor, cassette, clearance, motion, pocket: motion.leaves[0]!.pocket };
}

type Fixture = ReturnType<typeof fixture>;
function rejects(change: (value: Fixture) => void, detail: string): void {
  const value = fixture();
  change(value);
  expect(() => validateRequest(value.request)).toThrowError(expect.objectContaining({
    code: "E_BLUEPRINT_INVALID", floor: value.floor.index,
    message: expect.stringMatching(new RegExp(`pocket door ${value.opening.id} .*${detail}`)),
  }));
}

describe("pocket-door validation", () => {
  it("accepts paired leaves and either single-leaf travel direction without changing input", () => {
    for (const value of [fixture(), fixture(1, -1), fixture(1, 1)]) {
      const original = structuredClone(value.request);
      expect(validateRequest(value.request)).toBe(value.request);
      expect(value.request).toEqual(original);
    }
    const unordered = fixture();
    unordered.motion.leaves.reverse();
    expect(validateRequest(unordered.request)).toBe(unordered.request);
    const runningGap = fixture();
    runningGap.motion.leaves.forEach(({ pocket }) => { pocket.sill = 0.002; pocket.height = 2.526; });
    expect(validateRequest(runningGap.request)).toBe(runningGap.request);
  });

  it("retains swing, roller and minimal clear-depth metadata without measured wall depth", () => {
    for (const motion of [{ kind: "swing" as const, clearDepth: 1.5 }, { kind: "roller" as const, clearDepth: 0 }, { clearDepth: 1 }]) {
      const { request, opening } = fixture();
      opening.door = { motion };
      delete request.blueprint.facade!.wallDepth;
      expect(validateRequest(request)).toBe(request);
    }
  });

  it("requires an authoritative facade depth containing the cassette", () => {
    rejects(({ request }) => { delete request.blueprint.facade!.wallDepth; }, "requires measured facade wall depth");
    rejects(({ request }) => { request.blueprint.facade!.wallDepth = 0.39; }, "cassette exceeds facade wall depth");
  });

  it("keeps the cassette inside the face and floor and its passage inside the cassette", () => {
    rejects(({ cassette }) => { cassette.width = 31; }, "cassette exceeds its face or floor");
    rejects(({ cassette }) => { cassette.height = 4.1; }, "cassette exceeds its face or floor");
    rejects(({ cassette }) => { cassette.offset = 10.1; }, "passage exceeds its cassette");
  });

  it("requires clearance to repeat every passage coordinate and the back-skin depth", () => {
    for (const key of ["offset", "sill", "width", "height", "backDepth"] as const) {
      rejects(({ clearance }) => { clearance[key] += 0.01; }, "clearance differs");
    }
    const rounded = fixture();
    rounded.clearance.offset += 0.5e-6;
    expect(validateRequest(rounded.request)).toBe(rounded.request);
  });

  it("requires contiguous unique leaf identities matching the declared opening leaf count", () => {
    rejects(({ opening }) => { opening.leaves = 1; }, "leaf identities differ");
    rejects(({ opening }) => { delete opening.leaves; }, "leaf identities differ");
    rejects(({ motion }) => { motion.leaves[1]!.leaf = 0; }, "leaf identities differ");
    const gap = fixture(1);
    gap.motion.leaves[0]!.leaf = 1;
    expect(() => validateRequest(gap.request)).toThrowError(expect.objectContaining({
      code: "E_BLUEPRINT_INVALID", floor: 0, message: expect.stringContaining("pocket door entry leaf identities differ"),
    }));
  });

  it("matches maximum travel to the largest signed leaf displacement", () => {
    rejects(({ motion }) => { motion.maxTravel += 0.1; }, "maximum travel differs");
  });

  it("keeps chambers inside the cassette with positive depth between their skins", () => {
    rejects(({ pocket }) => { pocket.frontDepth = pocket.backDepth; }, "chamber depths exceed");
    rejects(({ pocket }) => { pocket.frontDepth = pocket.backDepth + 0.01; }, "chamber depths exceed");
    rejects(({ pocket }) => { pocket.backDepth = 0.41; }, "chamber depths exceed");
    rejects(({ pocket }) => { pocket.height = 2.8; }, "chamber exceeds its cassette");
    rejects(({ pocket }) => { pocket.offset -= 0.2; }, "chamber exceeds its cassette");
  });

  it("attaches each chamber's open slot to the passage edge selected by travel direction", () => {
    rejects(({ pocket }) => { pocket.width -= 0.01; }, "does not meet its passage-side slot");
    rejects(({ pocket }) => { pocket.width += 0.01; }, "does not meet its passage-side slot");
    rejects(({ motion }) => { motion.leaves[0]!.travelU *= -1; }, "does not meet its passage-side slot");
  });

  it("requires each full translated leaf span to fit inside its chamber", () => {
    rejects(({ motion }) => { motion.leaves[0]!.travelU = -1.4; }, "does not retract fully");
    rejects(({ motion }) => { motion.leaves[0]!.travelU = -1.65; motion.maxTravel = 1.65; }, "does not retract fully");
  });

  it("rejects chambers crossing other openings on their face", () => {
    rejects(({ floor }) => { floor.openings.push({ id: "display", kind: "window", edge: 0, offset: 8.8, sill: 1, width: 0.5, height: 1 }); }, "chamber overlaps opening display");
    const differentFace = fixture();
    differentFace.floor.openings.push({ id: "display", kind: "window", edge: 1, offset: 8.8, sill: 1, width: 0.5, height: 1 });
    expect(validateRequest(differentFace.request)).toBe(differentFace.request);
  });

  it("rejects overlapping chambers belonging to one or different doors", () => {
    rejects(({ motion, cassette, pocket }) => {
      pocket.offset = 6.9; pocket.width = 3.1;
      motion.leaves[0]!.travelU = -3.05;
      motion.leaves[1] = { leaf: 1, travelU: -3.05, pocket: { ...pocket } };
      motion.maxTravel = 3.05; cassette.offset = 6.8; cassette.width = 7.9;
    }, "chamber overlaps door entry leaf 0 chamber");
    const first = fixture(1, 1), second = fixture(1, -1);
    second.opening.id = "other";
    second.opening.offset += 7;
    second.clearance.offset += 7;
    second.cassette.offset += 7;
    second.pocket.offset += 7;
    first.floor.openings.push(second.opening);
    expect(() => validateRequest(first.request)).toThrowError(expect.objectContaining({
      code: "E_BLUEPRINT_INVALID", floor: 0,
      message: expect.stringContaining("pocket door other leaf 0 chamber overlaps door entry leaf 0 chamber"),
    }));
  });
});
