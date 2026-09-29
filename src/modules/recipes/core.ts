import { tube } from "../../styles/luxury/model-geometry.js";
import { FINISH } from "../finishes.js";
import type { RecipeSet } from "../recipes.js";

/** Window returns and stair flights, as the core places them. */
export const coreRecipes: RecipeSet = (add) => {
  add("window-return", (k) => {
    k.box(FINISH.reveal, [-0.27, -0.02, 0], [0.02, 0.54, 0.5]);
    k.box(FINISH.reveal, [0.25, -0.02, 0], [0.02, 0.54, 0.5]);
    k.box(FINISH.reveal, [-0.25, -0.02, 0], [0.5, 0.02, 0.5]);
    k.box(FINISH.reveal, [-0.25, 0.5, 0], [0.5, 0.02, 0.5]);
  });
  // the flight family keeps the tread depth while placement scales width and rise
  for (let n = 7; n <= 14; n++) {
    add(`stair-flight-${n}`, (k) => {
      // One closed stair slab: stepped walking surface over a single sloping
      // soffit. The underside meets both landing soffits at exactly 150 mm below
      // their walking planes instead of exposing a sawtooth stack of blocks.
      const width = 1.45, rise = .17, tread = .28, thickness = .15;
      for (let i = 0; i < n; i++) {
        const z0 = i * tread, z1 = (i + 1) * tread, top = (i + 1) * rise - .012;
        const bottom0 = i * rise - thickness, bottom1 = (i + 1) * rise - thickness;
        k.mesh.addQuad(FINISH.concrete, [[0, top, z0], [0, top, z1], [width, top, z1], [width, top, z0]]);
        k.mesh.addQuad(FINISH.mineral, [[0, i ? i * rise - .012 : -thickness, z0], [0, top, z0],
          [width, top, z0], [width, i ? i * rise - .012 : -thickness, z0]]);
        // The downward face is a separate ceiling piece, owned by the floor
        // below. Side profiles retain the exact canonical collision bounds.
        k.mesh.addQuad(FINISH.mineral, [[0, bottom0, z0], [0, bottom1, z1], [0, top, z1], [0, top, z0]]);
        k.mesh.addQuad(FINISH.mineral, [[width, bottom0, z0], [width, top, z0], [width, top, z1], [width, bottom1, z1]]);
      }
      k.mesh.addQuad(FINISH.mineral, [[0, n * rise - thickness, n * tread], [width, n * rise - thickness, n * tread],
        [width, n * rise - .012, n * tread], [0, n * rise - .012, n * tread]]);
      // The shared round handrails also retain the consumer's canonical guard
      // bounds. Tier-specific infill is a separate narrow side component.
      for (const x of [.0375, width - .0375]) tube(k, 'cyberpunk/interior-service-gunmetal/poor#aged',
        [[x, 1.11, .025], [x, n * rise + 1.11, n * tread - .025]], .020, false, 16);
    });
  }
  for (let index = 0; index < 14; index++) {
    add(`stair-soffit-${index}`, k => {
    const normal = [0, -.28 / Math.hypot(.28, .17), .17 / Math.hypot(.28, .17)];
    k.mesh.addSurface(FINISH.mineral, {
      positions: [0, -.15, 0, 1.45, -.15, 0, 1.45, .02, .28, 0, .02, .28],
      normals: [...normal, ...normal, ...normal, ...normal],
      uvs: [0, index * .17, 1.45, index * .17, 1.45, (index + 1) * .17, 0, (index + 1) * .17],
      indices: [0, 1, 2, 0, 2, 3],
    });
    });
    // A tiny wall-pocket return seals the grazing gap between the sloped
    // underside and its solid wall. It stays inside the canonical step box;
    // its sloping top is owned by the main soffit, never duplicated here.
    for (const side of ['left', 'right']) add(`stair-soffit-return-${side}-${index}`, k => {
      const a = side === 'left' ? 0 : -.002, b = a + .002;
      k.mesh.addSurface(FINISH.mineral, {
        positions: [a, -.15, 0, a, -.15, .28, a, .02, .28],
        normals: [-1, 0, 0, -1, 0, 0, -1, 0, 0],
        uvs: [0, index * .17, .28, index * .17, .28, (index + 1) * .17], indices: [0, 1, 2],
      });
      k.mesh.addSurface(FINISH.mineral, {
        positions: [b, -.15, 0, b, .02, .28, b, -.15, .28],
        normals: [1, 0, 0, 1, 0, 0, 1, 0, 0],
        uvs: [0, index * .17, .28, (index + 1) * .17, .28, index * .17], indices: [0, 1, 2],
      });
      k.mesh.addQuad(FINISH.mineral, [[a, -.15, 0], [b, -.15, 0], [b, -.15, .28], [a, -.15, .28]]);
      k.mesh.addQuad(FINISH.mineral, [[a, -.15, .28], [b, -.15, .28], [b, .02, .28], [a, .02, .28]]);
    });
  }
};
