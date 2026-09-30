import type { Point } from '../../core/geom.js';
import { FINISH } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Vector3 } from '../../modules/types.js';
import { smoothSurface, softBox, tube, welt } from '../luxury/model-geometry.js';
import { pipe, vessel } from '../../modules/recipes/sanitary.js';
import { roundedSection } from '../systems/kitchen-modules.js';
import { capsuleShowerRecipes } from './shower.js';

const ENAMEL = 'cyberpunk/interior-capsule-enamel/mid#ivory';
const AMBER = 'cyberpunk/interior-capsule-enamel/mid#amber';
const PETROL = 'cyberpunk/interior-capsule-enamel/mid#petrol';
const HEX = 'cyberpunk/interior-capsule-hex/mid#field';
const UPHOLSTERY = 'cyberpunk/fabric/high_rich#1';

/** Manufactured shells have small rolled edges in elevation and larger plan corners.
 * Continuous shading prevents a faceted silhouette from reading as a toy block. */
function molded(k: Kit, slot: string, [x, y, z]: Vector3, [w, h, d]: Vector3, radius = 0.04, detail = 0): void {
  softBox(k, slot, [x, y, z], [w, h, d], {
    radius: Math.min(0.012, radius * 0.3, h * 0.2), planRadius: radius, detail,
  });
}

function cushion(k: Kit, slot: string, at: Vector3, size: Vector3, soft = 0.025): void {
  const upright = size[2] < size[1];
  softBox(k, slot, at, size, { radius: Math.min(0.045, size[1] * 0.3), planRadius: 0.065,
    crown: soft, frontCrown: upright ? Math.min(0.02, size[2] * 0.15) : 0, wrinkles: 0.0035, detail: 9 });
  // Upholstered backs have concealed edge seams; a horizontal loop would float
  // outside their double-curved corners rather than follow a sewn panel.
  if (upright) return;
  welt(k, slot, [at[0], at[1] + size[1] * 0.37, at[2]], size[0] - 0.008, size[2] - 0.008,
    Math.min(0.065, size[0] * 0.2, size[2] * 0.2), 0.0017);
}

function pull(k: Kit, x: number, y: number, z: number, width: number): void {
  k.cbox(FINISH.black, [x, y - 0.022, z - 0.003], [width + 0.035, 0.048, 0.014]);
  tube(k, FINISH.chrome, [[x - width / 2, y, z - 0.007], [x - width / 2, y, z],
    [x + width / 2, y, z], [x + width / 2, y, z - 0.007]], 0.008, false, 12);
}

function vents(k: Kit, x: number, y: number, z: number, width: number, n = 5): void {
  for (let i = 0; i < n; i++) k.cbox(FINISH.black, [x, y + i * 0.032, z], [width, 0.013, 0.005]);
}

function lens(k: Kit, x: number, y: number, z: number, width: number): void {
  k.cbox(FINISH.black, [x, y - 0.016, z - 0.002], [width + 0.04, 0.032, 0.028]);
  k.cbox(FINISH.lensCool, [x, y - 0.009, z], [width, 0.018, 0.03]);
}

function tap(k: Kit, x: number, base: number, spring: number, back: number, radius: number): void {
  const path: Vector3[] = [[x, base, back], [x, spring, back]];
  for (let i = 1; i <= 16; i++) {
    const angle = i / 16 * Math.PI;
    path.push([x, spring + radius * Math.sin(angle), back + radius - radius * Math.cos(angle)]);
  }
  path.push([x, spring - 0.02, back + 2 * radius]);
  pipe(k, path, 0.010);
}

/** An electric coil ring of `radius` on the hob at (x, y, z): a chrome trim ring, a flat
 *  spiral of round element two and a half turns in, its tail dropping into the plate. */
function coil(k: Kit, x: number, y: number, z: number, radius: number): void {
  k.turned(FINISH.chrome, [x, y, z], [[radius * 0.3, 0], [radius + 0.012, 0], [radius + 0.013, 0.003], [radius + 0.004, 0.003], [radius * 0.3, 0.001]], 32);
  const turns = 2.5, n = 72, path: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2, r = radius - t * (radius - 0.018);
    path.push([x + Math.cos(a) * r, y + 0.007, z + Math.sin(a) * r]);
  }
  path.push([x + 0.012, y + 0.003, z], [x + 0.012, y, z]);
  tube(k, FINISH.zinc, path, 0.0035, false, 6);
}

function roundedFace(w: number, h: number, y: number, radius: number): Point[] {
  const points: Point[] = [];
  for (const [cx, cy, start] of [[w / 2 - radius, y + radius, -90], [w / 2 - radius, y + h - radius, 0],
    [-w / 2 + radius, y + h - radius, 90], [-w / 2 + radius, y + radius, 180]]) {
    for (let i = 0; i <= 16; i++) {
      const angle = (start! + i * 90 / 16) * Math.PI / 180;
      points.push([cx! + Math.cos(angle) * radius, cy! + Math.sin(angle) * radius]);
    }
  }
  return points;
}

