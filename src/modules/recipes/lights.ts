import { FINISH } from "../finishes.js";
import type { RecipeSet } from "../recipes.js";

/** Light housings. Each stands at its light record's position: y = 0 is the emitting face,
 *  x runs along the record's length, and the lens wears a lit diffuser key. */
export const lightRecipes: RecipeSet = (add) => {
  // a recessed downlight: the can rises into the ceiling, the lens flush with the plane
  for (const [name, lens] of [["", FINISH.lensWarm], ["-cool", FINISH.lensCool]] as const) {
    add(`ceiling-spot${name}`, (k) => {
      k.cylinder(FINISH.bronze, [0, 0, 0], 0.075, 0.05);
      k.cylinder(lens, [0, -0.006, 0], 0.055, 0.006);
    });
  }
  // a linear luminaire: a steel housing with its lit face hanging under the ceiling
  add("ceiling-led-strip", (k) => {
    k.cbox(FINISH.zinc, [0, 0, 0], [0.5, 0.06, 0.08]);
    k.cbox(FINISH.lensCool, [0, -0.005, 0], [0.48, 0.005, 0.06]);
  });
  // a lit cove: the fascia hangs from the ceiling plane and the lens on top washes it
  for (const [name, fascia, lens] of [["timber", FINISH.timber, FINISH.lensWarm], ["steel", FINISH.steel, FINISH.lensCool], ["graphite", FINISH.black, FINISH.lensCool]] as const) {
    add(`ceiling-cove-${name}`, (k) => {
      k.cbox(fascia, [0, -0.06, 0], [0.5, 0.26, 0.03]);
      k.cbox(lens, [0, 0, 0], [0.5, 0.012, 0.05]);
    });
  }
  // the light line at a panel frame's top and bottom joint, a bar standing just proud of the rail
  for (const [name, lens] of [["", FINISH.lensWarm], ["-cool", FINISH.lensCool]] as const) {
    add(`wall-light-line${name}`, (k) => k.cbox(lens, [0, -0.009, 0], [0.5, 0.018, 0.03]));
  }
};
