import { LIFT_CAR, LIFT_LANDING } from "../../geometry/lift-spec.js";
import { bevelSlab, facing, stud } from "../../styles/systems/surface-shapes.js";
import { FINISH } from "../finishes.js";
import type { Kit } from "../kit.js";
import type { RecipeSet } from "../recipes.js";

/** One leaf of a centre-opening pair, on `side` of x = 0 and `width` wide, from `back` to
 *  `front` with its finished face towards +z. Its vertical edges are bevelled, so a shut pair
 *  shows a fine V where the leaves meet and never a gap, and nothing straddles x = 0, where
 *  the consumer splits the module into its two sliders. A kick plate and a head rail stand
 *  proud of the face. */
function leaf(k: Kit, side: -1 | 1, width: number, [y0, y1]: readonly [number, number], [back, front]: readonly [number, number]): void {
  const [x0, x1] = side < 0 ? [-width, 0] : [0, width];
  bevelSlab(k, FINISH.liftCar, [x0, x1], [y0, y1], back, front, { radius: 0.005, segments: 2 }, { bottom: false, top: false });
  facing(k, FINISH.liftCar, [[x0, y0, back], [x1, y0, back], [x1, y1, back], [x0, y1, back]], [0, 0, -1]);
  for (const [y, up] of [[y0, -1], [y1, 1]] as const)
    facing(k, FINISH.liftCar, [[x0, y, back], [x1, y, back], [x1, y, front], [x0, y, front]], [0, up, 0]);
  const a = x0 + 0.014, b = x1 - 0.014;
  stud(k, FINISH.zinc, [(a + b) / 2, y0 + 0.012 + 0.06], [b - a, 0.12], front, front + 0.003);
  stud(k, FINISH.zinc, [(a + b) / 2, y1 - 0.075], [b - a, 0.035], front, front + 0.003);
}

/** Moving car, car front and leaves retain their consumer IDs. Stationary landing fittings
 * must remain separate: the consumer splits every triangle of `lift-doors` and
 * `lift-car-doors` into sliding leaves at x = 0. */
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
  // The car's own front rides with it, placed at the car front plane unscaled in depth and
  // height: its leaves close the car whenever it is not standing open at a landing, and the
  // head and sill close the car front above and below them, so nothing of the shaft shows.
  add("lift-car-doors", (k) => {
    const d = LIFT_CAR.door;
    for (const side of [-1, 1] as const) leaf(k, side, d.leaf, [d.bottom, d.height], d.plane);
  });
  add("lift-car-head", (k) => {
    const c = LIFT_CAR, d = c.door, half = c.doorWidth / 2 + 0.04, reach = c.width / 2;
    k.box(FINISH.liftCar, [-half, d.head, d.plane[0]], [2 * half, c.ceiling - d.head, c.wall - d.plane[0]]);
    k.box(FINISH.zinc, [-c.doorWidth / 2, d.head, c.wall], [c.doorWidth, 0.03, 0.003], undefined, ["north", "east", "west", "top", "bottom"]);
    // The sill carries the leaves across their whole travel, flush with the car floor, with
    // the groove their guides run in under the leaves' middle.
    const mid = (d.plane[0] + d.plane[1]) / 2, groove = [mid - 0.004, mid + 0.004] as const;
    k.box(FINISH.zinc, [-reach, -0.03, -d.sill], [2 * reach, 0.03, groove[0] + d.sill]);
    k.box(FINISH.zinc, [-reach, -0.03, groove[1]], [2 * reach, 0.03, -groove[1]]);
    k.box(FINISH.charcoal, [-reach, -0.03, groove[0]], [2 * reach, 0.022, groove[1] - groove[0]], undefined, ["top"]);
  });
  add("lift-doors", (k) => {
    // Sheet-metal geometry supplies the split; a texture of a whole elevator must never be
    // repeated on each leaf. The pair meets at x = 0 with no seam and is wider than the
    // doorway, so each leaf closes behind its jamb.
    for (const side of [-1, 1] as const) leaf(k, side, LIFT_LANDING.leaf, [0, LIFT_LANDING.height], LIFT_LANDING.plane);
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