type OpeningSection = [width: number, height: number, bottom: number, radius: number, depth: number];

/** A closed manufactured surround swept through real depth. The corner profile is
 * fixed in metres; changing a straight span does not stretch its radius or maps. */
function openingShell(k: Kit, slot: string, sections: OpeningSection[]): void {
  const g = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] };
  const rings = sections.map(([w, h, y, r, z]) => roundedFace(w, h, y, r).map(([x, py]): Vector3 => [x, py, z]));
  const count = rings[0]!.length, distances = Array(count).fill(0) as number[];
  for (const [row, ring] of rings.entries()) {
    let along = 0;
    for (const [i, point] of ring.entries()) {
      if (i) along += Math.hypot(...point.map((value, axis) => value - ring[i - 1]![axis]!));
      if (row) distances[i]! += Math.hypot(...point.map((value, axis) => value - rings[row - 1]![i]![axis]!));
      g.positions.push(...point); g.uvs.push(along, distances[i]!);
    }
  }
  for (let row = 0; row < rings.length; row++) for (let i = 0; i < count; i++) {
    const a = row * count + i, b = row * count + (i + 1) % count;
    const c = ((row + 1) % rings.length) * count + i, d = ((row + 1) % rings.length) * count + (i + 1) % count;
    g.indices.push(a, b, d, a, d, c);
  }
  k.mesh.addSurface(slot, smoothSurface(g));
}

/** Nested reveal and separate rolled fascia, as seen from both sides of the bed. */
function nicheRim(k: Kit): void {
  openingShell(k, ENAMEL, [
    [2.50, 2, 0, .22, -.72], [2.50, 2, 0, .22, .605],
    [2.48, 1.98, .01, .215, .624], [2.29, 1.66, .25, .16, .624],
    [2.27, 1.64, .26, .15, .605], [2.27, 1.64, .26, .15, -.67],
    [2.29, 1.66, .25, .16, -.72],
  ]);
  openingShell(k, FINISH.black, [
    [2.475, 1.96, .015, .21, .623], [2.475, 1.96, .015, .21, .634],
    [2.245, 1.53, .35, .17, .634], [2.245, 1.53, .35, .17, .623],
  ]);
  openingShell(k, ENAMEL, [
    [2.465, 1.947, .025, .205, .631], [2.465, 1.947, .025, .205, .728],
    [2.449, 1.931, .033, .197, .743], [2.295, 1.581, .323, .196, .743],
    [2.269, 1.555, .336, .183, .731], [2.255, 1.54, .343, .176, .710],
    [2.255, 1.54, .343, .176, .631],
  ]);
  // Separate lower service hatches and short slots use a different seam rhythm
  // from the large quiet surround; no surface is tiled into decorative cells.
  for (const x of [-.585, .585]) {
    molded(k, ENAMEL, [x, .072, .746], [1.105, .16, .008], .017);
    vents(k, x, .116, .747, .48, 2);
    for (const sx of [-.50, .50]) tube(k, FINISH.zinc, [[x + sx, .205, .748], [x + sx, .205, .75]], .004, false, 8);
  }
}

/** Capture-led practical domestic furniture. All pieces have complete backs/undersides,
 * their own inset joints, and remain inside their planning reservation. */
