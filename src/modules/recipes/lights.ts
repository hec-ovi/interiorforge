import { FINISH } from "../finishes.js";
import type { Kit } from "../kit.js";
import type { RecipeSet } from "../recipes.js";

/** Light housings. Each stands at its light record's position: y = 0 is the emitting face,
 *  x runs along the record's length, and the lens wears a lit diffuser key. */
export const lightRecipes: RecipeSet = (add) => {
  // A 230 mm architectural downlight: rolled bezel, dark cutoff baffle, reflector
  // and 72 mm optic. The real opening remains hollow in front of the emitting face.
  for (const [name, lens] of [["", FINISH.lensWarm], ["-cool", FINISH.lensCool]] as const) {
    add(`ceiling-spot${name}`, (k) => {
      turned(k, FINISH.zinc, [[.110, -.029], [.115, -.025], [.115, -.017], [.110, -.012],
        [.092, -.012], [.086, -.019], [.086, -.028]]);
      turned(k, FINISH.black, [[.0858, -.028], [.091, -.019], [.091, .070], [.076, .070],
        [.076, -.023]]);
      // Satin reflector sits inside the black baffle, surrounding (never covering) the optic.
      turned(k, FINISH.chrome, [[.075, -.023], [.075, -.015], [.040, .004], [.037, .003], [.037, -.001]]);
      k.cylinder(lens, [0, 0, 0], .0365, .004, 64);
      k.cylinder(FINISH.black, [0, .070, 0], .091, .009, 64);
    });
  }
  // Recessed linear channel: formed side rails, dark setback and separate opal diffuser.
  add("ceiling-led-strip", (k) => {
    k.cbox(FINISH.black, [0, .014, 0], [.5, .040, .096]);
    for (const z of [-.050, .050]) {
      k.cbox(FINISH.zinc, [0, -.020, z], [.5, .074, .012]);
      k.cbox(FINISH.zinc, [0, -.020, z * 1.18], [.5, .008, .012]);
    }
    for (const x of [-.246, .246]) k.cbox(FINISH.zinc, [x, -.020, 0], [.008, .074, .092]);
    k.cbox(FINISH.lensCool, [0, 0, 0], [.480, .006, .072]);
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

/** Closed revolved profile, CCW in radius/height. 64 sides keep a circular silhouette
 * close to the camera; annular faces preserve the opening and correct inward normals. */
function turned(k: Kit, slot: string, profile: readonly (readonly [number, number])[]): void {
  const sides = 64;
  const at = (p: readonly [number, number], t: number): [number, number, number] => [Math.cos(t) * p[0], p[1], Math.sin(t) * p[0]];
  for (let j = 0; j < profile.length; j++) {
    const a = profile[j]!, b = profile[(j + 1) % profile.length]!;
    for (let i = 0; i < sides; i++) {
      const u = i * Math.PI * 2 / sides, v = (i + 1) * Math.PI * 2 / sides;
      k.mesh.addQuad(slot, [at(a, u), at(b, u), at(b, v), at(a, v)]);
      // Smooth around the turned circumference, preserving the designed profile's
      // sharp folds. Flat quad normals make even a 64-sided metal can look faceted.
      const dr = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dr, dy);
      const normals = k.mesh.getGroup(slot)!.normals;
      const start = normals.length - 12;
      for (const [j, angle] of [u, u, v, v].entries()) {
        normals[start + j * 3] = Math.cos(angle) * dy / length;
        normals[start + j * 3 + 1] = -dr / length;
        normals[start + j * 3 + 2] = Math.sin(angle) * dy / length;
      }
    }
  }
}
