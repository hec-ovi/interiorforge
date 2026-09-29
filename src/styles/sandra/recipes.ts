import type { Point } from '../../core/geom.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Vector3 } from '../../modules/types.js';
import { FINISH as F } from '../../modules/finishes.js';
import { softBox, tube, welt } from '../luxury/model-geometry.js';
import { vessel } from '../../modules/recipes/sanitary.js';
import { SANDRA_MATERIALS as M } from './materials.js';

function timber(k: Kit, at: Vector3, size: Vector3): void {
  softBox(k, M.timber, at, size, { radius: 0.003, planRadius: 0.004, detail: 0 });
}
function upholstered(k: Kit, at: Vector3, size: Vector3): void {
  softBox(k, M.cream, at, size, { radius: Math.min(0.034, size[1] * 0.28), planRadius: 0.044,
    crown: Math.min(0.012, size[1] * 0.13), wrinkles: 0.0027, detail: 8 });
}
function handles(k: Kit, x: number, y: number, z: number, width: number): void {
  tube(k, M.trim, [[x - width / 2, y, z - 0.007], [x - width / 2, y, z],
    [x + width / 2, y, z], [x + width / 2, y, z - 0.007]], 0.006, false, 10);
}
function books(k: Kit, x: number, y: number, z: number, count: number, span: number): void {
  const pitch = span / count;
  for (let i = 0; i < count; i++) {
    const width = pitch * (0.56 + (i % 3) * 0.12), h = 0.21 + (i % 4) * 0.032;
    const at = x - span / 2 + pitch * (i + 0.5);
    k.cbox(i % 4 === 0 ? M.red : i % 2 ? M.dark : M.panel, [at, y, z], [width, h, 0.20]);
    k.cbox(F.paper, [at, y + 0.006, z + 0.103], [width - 0.006, h - 0.012, 0.004]);
    for (const sy of [0.035, h - 0.04]) k.cbox(M.trim, [at, y + sy, z + 0.107], [width - 0.016, 0.004, 0.002]);
  }
}

/** A dense screen is a hierarchy of four real planes: structural surround,
 * deep translucent infill, long vertical strips and thinner crossing rails. */
function lattice(k: Kit, width: number, height: number, y: number, z: number, thin = false): void {
  const frame = thin ? 0.022 : 0.055, reach = thin ? 0.010 : 0.045;
  for (const x of [-width / 2 + frame / 2, width / 2 - frame / 2]) timber(k, [x, y, z], [frame, height, reach * 2]);
  for (const sy of [y, y + height - frame]) timber(k, [0, sy, z], [width - frame * 2, frame, reach * 2]);
  k.cbox(M.frost, [0, y + frame, z - reach * 0.65], [width - frame * 2, height - frame * 2, 0.008]);
  const count = Math.max(3, Math.floor((width - frame * 2) / 0.115));
  const pitch = (width - frame * 2) / count;
  for (let i = 1; i < count; i++) {
    const x = -width / 2 + frame + i * pitch;
    timber(k, [x, y + frame, z + reach * 0.35], [thin ? 0.012 : 0.018, height - frame * 2, reach * 0.60]);
  }
  for (const fraction of [0.12, 0.17, 0.72, 0.77, 0.88]) {
    timber(k, [0, y + height * fraction, z + reach * 0.75], [width - frame * 2, thin ? 0.01 : 0.016, reach * 0.48]);
  }
}

/** One authored frame family, with real single/double dimensions rather than
 * stretching pillow seams, leg thickness or joinery to make the narrower bed. */