export const capsuleRecipes: RecipeSet = add => {
  capsuleShowerRecipes(add);
  for (const [name, slot] of [['domestic', ENAMEL], ['utility', AMBER]] as const) {
    add(`wall-field-capsule-${name}`, k => k.cbox(slot, [0, 0, 0.0475], [0.5, 0.5, 0.095]));
  }
  add('wall-field-capsule-japantown-wet', k => {
    k.cbox('cyberpunk/tile/mid#mosaic', [0, 0, .0475], [.5, .5, .095]);
    // Two 250 mm tiles per planning cell. The cell remains a construction
    // interface; grout belongs to this utility finish only.
    const group = k.mesh.getGroup('cyberpunk/tile/mid#mosaic')!;
    for (let i = 0; i < group.uvs.length; i++) group.uvs[i]! *= 2;
  });
  add('floor-slab-capsule-japantown-wet', k => {
    k.cbox(FINISH.black, [0, -.15, 0], [.5, .15, .5], undefined, ['north', 'south', 'east', 'west']);
    k.cbox(FINISH.concrete, [0, -.15, 0], [.5, .15, .5], undefined, ['bottom']);
    k.cbox('cyberpunk/tile/mid#slab', [0, -.02, 0], [.5, .02, .5], undefined, ['top']);
  });
  for (const id of ['floor-slab-capsule-wet', 'floor-slab-capsule-hex']) add(id, k => {
    k.cbox(FINISH.black, [0, -0.15, 0], [0.5, 0.15, 0.5], undefined, ['north', 'south', 'east', 'west']);
    k.cbox(FINISH.concrete, [0, -0.15, 0], [0.5, 0.15, 0.5], undefined, ['bottom']);
    k.cbox(HEX, [0, -0.02, 0], [0.5, 0.02, 0.5], undefined, ['top']);
  });

  const sofaBase = (k: Kit): void => {
    molded(k, FINISH.black, [0, 0, 0], [1.62, 0.09, 0.69], .04, 10);
    molded(k, ENAMEL, [0, 0.09, 0], [1.8, 0.18, 0.84], 0.08, 10);
    for (const x of [-0.84, 0.84]) molded(k, ENAMEL, [x, 0.27, 0], [0.12, 0.31, 0.85], .04, 10);
    molded(k, ENAMEL, [0, 0.27, -0.355], [1.56, 0.53, 0.14], .04, 10);
    for (const x of [-0.39, 0.39]) {
      cushion(k, UPHOLSTERY, [x, 0.27, 0], [0.755, 0.22, 0.59], 0.012);
      cushion(k, UPHOLSTERY, [x, 0.49, -0.285], [0.755, 0.26, 0.14], 0.007);
    }
    for (const x of [-0.58, 0.58]) vents(k, x, 0.12, 0.422, 0.22, 2);
  };
  add('fit-capsule-sofa', sofaBase);
  add('fit-capsule-curved-sofa', k => {
    sofaBase(k);
    // Both reference lounges use a continuous curved seating boundary. Curve
    // the actual casing and sewn panels together, preserving the 0.49 m contact
    // height and leaving the original circulation reservation generous.
    for (const slot of k.mesh.materials()) {
      const group = k.mesh.getGroup(slot)!;
      for (let i = 0; i < group.positions.length; i += 3) {
        const x = group.positions[i]!, z = group.positions[i + 2]!;
        group.positions[i + 2] = z * .77 + .095 * (x / .9) ** 2 - .04;
        const derivative = .19 * x / (.9 ** 2);
        const nx = group.normals[i]! - derivative * group.normals[i + 2]! / .77;
        const ny = group.normals[i + 1]!, nz = group.normals[i + 2]! / .77, length = Math.hypot(nx, ny, nz);
        group.normals[i] = nx / length; group.normals[i + 1] = ny / length; group.normals[i + 2] = nz / length;
      }
    }
  });

  add('fit-capsule-low-table', k => {
    molded(k, FINISH.black, [0, 0, 0], [0.72, 0.05, 0.34]);
    molded(k, ENAMEL, [0, 0.05, 0], [0.84, 0.30, 0.44], 0.10);
    molded(k, FINISH.black, [0, 0.35, 0], [0.86, 0.012, 0.46]);
    molded(k, ENAMEL, [0, 0.362, 0], [0.9, 0.038, 0.5], 0.10);
    pull(k, 0, 0.24, 0.223, 0.22);
  });

  add('fit-capsule-chair', k => {
    for (const x of [-0.20, 0.20]) for (const z of [-0.20, 0.20]) k.cbox(FINISH.black, [x, 0, z], [0.03, 0.47, 0.03]);
    molded(k, ENAMEL, [0, 0.40, 0], [0.45, 0.03, 0.45]);
    cushion(k, UPHOLSTERY, [0, 0.43, 0], [0.42, 0.06, 0.42], 0.006);
    for (const x of [-0.20, 0.20]) k.cbox(FINISH.black, [x, 0.5, -0.20], [0.025, 0.40, 0.025]);
    molded(k, ENAMEL, [0, 0.62, -0.20], [0.45, 0.28, 0.05]);
    cushion(k, UPHOLSTERY, [0, 0.64, -0.16], [0.39, 0.22, 0.03], 0.003);
  });

  add('fit-capsule-table', k => {
    molded(k, FINISH.black, [0, 0, 0], [0.56, 0.035, 0.56]);
    k.cylinder(FINISH.zinc, [0, 0.035, 0], 0.085, 0.675, 12);
    molded(k, ENAMEL, [0, 0.71, 0], [0.9, 0.04, 0.9], 0.09);
  });

  add('fit-capsule-reception', k => {
    // Rear is open with seated knee space and 0.75 m worktop; accessible counter on right.
    for (const x of [-1.26, 1.26]) molded(k, ENAMEL, [x, 0, 0], [0.08, 1.06, 0.9]);
    molded(k, ENAMEL, [0, 0.07, 0.377], [2.44, 0.96, 0.11]);
    k.cbox(FINISH.black, [0, 0.74, -0.015], [2.44, 0.04, 0.80]);
    for (const x of [-0.91, 0.91]) {
      k.cbox(FINISH.charcoal, [x, 0.11, -0.035], [0.47, 0.61, 0.7]);
      for (const y of [0.22, 0.43, 0.64]) pull(k, x, y, -0.39, 0.20);
    }
    molded(k, ENAMEL, [-0.40, 1.06, 0.30], [1.8, 0.04, 0.30]);
    // Lower visitor ledge joins the upper part without increasing the planned footprint.
    molded(k, ENAMEL, [0.90, 0.76, 0.30], [0.80, 0.04, 0.30]);
    for (const x of [-0.80, -0.10]) vents(k, x, 0.81, 0.435, 0.40, 4);
    lens(k, 0, 0.02, 0.43, 2.3);
    k.cbox(FINISH.black, [-0.4, 0.53, 0.438], [0.48, 0.19, 0.012]);
    k.cbox(FINISH.art, [-0.4, 0.55, 0.446], [0.43, 0.15, 0.004]);
  });

  const kitchenBase = (k: Kit): void => {
    k.cbox(FINISH.black, [0, 0, -0.035], [2.32, 0.11, 0.58]);
    // Hollow cabinet shell: a full solid carcass would plug the actual basin cavity.
    for (const x of [-1.18, 1.18]) molded(k, FINISH.charcoal, [x, 0.11, -0.01], [0.04, 0.77, 0.63], 0.008);
    k.cbox(FINISH.charcoal, [0, 0.11, -0.305], [2.4, 0.77, 0.04]);
    k.cbox(FINISH.charcoal, [0, 0.11, -0.01], [2.4, 0.04, 0.63]);
    for (const x of [-0.90, -0.30, 0.30, 0.90]) {
      molded(k, ENAMEL, [x, 0.13, 0.291], [0.584, 0.73, 0.036], 0.012);
      pull(k, x, 0.79, 0.314, 0.25);
    }
    // Counter has a real basin opening; no solid countertop covers the sink recess.
    const sinkX = 0.65, sinkW = 0.50, sinkD = 0.38;
    // The slab stops 22 mm short of the front, where a rounded nose runs the whole length.
    k.cbox(ENAMEL, [-0.40, 0.88, -0.011], [1.6, 0.055, 0.628]);
    k.cbox(ENAMEL, [1.05, 0.88, -0.011], [0.3, 0.055, 0.628]);
    k.cbox(ENAMEL, [sinkX, 0.88, -0.2575], [sinkW, 0.055, 0.135]);
    k.cbox(ENAMEL, [sinkX, 0.88, 0.2465], [sinkW, 0.055, 0.113]);
    k.sweep(ENAMEL, roundedSection(0.88, 0.935, 0.303, 0.325, { topFront: 0.014, bottomFront: 0.006 }), -1.2, 1.2);
    // Fill the rectangular cut's corners up to the pressed bowl's rounded perimeter.
    const cut = (angle: number): Vector3 => {
      const c = Math.cos(angle), s = Math.sin(angle), reach = Math.min(0.25 / Math.max(1e-9, Math.abs(c)), 0.19 / Math.max(1e-9, Math.abs(s)));
      return [sinkX + c * reach, 0.935, s * reach];
    };
    const lip = (angle: number): Vector3 => [sinkX + Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** 0.4 * 0.236,
      0.935, Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** 0.4 * 0.175];
    const corner = Math.atan2(0.19, 0.25);
    const angles = [...Array.from({ length: 40 }, (_, i) => i * Math.PI / 20),
      corner, Math.PI - corner, Math.PI + corner, 2 * Math.PI - corner].sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!, b = angles[(i + 1) % angles.length]!;
      k.mesh.addQuad(ENAMEL, [lip(a), lip(b), cut(b), cut(a)]);
    }
    // Rolled stainless rim and pressed bowl; the profile descends through the opening.
    vessel(k, FINISH.chrome, [
      { x: sinkX, y: 0.74, rx: 0.015, rz: 0.015 },
      { x: sinkX, y: 0.74, rx: 0.16, rz: 0.11, power: 3 },
      { x: sinkX, y: 0.91, rx: 0.242, rz: 0.181, power: 5 },
      { x: sinkX, y: 0.935, rx: 0.25, rz: 0.19, power: 5 },
      { x: sinkX, y: 0.943, rx: 0.238, rz: 0.177, power: 5 },
      { x: sinkX, y: 0.926, rx: 0.226, rz: 0.166, power: 4 },
      { x: sinkX, y: 0.772, rx: 0.15, rz: 0.10, power: 3 },
      { x: sinkX, y: 0.758, rx: 0.015, rz: 0.015 },
    ], 40);
    k.cylinder(FINISH.black, [sinkX, 0.76, 0], 0.020, 0.002, 24);
    tap(k, 0.65, 0.936, 0.99, -0.255, 0.04);
    // A black enamel hob plate with four coil rings on chrome trims and a row of knobs.
    k.cbevel(FINISH.black, [-0.66, 0.935, 0], [0.60, 0.011, 0.47], 0.004);
    for (const x of [-0.80, -0.51]) for (const z of [-0.1, 0.1]) coil(k, x, 0.946, z, x < -0.6 === z < 0 ? 0.072 : 0.06);
    for (let i = 0; i < 4; i++) k.turned(FINISH.black, [-0.75 + i * 0.06, 0.946, 0.205], [[0, 0], [0.013, 0], [0.013, 0.012], [0.009, 0.017], [0, 0.017]], 16);
    k.cbox(ENAMEL, [0, 0.935, -0.3175], [2.4, 0.115, 0.015]);
  };
  add('fit-capsule-kitchen', kitchenBase);
  add('fit-capsule-japantown-kitchen', k => {
    kitchenBase(k);
    // Multi-angle kitchen captures show a complete shallow technical alcove:
    // tiled backing, deep side returns, suspended hood and a real task diffuser.
    // Its 2.35 m reservation is authored, never achieved by stretching the worktop.
    k.cbox('cyberpunk/tile/mid#mosaic', [0, 1.05, -.304], [2.18, 1.06, .025]);
    const tile = k.mesh.getGroup('cyberpunk/tile/mid#mosaic')!;
    for (let i = 0; i < tile.uvs.length; i++) tile.uvs[i]! *= 2;
    for (const x of [-1.145, 1.145]) molded(k, ENAMEL, [x, 1.05, -.005], [.11, 1.25, .63], .026);
    molded(k, ENAMEL, [0, 2.13, -.005], [2.4, .22, .64], .065);
    k.cbox(FINISH.charcoal, [0, 2.142, .312], [2.13, .172, .007]);
    for (let i = 0; i < 6; i++) {
      const y = 2.16 + i * .024;
      molded(k, ENAMEL, [0, y, .314], [2.08, .010, .018], .002);
    }
    for (const x of [-.72, 0, .72]) k.cbox(ENAMEL, [x, 2.15, .321], [.012, .156, .007]);
    molded(k, FINISH.black, [0, 2.085, .13], [1.91, .045, .22], .024);
    k.cbox(FINISH.lensCool, [0, 2.078, .11], [1.70, .012, .115]);
    // Two actual shelf ledges below the side controller, inside the working bay.
    for (const y of [1.33, 1.57]) molded(k, ENAMEL, [-.88, y, -.17], [.31, .024, .23], .012);
    molded(k, FINISH.black, [-.88, 1.77, -.268], [.28, .23, .06], .016);
    k.cbox(FINISH.art, [-.88, 1.801, -.233], [.228, .168, .008]);
  });

  add('fit-capsule-fridge', k => {
    k.cbox(FINISH.black, [0, 0, 0], [0.66, 0.08, 0.64]);
    molded(k, ENAMEL, [0, 0.08, -0.014], [0.7, 1.72, 0.672]);
    for (const [y, h] of [[0.13, 1.13], [1.28, 0.48]]) molded(k, ENAMEL, [0, y!, 0.32], [0.65, h!, 0.044], 0.018);
    for (const y of [1.14, 1.4]) pull(k, -0.16, y, 0.34, 0.22);
    vents(k, 0, 0.09, 0.327, 0.44, 1);
    k.cbox(FINISH.black, [0.16, 1.49, 0.345], [0.12, 0.10, 0.005]);
  });

  add('fit-capsule-basin', k => {
    // Japantown exposed-trap washbasin: no bulky luxury vanity or decorative mirror.
    vessel(k, FINISH.ceramic, [
      { y: 0.69, rx: 0.01, rz: 0.01, z: 0.022 },
      { y: 0.71, rx: 0.15, rz: 0.13, z: 0.022, power: 3 },
      { y: 0.82, rx: 0.24, rz: 0.214, power: 4 },
      { y: 0.845, rx: 0.25, rz: 0.225, power: 4 },
      { y: 0.85, rx: 0.24, rz: 0.215, power: 4 },
      { y: 0.85, rx: 0.209, rz: 0.17, z: 0.02, power: 3.2 },
      { y: 0.836, rx: 0.201, rz: 0.163, z: 0.02, power: 3.2 },
      { y: 0.74, rx: 0.086, rz: 0.075, z: 0.02 },
      { y: 0.728, rx: 0.01, rz: 0.01, z: 0.02 },
    ], 48);
    // The broad enamel apron is a separate molded skin under the ceramic rim.
    for (const x of [-0.14, 0.14]) molded(k, ENAMEL, [x, 0.68, -0.16], [0.04, 0.14, 0.12], 0.012);
    molded(k, ENAMEL, [0, 0.70, -0.205], [0.40, 0.17, 0.03], 0.014);
    const trap: Vector3[] = [[0, 0.699, 0.02], [0, 0.52, 0.02]];
    for (let i = 1; i <= 16; i++) {
      const angle = i / 16 * Math.PI;
      trap.push([0, 0.52 - 0.055 * Math.sin(angle), -0.035 + 0.055 * Math.cos(angle)]);
    }
    trap.push([0, 0.545, -0.09]);
    for (let i = 1; i <= 8; i++) {
      const angle = i / 8 * Math.PI / 2;
      trap.push([0, 0.545 + 0.02 * Math.sin(angle), -0.11 + 0.02 * Math.cos(angle)]);
    }
    trap.push([0, 0.565, -0.207]);
    pipe(k, trap, 0.018);
    for (const y of [0.66, 0.51]) k.cylinder(FINISH.zinc, [0, y, 0.02], 0.025, 0.023, 16);
    k.cylinder(FINISH.chrome, [0, 0.73, 0.02], 0.024, 0.003, 24);
    k.cylinder(FINISH.black, [0, 0.734, 0.02], 0.005, 0.001, 12);
    k.cbox(FINISH.chrome, [0, 0.808, -0.125], [0.041, 0.010, 0.006]);
    tap(k, 0, 0.85, 0.99, -0.18, 0.04);
    for (const x of [-0.060, 0.060]) {
      k.cylinder(FINISH.zinc, [x, 0.847, -0.18], 0.019, 0.032, 20);
      k.cylinder(FINISH.black, [x, 0.879, -0.18], 0.014, 0.004, 20);
    }
  });

  add('fit-capsule-bed', k => {
    molded(k, FINISH.black, [0, 0, 0], [1.48, 0.08, 1.96]);
    molded(k, ENAMEL, [0, 0.08, 0], [1.6, 0.19, 2.09], 0.07);
    cushion(k, UPHOLSTERY, [0, 0.27, 0], [1.5, 0.20, 2.0], 0.012);
    cushion(k, 'cyberpunk/fabric/mid#linen', [0, 0.47, 0.36], [1.47, 0.035, 1.15], 0.008);
    for (const x of [-0.36, 0.36]) cushion(k, 'cyberpunk/fabric/mid#linen', [x, 0.47, -0.66], [0.60, 0.08, 0.38], 0.018);
    for (const x of [-0.48, 0.48]) vents(k, x, 0.14, 1.047, 0.34, 2);
  });

  add('fit-capsule-wardrobe', k => {
    // H10's lit open wardrobe and Japantown's offset sliding leaves share the
    // same hollow carcass interface. The rail, carcass, fronts and shelves have
    // separate depth: oblique views must still reveal the usable compartments.
    openingShell(k, ENAMEL, [
      [1.6, 2, 0, .085, -.325], [1.6, 2, 0, .085, .295],
      [1.58, 1.98, .01, .075, .315], [1.45, 1.78, .11, .055, .315],
      [1.43, 1.76, .12, .045, .295], [1.43, 1.76, .12, .045, -.30],
    ]);
    k.cbox(FINISH.charcoal, [0, .07, -.298], [1.47, 1.86, .025]);
    k.cbox(FINISH.black, [0, .055, 0], [1.45, .065, .58]);
    for (const y of [.12, .40, 1.55]) molded(k, ENAMEL, [0, y, -.012], [1.44, .03, .54], .009);
    molded(k, ENAMEL, [-.16, .43, -.025], [.028, 1.12, .52], .008);
    // Two upper doors above a broad recessed horizontal rail.
    for (const x of [-.361, .361]) {
      molded(k, ENAMEL, [x, 1.60, .268], [.704, .29, .045], .016);
      pull(k, x + .19, 1.655, .296, .048);
      vents(k, x - .20, 1.72, .294, .052, 2);
    }
    for (const y of [.407, 1.57]) {
      k.cbox(FINISH.black, [0, y, .281], [1.43, .022, .022]);
      tube(k, FINISH.zinc, [[-.70, y + .011, .287], [.70, y + .011, .287]], .004, false, 12);
    }
    // The intentionally partially open slab slides in front of the central
    // divider, leaving both folded-storage and hanging bays visible.
    molded(k, ENAMEL, [.045, .445, .292], [.50, 1.105, .04], .018);
    pull(k, .224, 1.30, .316, .052);
    for (const y of [.485, 1.5]) tube(k, FINISH.zinc, [[-.155, y, .312], [-.155, y, .319]], .004, false, 8);
    tube(k, FINISH.chrome, [[.045, 1.43, -.01], [.66, 1.43, -.01]], .013, false, 16);
    for (const x of [.35, .48, .60]) {
      const hook: Vector3[] = [[x, 1.393, .025], [x, 1.465, .025], [x, 1.478, -.002], [x, 1.456, -.026]];
      tube(k, FINISH.zinc, hook, .0035, false, 10);
      tube(k, FINISH.zinc, [[x, 1.393, .025], [x - .042, 1.325, .16], [x + .042, 1.325, -.11], [x, 1.393, .025]], .0035, false, 10);
    }
    for (let i = 0; i < 3; i++) {
      cushion(k, i % 2 ? UPHOLSTERY : 'cyberpunk/fabric/mid#linen', [-.44, .43 + i * .040, -.012], [.32 - i * .015, .038, .34], .003);
      cushion(k, i % 2 ? 'cyberpunk/fabric/mid#linen' : UPHOLSTERY, [.46, .43 + i * .035, -.025], [.32, .033, .32 - i * .018], .003);
    }
    // A small fabric case with a real arched carry handle in the lower bay.
    cushion(k, UPHOLSTERY, [-.39, .15, -.015], [.45, .22, .35], .008);
    tube(k, FINISH.black, [[-.48, .37, -.03], [-.47, .391, -.03], [-.33, .391, -.03], [-.32, .37, -.03]], .006, false, 12);
    lens(k, .46, 1.532, .08, .41);
    lens(k, 0, 1.96, .275, 1.4);
  });

  add('fit-capsule-h10-wardrobe', k => {
    // H10 continuous elevation: a broad calm fascia above an open, lit clothes
    // recess, with narrow shelves beside it and an independent lower access hatch.
    openingShell(k, ENAMEL, [
      [1.6, 2, 0, .10, -.325], [1.6, 2, 0, .10, .29],
      [1.58, 1.98, .01, .09, .31], [1.41, 1.38, .32, .12, .31],
      [1.39, 1.36, .33, .11, .289], [1.39, 1.36, .33, .11, -.30],
    ]);
    k.cbox(FINISH.charcoal, [0, .25, -.295], [1.44, 1.48, .025]);
    molded(k, ENAMEL, [-.20, .35, -.015], [.04, 1.29, .55], .01);
    for (const y of [.35, .68, 1.01, 1.34]) molded(k, FINISH.charcoal, [-.456, y, -.005], [.47, .025, .52], .008);
    molded(k, FINISH.charcoal, [.24, .35, -.005], [.82, .03, .52], .012);
    molded(k, ENAMEL, [.24, 1.40, -.005], [.82, .03, .52], .012);
    tube(k, FINISH.chrome, [[-.12, 1.335, -.015], [.65, 1.335, -.015]], .012, false, 16);
    for (const x of [.04, .28, .49]) {
      tube(k, FINISH.zinc, [[x, 1.34, -.015], [x, 1.38, .015], [x, 1.40, -.012], [x, 1.37, -.038]], .0035, false, 10);
      tube(k, FINISH.zinc, [[x, 1.31, -.015], [x - .11, 1.24, -.015], [x + .11, 1.24, -.015], [x, 1.31, -.015]], .0035, false, 10);
    }
    for (const [x, y, w] of [[-.45, .705, .33], [-.47, 1.035, .30], [.29, 1.43, .35]]) {
      for (let i = 0; i < 3; i++) cushion(k, i % 2 ? UPHOLSTERY : 'cyberpunk/fabric/mid#linen', [x!, y! + i * .03, -.04], [w!, .028, .32], .003);
    }
    molded(k, ENAMEL, [0, .075, .307], [1.22, .18, .018], .018);
    pull(k, 0, .207, .317, .22);
    for (const x of [-.55, .55]) tube(k, FINISH.zinc, [[x, .107, .317], [x, .107, .323]], .004, false, 8);
    lens(k, .24, 1.395, .07, .70);
    lens(k, 0, 1.96, .275, 1.4);
  });

  add('fit-capsule-desk', k => {
    for (const x of [-0.74, 0.74]) k.cbox(ENAMEL, [x, 0, 0], [0.06, 0.71, 0.72]);
    k.cbox(FINISH.charcoal, [0, 0.24, -0.35], [1.42, 0.43, 0.035]);
    molded(k, ENAMEL, [0, 0.71, 0], [1.6, 0.04, 0.8], 0.06);
    k.cbox(FINISH.charcoal, [0.52, 0.37, -0.02], [0.35, 0.34, 0.62]);
    pull(k, 0.52, 0.58, 0.30, 0.17);
  });

  add('fit-capsule-shelf', k => {
    k.cbox(FINISH.charcoal, [0, 0, -0.235], [1.8, 2, 0.03]);
    for (const x of [-0.88, 0.88]) molded(k, ENAMEL, [x, 0, 0], [0.04, 2, 0.5], 0.01);
    for (const y of [0, 0.48, 0.96, 1.44, 1.96]) k.cbox(ENAMEL, [0, y, 0], [1.76, 0.04, 0.5]);
    for (const y of [0.04, 0.52, 1, 1.48]) for (let i = 0; i < 6; i++) {
      const x = -0.68 + i * 0.18;
      k.cbox(i % 2 ? FINISH.charcoal : FINISH.capsuleWall, [x, y, 0.03], [0.11, 0.24 + (i % 3) * 0.045, 0.28]);
    }
    lens(k, 0, 1.88, 0.15, 1.6);
  });

  add('wall-shelf-capsule', k => {
    k.cbox(ENAMEL, [0, 0, -0.12], [1.2, 0.4, 0.04]);
    for (const y of [0.03, 0.36]) molded(k, ENAMEL, [0, y, 0], [1.2, 0.04, 0.28], 0.02);
    for (const x of [-0.42, -0.12, 0.18]) k.cbox(FINISH.charcoal, [x, 0.07, 0], [0.14, 0.22, 0.18]);
    lens(k, 0, 0.04, 0.06, 1);
  });

  for (const identity of ['h10', 'japantown'] as const) {
  const drawNiche = (k: Kit): void => {
    // H10/Japantown: separate outer molding, dark liner, raised bed and deep service head.
    molded(k, ENAMEL, [0, .13, -.725], [2.32, 1.80, .05], .02);
    k.cbox(FINISH.charcoal, [0, 1.875, -0.01], [2.32, 0.065, 1.32]);
    k.cbox(FINISH.black, [0, 0, -0.05], [2.32, 0.27, 1.32]);
    molded(k, PETROL, [0, 0.27, 0], [2.30, 0.10, 1.35], 0.05);
    cushion(k, 'cyberpunk/fabric/mid#linen', [0, 0.37, 0], [2.20, 0.17, 1.25], 0.012);
    cushion(k, UPHOLSTERY, [0.26, 0.54, 0.02], [1.5, 0.035, 1.20], 0.008);
    for (const z of [-0.32, 0.32]) cushion(k, 'cyberpunk/fabric/mid#linen', [-0.78, 0.54, z], [0.44, 0.07, 0.50], 0.018);
    if (identity === 'h10') {
    // H10 service headboard: long recessed slot, divided upper cover and fasteners.
    k.cbox(FINISH.black, [0, 0.62, -0.64], [2.27, 0.40, 0.018]);
    for (const x of [-1.10, 1.10]) molded(k, ENAMEL, [x, 0.62, -0.60], [0.07, 0.40, 0.08], 0.025);
    molded(k, ENAMEL, [0, 0.62, -0.60], [2.15, 0.06, 0.08]);
    for (const x of [-0.725, 0, 0.725]) {
      molded(k, ENAMEL, [x, 0.84, -0.60], [0.710, 0.18, 0.08], 0.014);
      for (const sx of [-0.31, 0.31]) tube(k, FINISH.zinc, [[x + sx, 0.99, -0.566], [x + sx, 0.99, -0.556]], 0.004, false, 8);
    }
    for (const y of [1.15, 1.47, 1.79]) k.cbox(ENAMEL, [0.47, y, -0.53], [1.10, 0.035, 0.27]);
    for (let i = 0; i < 5; i++) k.cbox(i % 2 ? FINISH.charcoal : AMBER, [0.03 + i * 0.17, 1.185, -0.55], [0.11, 0.20 + i % 2 * 0.045, 0.20]);
    k.cbox(FINISH.black, [-0.70, 1.11, -0.61], [0.56, 0.43, 0.07]);
    k.cbox(FINISH.art, [-0.70, 1.14, -0.571], [0.50, 0.37, 0.008]);
    } else {
      // Japantown relocates storage to the sidewall, keeps the rear elevation
      // calm and sets a larger display above a wraparound raised bed liner.
      for (const x of [-1.09, 1.09]) molded(k, PETROL, [x, .32, -.055], [.10, .40, 1.14], .018);
      molded(k, PETROL, [0, .32, -.60], [2.22, .40, .10], .018);
      molded(k, ENAMEL, [.16, .585, -.537], [1.35, .105, .017], .012);
      for (const x of [-.42, .68]) vents(k, x, .62, -.527, .11, 1);
      k.cbox(FINISH.black, [-1.116, 1.02, -.03], [.035, .57, .90]);
      for (const y of [1.02, 1.285, 1.55]) molded(k, ENAMEL, [-1.035, y, -.045], [.18, .026, .85], .008);
      for (let i = 0; i < 5; i++) {
        const z = -.36 + i * .14;
        k.cbox(i % 2 ? FINISH.charcoal : AMBER, [-1.035, 1.055, z], [.115, .15 + (i % 3) * .025, .075]);
      }
      molded(k, FINISH.black, [.24, 1.03, -.64], [.77, .56, .048], .026);
      k.cbox(FINISH.art, [.24, 1.069, -.612], [.692, .48, .008]);
      // Actual narrow panel joints and fasteners around the display, rather than
      // painting tiny tiles over a broad molded wall field.
      k.cbox(FINISH.charcoal, [.79, .73, -.697], [.004, 1.065, .003]);
      k.cbox(FINISH.charcoal, [.16, 1.78, -.697], [1.26, .004, .003]);
      for (const x of [-.45, .76]) tube(k, FINISH.zinc, [[x, 1.76, -.69], [x, 1.76, -.68]], .004, false, 8);
    }
    lens(k, 0, 1.859, -0.59, 1.9);
    nicheRim(k);
    // Fixture origins deliberately match furniture-lights.ts; diffuser bodies stay inside
    // the reserved face, the emitted-light point is 2 mm beyond it.
    for (const x of [-1.195, 1.195]) for (const [lo, hi] of [[0.58, 1.02], [1.12, 1.62]]) {
      if (identity === 'japantown') {
        k.cbox(FINISH.black, [x, lo! - 0.025, 0.728], [0.050, hi! - lo! + 0.05, 0.025]);
        tube(k, FINISH.ledCyan, [[x, lo!, .737], [x, hi!, .737]], .013, false, 16);
      } else {
        // H10 has recessed dark service slots, not Japantown's lit tubes. The
        // narrow raised cover edge leaves an actual shallow well around its base.
        k.cbox(FINISH.black, [x, lo!, .744], [.038, hi! - lo!, .003]);
        for (const side of [-1, 1]) k.cbox(ENAMEL, [x + side * .022, lo! - .010, .747], [.006, hi! - lo! + .020, .006]);
        for (const y of [lo! - .010, hi!]) k.cbox(ENAMEL, [x, y, .747], [.050, .010, .006]);
      }
    }
  };
  add(`fit-capsule-${identity}-niche`, drawNiche);
  if (identity === 'h10') add('fit-capsule-sleeping-niche', drawNiche);
  }
};
