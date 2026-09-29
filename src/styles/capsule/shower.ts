import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Vector3 } from '../../modules/types.js';
import { FINISH as F } from '../../modules/finishes.js';
import { pipe } from '../../modules/recipes/sanitary.js';
import { softBox } from '../luxury/model-geometry.js';

const ENAMEL = 'cyberpunk/interior-capsule-enamel/mid#amber';
const GLASS = 'cyberpunk/bathroom-glass/rich#clear';
const skin = (k: Kit, at: Vector3, size: Vector3) => softBox(k, ENAMEL, at, size, { radius: 0.007, planRadius: 0.014, detail: 0 });

/** Japantown wet-service recess: independent tray, wall panels, screens and fittings.
 * Every part's own bounds are its collider. The open mouth has no static leaf. */
const PARTS: Record<string, (k: Kit) => void> = {
  tray: k => {
    skin(k, [0, 0, 0], [1.3, 0.04, 1.1]);
    k.cbox(F.ceramic, [0, 0.04, 0.01], [1.26, 0.015, 1.04]);
    for (const x of [-0.635, 0.635]) k.cbox(F.zinc, [x, 0.04, 0], [0.03, 0.026, 1.1]);
    k.cbox(F.zinc, [0, 0.04, -0.535], [1.24, 0.026, 0.03]);
    k.cbox(F.chrome, [0, 0.055, -0.40], [0.48, 0.005, 0.08]);
    for (let i = 0; i < 16; i++) k.cbox(F.black, [-0.216 + i * 0.0288, 0.06, -0.40], [0.011, 0.001, 0.06]);
  },
  back: k => {
    k.cbox(F.black, [0, 0.066, -0.535], [1.3, 2.134, 0.03]);
    for (const x of [-0.327, 0.327]) skin(k, [x, 0.076, -0.515], [0.636, 2.114, 0.028]);
    for (const x of [-0.59, 0.59]) for (const y of [0.14, 2.11]) pipe(k, [[x, y, -0.505], [x, y, -0.495]], 0.005);
  },
  'left-screen': k => {
    k.cbox(GLASS, [-0.635, 0.082, 0], [0.012, 2.09, 1.07]);
    for (const z of [-0.53, 0.53]) k.cbox(F.zinc, [-0.635, 0.066, z], [0.025, 2.11, 0.02]);
  },
  'right-screen': k => {
    k.cbox(GLASS, [0.635, 0.082, 0], [0.012, 2.09, 1.07]);
    for (const z of [-0.53, 0.53]) k.cbox(F.zinc, [0.635, 0.066, z], [0.025, 2.11, 0.02]);
  },
  riser: k => {
    pipe(k, [[0, 0.96, -0.466], [0, 2.065, -0.466]], 0.014);
    for (const y of [1.17, 1.88]) k.cbox(F.chrome, [0, y, -0.48], [0.055, 0.025, 0.045]);
  },
  head: k => {
    const bend: Vector3[] = [[0, 2.065, -0.466]];
    for (let i = 1; i <= 12; i++) {
      const angle = i / 12 * Math.PI / 2;
      bend.push([0, 2.065 + 0.09 * Math.sin(angle), -0.376 - 0.09 * Math.cos(angle)]);
    }
    bend.push([0, 2.155, -0.13]);
    pipe(k, bend, 0.014);
    k.cylinder(F.chrome, [0, 2.125, -0.13], 0.115, 0.025, 40);
    k.cylinder(F.black, [0, 2.122, -0.13], 0.104, 0.003, 40);
    for (let ring = 1; ring <= 3; ring++) for (let i = 0; i < ring * 8; i++) {
      const angle = i / (ring * 8) * Math.PI * 2;
      k.cylinder(F.ceramic, [Math.cos(angle) * ring * 0.028, 2.120, -0.13 + Math.sin(angle) * ring * 0.028], 0.0025, 0.002, 6);
    }
  },
  controls: k => {
    skin(k, [-0.29, 0.99, -0.46], [0.22, 0.35, 0.075]);
    for (const x of [-0.34, -0.24]) pipe(k, [[x, 1.10, -0.418], [x, 1.10, -0.39]], 0.023);
    k.cbox(F.black, [-0.29, 1.23, -0.419], [0.13, 0.055, 0.007]);
    k.cbox(F.chrome, [0.31, 0.98, -0.43], [0.30, 0.017, 0.17]);
    for (const x of [0.24, 0.36]) {
      k.cylinder(F.ceramic, [x, 0.997, -0.43], 0.027, x < 0.3 ? 0.16 : 0.12, 24);
      k.cylinder(F.black, [x, x < 0.3 ? 1.157 : 1.117, -0.43], 0.018, 0.014, 20);
    }
  },
};

export const CAPSULE_SHOWER_PARTS = Object.keys(PARTS).map(part => `fit-capsule-shower-${part}`);
export const capsuleShowerRecipes: RecipeSet = add => {
  add('fit-capsule-shower', k => { for (const draw of Object.values(PARTS)) draw(k); });
  for (const [part, draw] of Object.entries(PARTS)) add(`fit-capsule-shower-${part}`, draw);
};
