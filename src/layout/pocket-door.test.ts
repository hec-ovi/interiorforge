import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments, validateRequest } from "../blueprint/validate.js";
import type { Blueprint, Opening, PocketDoorMotion } from "../core/types.js";
import type { Point } from "../core/geom.js";
import { planBuilding } from "./index.js";
import { PARTITION_HALF } from "./opening-volume.js";
import { facadeDepth } from "./shell.js";

function fixture(leaves: 1 | 2, angleDeg: number) {
  const angle = angleDeg * Math.PI / 180;
  const transform = ([u, v]: Point): Point => [71.125 + u * Math.cos(angle) - v * Math.sin(angle),
    -42.375 + u * Math.sin(angle) + v * Math.cos(angle)];
  const offset = leaves === 1 ? 2 : 13, width = 3, leafWidth = width / leaves;
  const motion: PocketDoorMotion = { kind: "pocket", maxTravel: leafWidth + 0.05, clearDepth: 0,
    leaves: Array.from({ length: leaves }, (_, index) => {
      const direction = leaves === 1 || index === 1 ? 1 : -1;
      return { leaf: index as 0 | 1, travelU: direction * (leafWidth + 0.05), pocket: {
        offset: direction < 0 ? offset - leafWidth - 0.078 : offset + width,
        width: leafWidth + 0.078, sill: 0.002, height: 2.526, frontDepth: 0.087, backDepth: 0.183,
      } };
    }),
  };
  const start = Math.min(offset - 0.09, ...motion.leaves.map(leaf => leaf.pocket.offset - 0.035));
  const end = Math.max(offset + width + 0.09, ...motion.leaves.map(leaf => leaf.pocket.offset + leaf.pocket.width + 0.035));
  const opening: Opening = { id: "entry", kind: "door", edge: 0, offset, width, height: 2.5, sill: 0, leaves,
    door: { motion, clearance: { offset, width, height: 2.5, sill: 0, backDepth: 0.218 },
      cassette: { offset: start, width: end - start, height: 2.59, sill: 0, backDepth: 0.218 } },
  };
  const blueprint: Blueprint = { buildingId: "pocket-layout", facade: { wallDepth: 0.44 },
    coreFrame: { anglesDeg: [angleDeg, angleDeg + 90] },
    floors: [{ index: 0, kind: "lobby", elevation: 0, height: 4,
      outline: ([[0, 0], [30, 0], [30, 24], [0, 24]] as Point[]).map(transform), openings: [opening] }],
  };
  const f = makeFixture({ seed: "pocket-layout", type: "hotel", tier: "poor", blueprint });
  return { request: validateRequest(f.request), opening, transform };
}

it("reserves complete paired and asymmetric pocket cassettes while keeping doorway navigation clear-sized", () => {
  for (const [leaves, angle] of [[2, 0], [1, 35]] as const) {
    const f = fixture(leaves, angle), plan = planBuilding(f.request, resolveAssignments(f.request));
    const floor = plan.floors[0]!, reservation = floor.openingReservations[0]!, cassette = f.opening.door!.cassette!;
    const center = f.transform([cassette.offset + cassette.width / 2, 0]);
    expect(reservation.width).toBeCloseTo(cassette.width + 2 * PARTITION_HALF, 3);
    expect(reservation.position[0]).toBeCloseTo(center[0], 3);
    expect(reservation.position[1]).toBeCloseTo(center[1], 3);
    expect(reservation.height).toBe(cassette.height);
    expect(reservation.depth).toBeCloseTo(facadeDepth(f.request.blueprint.facade) + PARTITION_HALF, 3);
    const entries = floor.rooms.flatMap(room => room.doors).filter(door => door.to === "outside");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ width: f.opening.width, leaves, clearDepth: 0 });
    expect(entries[0]!.width).toBeLessThan(reservation.width);
  }
});

it("retains clear opening reservations and inward motion depth for a legacy swing door", () => {
  const f = fixture(2, 0);
  f.opening.door = { motion: { kind: "swing", clearDepth: 1.7 } };
  f.request.blueprint.floors[0]!.openings[0] = f.opening;
  const floor = planBuilding(validateRequest(f.request), resolveAssignments(f.request)).floors[0]!;
  expect(floor.openingReservations[0]).toMatchObject({ width: 3 + 2 * PARTITION_HALF, height: 2.5, depth: 1.77 });
  expect(floor.rooms.flatMap(room => room.doors).find(door => door.to === "outside"))
    .toMatchObject({ width: 3, clearDepth: 1.7 });
});