function bed(k: Kit, width: number, depth: number): void {
  for (const x of [-width / 2 + 0.053, width / 2 - 0.053]) for (const z of [-depth / 2 + 0.085, depth / 2 - 0.085]) {
    timber(k, [x, 0, z], [0.072, 0.20, 0.072]);
  }
  timber(k, [0, 0.17, 0], [width, 0.12, depth]);
  upholstered(k, [0, 0.29, 0], [width - 0.1, 0.17, depth - 0.11]);
  const blanket = depth - 0.91;
  softBox(k, M.cream, [0, 0.46, depth / 2 - 0.075 - blanket / 2], [width - 0.12, 0.038, blanket],
    { radius: 0.014, crown: 0.008, wrinkles: 0.005, detail: 10 });
  for (const x of width < 1.3 ? [0] : [-0.36, 0.36]) upholstered(k, [x, 0.46, -depth / 2 + 0.4], [0.60, 0.09, 0.39]);
  timber(k, [0, 0.29, -depth / 2 + 0.031], [width, 0.26, 0.062]);
  const count = width < 1.3 ? 1 : 2, pitch = (width - 0.08) / count;
  for (let i = 0; i < count; i++) {
    upholstered(k, [-width / 2 + 0.04 + pitch * (i + 0.5), 0.315, -depth / 2 + 0.073], [pitch - 0.02, 0.20, 0.021]);
  }
}

/** Sandra's reference-led joinery. Dimensions are authoring choices in metres,
 * preserving the existing mid-income furniture footprints and passage reservations. */
