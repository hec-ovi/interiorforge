import { FINISH } from "../finishes.js";
import type { RecipeSet } from "../recipes.js";

/** Doors, window returns, stair flights and the lift, as the core places them. */
export const coreRecipes: RecipeSet = (add) => {
  // two jambs and a lintel around a 1 m by 2.5 m hole; a partition casing scales deeper to
  // stand proud of the panel frames on both faces
  add("door-frame", (k) => {
    k.box(FINISH.casing, [-0.58, 0, -0.07], [0.08, 2.5, 0.14]);
    k.box(FINISH.casing, [0.5, 0, -0.07], [0.08, 2.5, 0.14]);
    k.box(FINISH.casing, [-0.58, 2.5, -0.07], [1.16, 0.08, 0.14]);
  });
  add("window-return", (k) => {
    k.box(FINISH.reveal, [-0.27, -0.02, 0], [0.02, 0.54, 0.5]);
    k.box(FINISH.reveal, [0.25, -0.02, 0], [0.02, 0.54, 0.5]);
    k.box(FINISH.reveal, [-0.25, -0.02, 0], [0.5, 0.02, 0.5]);
    k.box(FINISH.reveal, [-0.25, 0.5, 0], [0.5, 0.02, 0.5]);
  });
  // the flight family keeps the tread depth while placement scales width and rise
  for (let n = 7; n <= 14; n++) {
    add(`stair-flight-${n}`, (k) => {
      for (let i = 0; i < n; i++) {
        k.box(FINISH.concrete, [0, (i + 1) * 0.17 - 0.15, i * 0.28], [1.45, 0.15, 0.28]);
        for (const x of [0.025, 1.375]) k.box(FINISH.zinc, [x, (i + 1) * 0.17, i * 0.28 + 0.12], [0.05, 1, 0.04]);
      }
      for (const x of [0, 1.4]) {
        const a = 1 + 0.17, b = 1 + n * 0.17, run = n * 0.28;
        k.mesh.addQuad(FINISH.zinc, [[x, a, 0], [x, b, run], [x + 0.05, b, run], [x + 0.05, a, 0]]);
        k.mesh.addQuad(FINISH.zinc, [[x + 0.05, a - 0.05, 0], [x + 0.05, b - 0.05, run], [x, b - 0.05, run], [x, a - 0.05, 0]]);
        k.mesh.addQuad(FINISH.zinc, [[x, a - 0.05, 0], [x, b - 0.05, run], [x, b, run], [x, a, 0]]);
        k.mesh.addQuad(FINISH.zinc, [[x + 0.05, a, 0], [x + 0.05, b, run], [x + 0.05, b - 0.05, run], [x + 0.05, a - 0.05, 0]]);
      }
    });
  }
  add("lift-car", (k) => {
    k.box(FINISH.liftCar, [-1, -0.1, -1], [2, 0.1, 2]);
    k.box(FINISH.liftCar, [-1, 0, -1], [0.08, 2.5, 2]);
    k.box(FINISH.liftCar, [0.92, 0, -1], [0.08, 2.5, 2]);
    k.box(FINISH.liftCar, [-0.92, 0, 0.92], [1.84, 2.5, 0.08]);
    k.box(FINISH.liftCar, [-1, 2.5, -1], [2, 0.1, 2]);
    k.cbox(FINISH.lensWarm, [0, 2.49, 0], [1.2, 0.01, 0.3], "unit");
  });
  add("lift-doors", (k) => {
    k.box(FINISH.liftDoor, [-0.55, 0, -0.03], [0.545, 2.2, 0.06], "unit");
    k.box(FINISH.liftDoor, [0.005, 0, -0.03], [0.545, 2.2, 0.06], "unit");
  });
};
