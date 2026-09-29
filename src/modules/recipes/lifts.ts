import { LIFT_CAR } from "../../geometry/lift-spec.js";
import { FINISH } from "../finishes.js";
import type { RecipeSet } from "../recipes.js";

/** Moving car and leaves retain their consumer IDs. Stationary landing fittings must
 * remain separate: the consumer splits every triangle of lift-doors into sliding leaves. */
export const liftRecipes: RecipeSet = (add) => {
  add("lift-car", (k) => {
    // Canonical 2.30 m car. Placement expands it to a generous 3.30 m
    // outside / 3.07 m clear in the standard 3.50 m shaft; front is -Z.
    const c = LIFT_CAR, halfW = c.width / 2, halfD = c.depth / 2;
    k.box(FINISH.liftCar, [-halfW, -c.floor, -halfD], [c.width, c.floor, c.depth], undefined, ["bottom", "north", "south", "east", "west"]);
    k.box(FINISH.stone, [-halfW, -0.02, -halfD], [c.width, 0.02, c.depth], undefined, ["top"]);
    for (const x of [-halfW, halfW - c.wall]) k.box(FINISH.liftCar, [x, 0, -halfD], [c.wall, c.ceiling, c.depth]);
    k.box(FINISH.liftCar, [-halfW + c.wall, 0, halfD - c.wall], [c.width - 2 * c.wall, c.ceiling, c.wall]);
    // The landing owns its header, so fitting a car into a short storey cannot
    // lower a second car lintel into the walking aperture.
    const cheek = (c.width - 2 * c.wall - c.doorWidth) / 2;
    for (const x of [-halfW + c.wall, c.doorWidth / 2]) k.box(FINISH.liftCar, [x, 0, -halfD], [cheek, c.ceiling, c.wall]);
    k.box(FINISH.liftCar, [-halfW, c.ceiling, -halfD], [c.width, c.roof, c.depth]);
    // Opaque cabin linings: an environment-map mirror falsely showed outdoor
    // sky inside the sealed shaft. Solid mineral panels read as real walls.
    for (const x of [-0.70, 0, 0.70]) {
      k.cbox(FINISH.ivory, [x, 0.16, 1.055], [0.68, 2.17, 0.025]);
    }
    for (const x of [-1.063, 1.063]) {
      k.cbox(FINISH.ivory, [x, 0.16, 0], [0.014, 2.17, 2.10]);
      k.cbox(FINISH.zinc, [x, 2.33, 0], [0.018, 0.025, 2.10]);
    }
    k.cbox(FINISH.zinc, [0, 0.02, 1.02], [2.14, 0.13, 0.04]);
    for (const x of [-1.045, 1.045]) k.cbox(FINISH.zinc, [x, 0.02, 0], [0.04, 0.13, 2.14]);
    // Handrails stop clear of the entrance and do not narrow the turn-in zone.
    k.rod(FINISH.chrome, [-0.94, 0.95, 0.96], [0.94, 0.95, 0.96], 0.04);
    for (const x of [-0.97, 0.97]) {
      k.rod(FINISH.chrome, [x, 0.95, -0.55], [x, 0.95, 0.90], 0.04);
    }
    k.cbox(FINISH.ceilingLight, [0, 2.455, 0], [1.88, 0.045, 1.88]);
    k.cbox(FINISH.lensWarm, [...LIFT_CAR.lens.center], [LIFT_CAR.lens.width, 0.01, LIFT_CAR.lens.depth]);
    // A physical car operating panel stays attached to the car when it travels.
    k.box(FINISH.charcoal, [0.68, 0.87, -1.075], [0.24, 0.75, 0.025]);
    k.box(FINISH.ledCyan, [0.71, 1.42, -1.045], [0.18, 0.11, 0.008]);
    for (const y of [1.02, 1.16, 1.30]) for (const x of [0.72, 0.84])
      k.box(FINISH.chrome, [x, y, -1.045], [0.045, 0.045, 0.014]);
    // Physical button legends match the shared runtime actions and target points.
    for (const { action, position: [x, y, z] } of LIFT_CAR.panel.buttons) {
      const line = (a: [number, number], b: [number, number]) =>
        k.rod(FINISH.ceilingLight, [x + a[0], y + a[1], z], [x + b[0], y + b[1], z], .003);
      if (action === 'up' || action === 'down') {
        const d = action === 'up' ? 1 : -1;
        line([0, -.009 * d], [0, .009 * d]);
        line([-.007, .002 * d], [0, .009 * d]);
        line([.007, .002 * d], [0, .009 * d]);
      } else if (action === 'open' || action === 'close') {
        const d = action === 'open' ? 1 : -1;
        for (const side of [-1, 1]) {
          line([side * .005, -.008], [side * (.005 + d * .005), 0]);
          line([side * .005, .008], [side * (.005 + d * .005), 0]);
        }
      } else if (action === 'go') {
        line([-.007, -.008], [.007, 0]); line([.007, 0], [-.007, .008]); line([-.007, .008], [-.007, -.008]);
      } else {
        line([-.007, -.007], [.007, .007]); line([-.007, .007], [.007, -.007]);
      }
    }
  });
  add("lift-doors", (k) => {
    // Sheet-metal geometry supplies the split; a texture of a whole elevator
    // must never be repeated on each leaf. Nothing here straddles local X=0.
    for (const x of [-0.55, 0.005]) {
      k.box(FINISH.liftCar, [x, 0, -0.03], [0.545, 2.20, 0.06]);
      k.box(FINISH.zinc, [x + 0.014, 0.015, 0.03], [0.517, 0.045, 0.004]);
      k.box(FINISH.zinc, [x + 0.014, 2.14, 0.03], [0.517, 0.045, 0.004]);
    }
  });
  // Each stationary member is a separate solid box. A combined U-frame would
  // become a solid cuboid in the unchanged consumer and block the doorway.
  add("lift-landing-jamb", (k) => {
    k.box(FINISH.zinc, [-0.05, 0, -0.115], [0.10, 2.20, 0.16]);
    k.box(FINISH.chrome, [-0.05, 0, -0.124], [0.022, 2.20, 0.009]);
  });
  add("lift-landing-header", (k) => {
    k.box(FINISH.zinc, [-0.65, 0, -0.115], [1.30, 0.13, 0.16]);
    k.box(FINISH.charcoal, [-0.25, 0.045, -0.127], [0.50, 0.065, 0.012]);
    k.box(FINISH.ledCyan, [-0.10, 0.064, -0.132], [0.20, 0.025, 0.005]);
  });
  add("lift-reveal-jamb", (k) => k.box(FINISH.zinc, [-0.01, 0, 0], [0.02, 2.20, 1]));
  add("lift-reveal-header", (k) => k.box(FINISH.zinc, [-0.57, 0, 0], [1.14, 0.02, 1]));
  // The moving car has no wall collider in the consumer. Real stationary shaft
  // walls keep riders in the shaft even alongside another lift or a service void.
  add("elevator-shaft-wall", (k) => k.box(FINISH.concrete, [-0.5, 0, -0.5], [1, 1, 1]));
};