export const sandraRecipes: RecipeSet = add => {
  add('wall-field-sandra-plaster', k => k.cbox(M.plaster, [0, 0, 0.0475], [0.5, 0.5, 0.095]));
  add('wall-field-sandra-wet', k => k.cbox(F.ivory, [0, 0, 0.0475], [0.5, 0.5, 0.095]));
  add('floor-slab-sandra-mat', k => {
    k.cbox(M.dark, [0, -0.15, 0], [0.5, 0.15, 0.5], undefined, ['north', 'south', 'east', 'west']);
    k.cbox(F.concrete, [0, -0.15, 0], [0.5, 0.15, 0.5], undefined, ['bottom']);
    // The material owns mat-size grain/borders. Stretching a room slab may not
    // stretch modeled trim or pretend every 0.5 m construction cell is a mat.
    k.cbox(M.mat, [0, -0.018, 0], [0.5, 0.018, 0.5], undefined, ['top']);
  });

  add('fit-sandra-lattice-screen', k => {
    for (const x of [-1.17, 1.17]) timber(k, [x, 0, 0], [0.11, 0.075, 0.5]);
    lattice(k, 2.5, 1.925, 0.075, 0);
    for (const x of [-0.417, 0.417]) timber(k, [x, 0.075, 0], [0.045, 1.925, 0.10]);
  });
  add('wall-art-sandra-lattice', k => lattice(k, 0.7, 1.05, 0, 0, true));

  add('fit-sandra-bamboo-case', k => {
    timber(k, [0, 0, 0], [3, 0.16, 0.5]);
    k.cbox(M.panel, [0, 0.16, 0], [2.90, 0.24, 0.45]);
    k.cbox(F.soil, [0, 0.385, 0], [2.85, 0.025, 0.41]);
    for (const x of [-1.477, 1.477]) timber(k, [x, 0.40, 0], [0.045, 1.56, 0.5]);
    timber(k, [0, 1.96, 0], [3, 0.04, 0.5]);
    k.cbox(F.glass, [0, 0.40, 0.239], [2.91, 1.56, 0.012]);
    k.cbox(M.dark, [0, 0.40, -0.239], [2.91, 1.56, 0.018]);
    for (let stem = 0; stem < 12; stem++) {
      const x = -1.27 + stem * 0.229, z = stem % 2 ? -0.045 : 0.045;
      const height = 1.22 + (stem % 4) * 0.055;
      k.cylinder(F.stem, [x, 0.41, z], 0.012 + (stem % 3) * 0.002, height, 12);
      for (let node = 1; node < 6; node++) {
        const y = 0.41 + node * height / 6;
        k.cylinder(F.leaf, [x, y, z], 0.016 + (stem % 3) * 0.002, 0.009, 12);
        if (node < 3) continue;
        const side = (node + stem) % 2 ? 1 : -1;
        const tip: Vector3 = [x + side * 0.095, y + 0.06, z + 0.018];
        tube(k, F.stem, [[x, y, z], tip], 0.003, false, 6);
        for (let leaf = 0; leaf < 4; leaf++) {
          k.leaf(F.leaf, [tip[0] - side * leaf * 0.014, tip[1], tip[2]],
            (side > 0 ? 0 : Math.PI) + (leaf - 1.5) * 0.22, 0.10 + leaf * 0.012, 0.022, 0.12);
        }
      }
    }
  });

  add('fit-sandra-sofa', k => {
    for (const x of [-0.79, 0.79]) for (const z of [-0.32, 0.32]) timber(k, [x, 0, z], [0.055, 0.22, 0.055]);
    timber(k, [0, 0.19, 0], [1.8, 0.10, 0.85]);
    for (const x of [-0.856, 0.856]) {
      timber(k, [x, 0.29, 0], [0.088, 0.27, 0.85]);
      timber(k, [x, 0.56, 0], [0.088, 0.026, 0.83]);
    }
    timber(k, [0, 0.29, -0.3875], [1.65, 0.51, 0.075]);
    for (const x of [-0.405, 0.405]) {
      upholstered(k, [x, 0.29, 0], [0.79, 0.20, 0.65]);
      upholstered(k, [x, 0.49, -0.302], [0.79, 0.27, 0.09]);
      welt(k, M.cream, [x, 0.362, 0], 0.78, 0.64, 0.047, 0.0017);
    }
  });

  add('fit-sandra-chair', k => {
    for (const x of [-0.199, 0.199]) for (const z of [-0.199, 0.199]) timber(k, [x, 0, z], [0.032, 0.43, 0.032]);
    timber(k, [0, 0.40, 0], [0.45, 0.03, 0.45]);
    upholstered(k, [0, 0.43, 0], [0.422, 0.06, 0.418]);
    for (const x of [-0.207, 0.207]) timber(k, [x, 0.43, -0.013], [0.025, 0.19, 0.025]);
    // The reference chair wraps around its sitter: curved timber rail and one
    // continuous upholstered back, rather than a flat board wearing fabric.
    const rail: Vector3[] = [], g = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] };
    const n = 24;
    const face = (i: number, inside: boolean, top: boolean): Vector3 => {
      const a = Math.PI + i / n * Math.PI, r = inside ? -0.007 : 0.007;
      return [(0.197 + r) * Math.cos(a), top ? 0.606 - 0.27 * Math.sin(a) : 0.52, -0.01 + (0.16 + r) * Math.sin(a)];
    };
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + i / n * Math.PI;
      rail.push([0.215 * Math.cos(a), 0.62 - 0.27 * Math.sin(a), -0.01 + 0.18 * Math.sin(a)]);
    }
    for (const inside of [false, true]) {
      const base = g.positions.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI + i / n * Math.PI, sign = inside ? -1 : 1;
        const nx = Math.cos(a) / 0.197, nz = Math.sin(a) / 0.16, length = Math.hypot(nx, nz);
        for (const top of [false, true]) {
          g.positions.push(...face(i, inside, top)); g.normals.push(sign * nx / length, 0, sign * nz / length);
          g.uvs.push(i / n * 0.59, top ? face(i, inside, true)[1] - 0.52 : 0);
        }
      }
      for (let i = 0; i < n; i++) {
        const p = base + i * 2;
        g.indices.push(...(inside ? [p, p + 2, p + 3, p, p + 3, p + 1] : [p, p + 1, p + 3, p, p + 3, p + 2]));
      }
    }
    k.mesh.addSurface(M.cream, g);
    for (let i = 0; i < n; i++) {
      k.mesh.addQuad(M.cream, [face(i, false, true), face(i, true, true), face(i + 1, true, true), face(i + 1, false, true)]);
      k.mesh.addQuad(M.cream, [face(i, true, false), face(i, false, false), face(i + 1, false, false), face(i + 1, true, false)]);
    }
    for (const i of [0, n]) {
      const cap = [face(i, false, false), face(i, true, false), face(i, true, true), face(i, false, true)] as [Vector3, Vector3, Vector3, Vector3];
      k.mesh.addQuad(M.cream, i === 0 ? cap : [cap[3], cap[2], cap[1], cap[0]]);
    }
    tube(k, M.timber, rail, 0.010, false, 12);
    tube(k, M.timber, rail.map(([x, , z]) => [x * 0.93, 0.515, (z + 0.01) * 0.91 - 0.01] as Vector3), 0.007, false, 10);
  });

  add('fit-sandra-low-table', k => {
    timber(k, [0, 0, 0], [0.52, 0.28, 0.31]);
    timber(k, [0, 0.28, 0], [0.73, 0.08, 0.39]);
    softBox(k, M.dark, [0, 0.36, 0], [0.9, 0.039, 0.5], { radius: 0.006, detail: 0 });
    // A restrained inlaid rectangle, not the luxury family's monumental stone slab.
    for (const x of [-0.214, 0.214]) k.cbox(M.trim, [x, 0.399, 0], [0.003, 0.001, 0.22]);
    for (const z of [-0.11, 0.11]) k.cbox(M.trim, [0, 0.399, z], [0.431, 0.001, 0.003]);
  });

  add('fit-sandra-bed', k => bed(k, 1.6, 2.1));
  add('fit-sandra-bed-single', k => bed(k, 1, 2.05));

  add('fit-sandra-bookcase', k => {
    for (const x of [-0.871, 0.871]) timber(k, [x, 0, 0], [0.058, 1.97, 0.5]);
    timber(k, [0, 0.09, -0.235], [1.684, 1.84, 0.03]);
    timber(k, [0, 1.94, 0], [1.8, 0.06, 0.5]);
    timber(k, [0.24, 0.09, 0], [0.036, 1.85, 0.46]);
    k.cbox(M.red, [-0.32, 0.14, -0.214], [1.06, 1.76, 0.012]);
    for (const y of [0.10, 0.50, 0.97, 1.45]) {
      timber(k, [-0.31, y, 0.01], [1.06, 0.035, 0.47]);
      books(k, -0.32, y + 0.035, 0.055, y === 0.97 ? 4 : 7, 0.88);
    }
    for (const y of [0.10, 0.66, 1.24]) timber(k, [0.557, y, 0.01], [0.57, 0.035, 0.47]);
    for (const y of [0.71, 1.28]) {
      vessel(k, F.ceramic, [{ x: 0.56, y, z: 0.015, rx: 0.012, rz: 0.012 },
        { x: 0.56, y: y + 0.012, z: 0.015, rx: 0.085, rz: 0.085 },
        { x: 0.56, y: y + 0.16, z: 0.015, rx: 0.10, rz: 0.10 },
        { x: 0.56, y: y + 0.25, z: 0.015, rx: 0.042, rz: 0.042 },
        { x: 0.56, y: y + 0.25, z: 0.015, rx: 0.032, rz: 0.032 },
        { x: 0.56, y: y + 0.018, z: 0.015, rx: 0.035, rz: 0.035 }], 28);
    }
    // One glazed display door beside the open book bays, with real bronze edging.
    k.cbox(F.glass, [0.557, 0.13, 0.234], [0.545, 1.76, 0.009]);
    for (const x of [0.284, 0.829]) k.cbox(M.trim, [x, 0.13, 0.241], [0.009, 1.76, 0.009]);
    for (const y of [0.13, 0.72, 1.30, 1.881]) k.cbox(M.trim, [0.557, y, 0.241], [0.554, 0.009, 0.009]);
  });

  add('fit-sandra-wardrobe', k => {
    for (const x of [-0.77, 0.77]) timber(k, [x, 0, 0], [0.06, 2, 0.65]);
    for (const y of [0.08, 1.94]) timber(k, [0, y, 0], [1.48, 0.06, 0.65]);
    k.cbox(M.red, [0, 0.14, -0.30], [1.48, 1.80, 0.035]);
    // Pale leaves overlap front/back planes, leaving the red central bay genuinely open.
    for (const [x, z] of [[-0.535, 0.286], [0.56, 0.267]] as const) {
      softBox(k, M.panel, [x, 0.16, z], [0.41, 1.76, 0.035], { radius: 0.004, detail: 0 });
      handles(k, x > 0 ? x - 0.13 : x + 0.13, 1.05, z + 0.025, 0.06);
    }
    for (const y of [0.145, 1.92]) k.cbox(M.trim, [0, y, 0.301], [1.47, 0.01, 0.016]);
    for (const y of [0.38, 1.52]) timber(k, [0, y, -0.012], [0.65, 0.035, 0.55]);
    books(k, 0, 1.555, -0.025, 5, 0.58);
    tube(k, M.trim, [[-0.30, 1.42, 0], [0.30, 1.42, 0]], 0.010, false, 12);
    for (const x of [-0.15, 0.15]) {
      tube(k, F.chrome, [[x, 1.42, 0], [x, 1.35, 0], [x - 0.105, 1.28, 0], [x + 0.105, 1.28, 0], [x, 1.35, 0]], 0.003, false, 8);
      softBox(k, x < 0 ? M.cream : M.dark, [x, 0.62, -0.025], [0.24, 0.65, 0.14], { radius: 0.025, taper: 0.16, wrinkles: 0.004, detail: 7 });
    }
  });

  add('fit-sandra-writing-desk', k => {
    for (const x of [-0.747, 0.747]) for (const z of [-0.335, 0.335]) timber(k, [x, 0, z], [0.035, 0.71, 0.035]);
    for (const x of [-0.747, 0.747]) k.cbox(M.trim, [x, 0.05, 0], [0.014, 0.018, 0.67]);
    timber(k, [0, 0.52, -0.344], [1.46, 0.16, 0.025]);
    const outline: Point[] = [[-0.8, -0.4], [0.8, -0.4], [0.8, 0.4]];
    for (let i = 0; i <= 20; i++) {
      const a = i / 20 * Math.PI;
      outline.push([0.31 * Math.cos(a), 0.4 - 0.14 * Math.sin(a)]);
    }
    outline.push([-0.8, 0.4]);
    k.mesh.addPrism(M.timber, outline, 0.71, 0.75);
    // A small shallow drawer sits behind the cutout, leaving seated knee volume free.
    timber(k, [0.56, 0.60, -0.05], [0.37, 0.11, 0.46]);
    handles(k, 0.56, 0.64, 0.19, 0.16);
  });

  add('fit-sandra-reception', k => {
    // A practical entry desk, with the lattice motif on the visitor face only.
    for (const x of [-1.26, 1.26]) timber(k, [x, 0, 0], [0.08, 1.06, 0.9]);
    timber(k, [0, 0.08, 0.37], [2.44, 0.94, 0.10]);
    for (let i = 0; i < 20; i++) timber(k, [-1.14 + i * 0.12, 0.19, 0.432], [0.017, 0.68, 0.020]);
    for (const y of [0.30, 0.35, 0.72, 0.77]) timber(k, [0, y, 0.436], [2.30, 0.014, 0.020]);
    timber(k, [0, 0.74, -0.055], [2.44, 0.035, 0.75]);
    softBox(k, M.dark, [0, 1.06, 0.31], [2.6, 0.04, 0.28], { radius: 0.005, detail: 0 });
    for (const x of [-0.94, 0.94]) timber(k, [x, 0.12, -0.09], [0.45, 0.60, 0.65]);
  });
};
