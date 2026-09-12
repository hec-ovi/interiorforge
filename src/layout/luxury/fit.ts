import recipes from "./recipes.json" with { type: "json" };
import type { FittedGroup, GroupFit, GroupRecipe, LuxuryGroup, QuarterTurn } from "./schema.js";

const RECIPES = recipes as Record<LuxuryGroup, GroupRecipe>;
const STEP = 0.5;

/** The reservation includes the open space between the pieces and their approaches. */
export function fitLuxuryGroup(input: GroupFit): FittedGroup | null {
  const recipe = RECIPES[input.kind];
  const rotations = input.rng.shuffle<QuarterTurn>([0, 90, 180, 270]);
  for (const rotation of rotations) {
    const [width, depth] = rotation % 180 ? [recipe.span[1], recipe.span[0]] as const : recipe.span;
    const bounds = input.bounds;
    const columns = Math.floor((bounds.lu - width - 0.2) / STEP) + 1;
    const rows = Math.floor((bounds.lv - depth - 0.2) / STEP) + 1;
    if (columns <= 0 || rows <= 0) continue;
    const start = input.rng.int(0, columns * rows - 1);
    for (let offset = 0; offset < columns * rows; offset++) {
      const cell = (start + offset) % (columns * rows);
      const reservation = {
        u: bounds.u + 0.1 + (cell % columns) * STEP,
        v: bounds.v + 0.1 + Math.floor(cell / columns) * STEP,
        lu: width, lv: depth,
      };
      if (!input.accepts(reservation)) continue;
      const center = [reservation.u + width / 2, reservation.v + depth / 2] as const;
      return {
        reservation,
        pieces: recipe.pieces.map(piece => {
          const [x, z] = turn(piece.at, rotation);
          return {
            kind: piece.kind, size: [...piece.size],
            at: [center[0] + x, center[1] + z],
            rotationDeg: ((piece.rotationDeg + rotation) % 360) as QuarterTurn,
          };
        }),
      };
    }
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
