import recipes from "./recipes.json" with { type: "json" };
import type { FittedGroup, GroupFit, GroupRecipe, LuxuryGroup, QuarterTurn } from "./schema.js";

const RECIPES = recipes as Record<LuxuryGroup, GroupRecipe>;
const STEP = 0.5;

/** Whole furniture groups keep their approach space. Start against the room perimeter:
 * floating a bed/kitchen in the middle consumes the generous volume the room was given.
 * Randomness breaks equivalent choices, never overrides circulation reservations. */
export function fitLuxuryGroup(input: GroupFit): FittedGroup | null {
  const recipe = RECIPES[input.kind], bounds = input.bounds;
  const candidates: { rotation: QuarterTurn; reservation: FittedGroup['reservation']; score: number; order: number }[] = [];
  let order = 0;
  for (const rotation of input.rng.shuffle<QuarterTurn>([0, 90, 180, 270])) {
    const [width, depth] = rotation % 180 ? [recipe.span[1], recipe.span[0]] as const : recipe.span;
    const availableU = bounds.lu - width - 0.2, availableV = bounds.lv - depth - 0.2;
    if (availableU < -1e-8 || availableV < -1e-8) continue;
    // Include the far edge exactly; odd floor dimensions must not leave a random half-metre gap.
    const positions = (extent: number): number[] => {
      const span = Math.max(0, extent), out = Array.from({ length: Math.floor(span / STEP) + 1 }, (_, i) => i * STEP);
      if (span - out[out.length - 1]! > 1e-8) out.push(span);
      return out;
    };
    const us = positions(availableU), vs = positions(availableV);
    for (const v of vs) for (const u of us) {
      const back = rotation === 0 ? v : rotation === 90 ? u : rotation === 180 ? availableV - v : availableU - u;
      const side = rotation % 180 ? Math.abs(v - availableV / 2) : Math.abs(u - availableU / 2);
      candidates.push({ rotation, reservation: { u: bounds.u + 0.1 + u, v: bounds.v + 0.1 + v, lu: width, lv: depth },
        score: back * 100 + side, order: order++ });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.order - b.order);
  for (const { rotation, reservation } of candidates) {
    const center = [reservation.u + reservation.lu / 2, reservation.v + reservation.lv / 2] as const;
    const fitted: FittedGroup = {
      reservation,
      pieces: recipe.pieces.map(piece => {
        const [x, z] = turn(piece.at, rotation);
        return { kind: piece.kind, size: [...piece.size], at: [center[0] + x, center[1] + z],
          rotationDeg: ((piece.rotationDeg + rotation) % 360) as QuarterTurn };
      }),
    };
    if (input.accepts(reservation, fitted.pieces)) return fitted;
  }
  return null;
}

function turn([x, z]: [number, number], rotation: QuarterTurn): [number, number] {
  switch (rotation) {
    case 0: return [x, z];
    case 90: return [z, -x];
    case 180: return [-x, -z];
    case 270: return [-z, x];
  }
}
