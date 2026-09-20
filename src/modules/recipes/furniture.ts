import type { UvMode } from "../../glb/mesh-builder.js";
import { FINISH } from "../finishes.js";
import type { Kit } from "../kit.js";
import type { RecipeSet } from "../recipes.js";
import type { Vector3 } from "../types.js";

/** A lit line, centred on the point its light record aims from: 18 mm of diffuser in a
 *  30 mm reveal, so the strip reads as a joint and never as a bar. */
function lens(k: Kit, [cx, cy, cz]: Vector3, length: number, along: "x" | "z" = "x", slot: string = FINISH.lensWarm, section = 0.018): void {
  const size: Vector3 = along === "x" ? [length, section, 0.03] : [0.03, section, length];
  k.cbox(slot, [cx, cy - section / 2, cz], size);
}

/** n boxes evenly spaced across a span: timber slats, door leaves, panel runs. */
function slats(k: Kit, slot: string, n: number, [cx, y, cz]: Vector3, [span, h, d]: Vector3, width: number, uv: UvMode = "world"): void {
  const pitch = span / n;
  for (let i = 0; i < n; i++) k.cbox(slot, [cx - span / 2 + pitch * (i + 0.5), y, cz], [width, h, d], uv);
}

/** Vessels standing on a shelf: glass and bronze alternating, three heights in rotation. */
function bottles(k: Kit, n: number, [cx, y, cz]: Vector3, span: number, radius = 0.035, base = 0.25): void {
  const pitch = span / n;
  for (let i = 0; i < n; i++) {
    k.cylinder(i % 2 ? FINISH.bronze : FINISH.glass, [cx - span / 2 + pitch * (i + 0.5), y, cz], radius, base + (i % 3) * 0.035, 6);
  }
}

/** A tuft that keeps inside its planter: the leaves fan along x, their reach and rise capped
 *  by the box they grow in, so no leaf crosses the module footprint. */
function tuft(k: Kit, [x, y, z]: Vector3, height: number, reach: number, seed: number, leaves = 7): void {
  k.rod(FINISH.stem, [x, y, z], [x, y + height, z], 0.02);
  for (let i = 0; i < leaves; i++) {
    const t = Math.abs(Math.sin((seed + i) * 127.1) * 43758.5453 % 1);
    const heading = (i % 2 ? 0 : Math.PI) + (t - 0.5) * 0.7;
    k.leaf(FINISH.leaf, [x, y + height * (0.2 + 0.45 * t), z], heading, reach * (0.55 + 0.45 * t), reach * 0.3, 0.3 + 0.4 * t);
  }
}

/** Built-in furniture; authored per piece. Every piece stands on y = 0, centred in XZ, back
 *  to -z and front to +z, at the canonical size the placement table scales from. */
export const furnitureRecipes: RecipeSet = (add) => {
  add("fit-sofa", (k) => {
    for (const x of [-0.78, 0.78]) for (const z of [-0.32, 0.32]) k.rod(FINISH.bronze, [x, 0, z], [x, 0.05, z], 0.06);
    k.cbox(FINISH.timber, [0, 0.05, 0], [1.68, 0.16, 0.73]);
    for (const x of [-0.815, 0.815]) k.cbox(FINISH.timber, [x, 0.21, 0], [0.17, 0.37, 0.85]);
    for (const x of [-0.375, 0.375]) k.cbox(FINISH.fabric, [x, 0.21, 0.105], [0.71, 0.24, 0.59]);
    // the backrest leans 0.09 over its height, so the cushion face is not parallel to the plinth
    const [zf0, zf1, zb0, zb1] = [-0.2, -0.29, -0.32, -0.41], [y0, y1] = [0.42, 0.8], [xa, xb] = [-0.73, 0.73];
    const q = (v: [Vector3, Vector3, Vector3, Vector3]): void => k.mesh.addQuad(FINISH.fabric, v);
    q([[xb, y0, zf0], [xb, y1, zf1], [xa, y1, zf1], [xa, y0, zf0]]);
    q([[xa, y0, zb0], [xa, y1, zb1], [xb, y1, zb1], [xb, y0, zb0]]);
    q([[xa, y1, zb1], [xa, y1, zf1], [xb, y1, zf1], [xb, y1, zb1]]);
    q([[xa, y0, zb0], [xb, y0, zb0], [xb, y0, zf0], [xa, y0, zf0]]);
    q([[xb, y0, zb0], [xb, y1, zb1], [xb, y1, zf1], [xb, y0, zf0]]);
    q([[xa, y0, zf0], [xa, y1, zf1], [xa, y1, zb1], [xa, y0, zb0]]);
  });

  add("fit-chair", (k) => {
    for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) k.rod(FINISH.bronze, [x, 0, z], [x, 0.44, z], 0.03);
    k.cbox(FINISH.fabric, [0, 0.44, 0], [0.42, 0.12, 0.42]);
    for (const x of [-0.21, 0.21]) k.rod(FINISH.bronze, [x, 0.44, -0.21], [x, 0.9, -0.21], 0.03);
    k.rod(FINISH.bronze, [-0.21, 0.885, -0.21], [0.21, 0.885, -0.21], 0.03);
    k.cbox(FINISH.fabric, [0, 0.46, -0.165], [0.38, 0.42, 0.06]);
  });

  add("fit-stool", (k) => {
    for (const x of [-0.185, 0.185]) for (const z of [-0.185, 0.185]) {
      k.rod(FINISH.bronze, [x, 0.0044, z], [x * 0.54, 0.57, z * 0.54], 0.03);
    }
    // the rail meets the legs where they have already splayed in to 0.155
    const rail: Vector3[] = [[-0.155, 0.2, -0.155], [0.155, 0.2, -0.155], [0.155, 0.2, 0.155], [-0.155, 0.2, 0.155]];
    for (let i = 0; i < 4; i++) k.rod(FINISH.bronze, rail[i]!, rail[(i + 1) % 4]!, 0.025);
    k.cylinder(FINISH.fabric, [0, 0.57, 0], 0.18, 0.08);
  });

  add("fit-bench", (k) => {
    k.cbox(FINISH.black, [0, 0, -0.05], [1.6, 0.37, 0.3]);
    k.cbox(FINISH.timber, [0, 0.37, 0], [1.8, 0.08, 0.4]);
    lens(k, [0, 0.35, 0.14], 1.6);
  });

  add("fit-low-table", (k) => {
    for (const x of [-0.41, 0.41]) for (const z of [-0.21, 0.21]) k.rod(FINISH.bronze, [x, 0, z], [x, 0.36, z], 0.04);
    const rail: Vector3[] = [[-0.41, 0.1, -0.21], [0.41, 0.1, -0.21], [0.41, 0.1, 0.21], [-0.41, 0.1, 0.21]];
    for (let i = 0; i < 4; i++) k.rod(FINISH.bronze, rail[i]!, rail[(i + 1) % 4]!, 0.03);
    k.cbox(FINISH.obsidian, [0, 0.36, 0], [0.9, 0.04, 0.5]);
  });

  add("fit-table", (k) => {
    // legs stay at the corners: the same module is scaled to a 2.8 x 1.2 meeting table
    for (const x of [-0.365, 0.365]) for (const z of [-0.365, 0.365]) k.cbox(FINISH.bronze, [x, 0, z], [0.05, 0.63, 0.05]);
    k.cbox(FINISH.bronze, [0, 0.63, 0], [0.82, 0.08, 0.82]);
    k.cbox(FINISH.obsidian, [0, 0.71, 0], [0.9, 0.04, 0.9]);
  });

  add("fit-reception-desk", (k) => {
    for (const x of [-1.27, 1.27]) k.cbox(FINISH.obsidian, [x, 0, 0], [0.06, 1.06, 0.9]);
    k.cbox(FINISH.obsidian, [0, 0.04, 0.42], [2.48, 1.02, 0.06]);
    k.cbox(FINISH.timber, [0, 0.75, -0.03], [2.48, 0.04, 0.84]);
    k.cbox(FINISH.timber, [0, 1.06, 0.31], [2.6, 0.04, 0.28]);
    k.cbox(FINISH.bronze, [0, 1.06, 0.44], [2.6, 0.04, 0.02]);
    lens(k, [0, 0.02, 0.43], 2.3);
  });

  add("fit-bar-counter", (k) => {
    k.cbox(FINISH.bronze, [0, 0, -0.09], [2.84, 0.08, 0.47]);
    // the top overhangs the front 0.1, so the front panel stands back from the counter edge
    k.cbox(FINISH.dark, [0, 0.12, 0.2], [3.0, 0.92, 0.05]);
    k.cbox(FINISH.timber, [0, 0.85, -0.2125], [2.8, 0.04, 0.225]);
    k.cbox(FINISH.obsidian, [0, 1.04, 0], [3.0, 0.06, 0.65]);
    k.rod(FINISH.bronze, [-1.45, 0.22, 0.3], [1.45, 0.22, 0.3], 0.04);
    lens(k, [0, 0.09, 0.295], 2.7);
  });

  add("fit-kitchen-run", (k) => {
    k.cbox(FINISH.black, [0, 0, -0.0450], [2.4, 0.1, 0.56]);
    k.cbox(FINISH.dark, [0, 0.1, -0.015], [2.4, 0.81, 0.62]);
    slats(k, FINISH.black, 3, [0, 0.1, 0.28], [2.4, 0.81, 0.03], 0.788);
    for (const x of [-0.8, 0, 0.8]) k.rod(FINISH.bronze, [x - 0.3, 0.82, 0.31], [x + 0.3, 0.82, 0.31], 0.03);
    k.cbox(FINISH.obsidian, [0, 0.91, 0], [2.4, 0.04, 0.65]);
    k.cbox(FINISH.obsidian, [0, 0.95, -0.315], [2.4, 0.1, 0.02]);
    k.cbox(FINISH.black, [-0.55, 0.95, 0], [0.6, 0.01, 0.45]);
    for (const x of [-0.7, -0.4]) for (const z of [-0.1, 0.1]) k.cylinder(FINISH.bronze, [x, 0.96, z], 0.065, 0.008, 6);
    k.cbox(FINISH.chrome, [0.6, 0.93, 0], [0.5, 0.02, 0.4]);
  });

  add("fit-bed", (k) => {
    // the platform carries the footprint and overhangs a smaller dark plinth, so the base lens
    // sits in the shadow gap under its front edge
    k.cbox(FINISH.black, [0, 0, -0.04], [1.44, 0.06, 2.02]);
    k.cbox(FINISH.timber, [0, 0.06, 0], [1.6, 0.2, 2.1]);
    k.cbox(FINISH.linen, [0, 0.26, 0], [1.5, 0.25, 2.0]);
    k.cbox(FINISH.linen, [0, 0.51, 0.55], [1.5, 0.06, 0.7]);
    for (const x of [-0.33, 0.33]) k.cbox(FINISH.linen, [x, 0.51, -0.54], [0.6, 0.09, 0.36]);
    // the headboard is a planted tank floating over the bed head, lit from under its lid
    k.cbox(FINISH.obsidian, [0, 0.55, -0.89], [1.6, 0.1, 0.32]);
    k.cbox(FINISH.soil, [0, 0.65, -0.89], [1.56, 0.05, 0.3]);
    k.cbox(FINISH.glass, [0, 0.65, -0.739], [1.6, 0.74, 0.012]);
    for (const x of [-0.4, 0, 0.4]) tuft(k, [x, 0.7, -0.89], 0.65, 0.26, x + 3);
    k.cbox(FINISH.timber, [0, 1.39, -0.9025], [1.6, 0.06, 0.295]);
    lens(k, [0, 1.42, -0.74], 1.4);
    lens(k, [0, 0.05, 0.95], 1.2);
  });

  add("fit-wardrobe", (k) => {
    k.cbox(FINISH.timber, [0, 0, -0.3075], [1.6, 2.0, 0.035]);
    for (const x of [-0.7825, 0.7825]) k.cbox(FINISH.timber, [x, 0, 0], [0.035, 2.0, 0.65]);
    k.cbox(FINISH.timber, [0.2725, 0.08, 0.005], [0.035, 1.89, 0.59]);
    k.cbox(FINISH.timber, [0, 1.97, 0], [1.6, 0.03, 0.65]);
    k.cbox(FINISH.black, [0, 0, 0], [1.53, 0.08, 0.6]);
    slats(k, FINISH.timber, 2, [-0.2665, 0.08, 0.2875], [1.067, 1.89, 0.035], 0.5245);
    for (const x of [-0.3, -0.23]) k.rod(FINISH.bronze, [x, 0.9, 0.315], [x, 1.5, 0.315], 0.02);
    for (const y of [0.5, 0.95, 1.4]) k.cbox(FINISH.timber, [0.5275, y, 0.005], [0.475, 0.03, 0.59]);
    k.rod(FINISH.bronze, [0.29, 1.85, 0], [0.765, 1.85, 0], 0.025);
    lens(k, [0.53, 1.94, 0], 0.45, "z");
    lens(k, [0, 1.96, 0.275], 1.4);
  });

  add("fit-shower", (k) => {
    k.cbox(FINISH.marble, [0, 0, 0], [0.9, 0.06, 0.9]);
    k.cbox(FINISH.chrome, [0, 0.055, 0], [0.7, 0.008, 0.04]);
    k.cbox(FINISH.glass, [0.445, 0.06, 0], [0.01, 1.94, 0.9]);
    // the +z panel stops short of the +x end: that gap is the way in
    k.cbox(FINISH.glass, [-0.225, 0.06, 0.445], [0.45, 1.94, 0.01]);
    for (const [x, z] of [[0.4375, 0.4375], [0, 0.4375], [0.4375, -0.4375]] as const) {
      k.rod(FINISH.bronze, [x, 0.06, z], [x, 2.0, z], 0.025);
    }
    k.rod(FINISH.bronze, [0.4375, 1.9875, -0.45], [0.4375, 1.9875, 0.45], 0.025);
    k.rod(FINISH.bronze, [-0.45, 1.9875, 0.4375], [0, 1.9875, 0.4375], 0.025);
    k.cbox(FINISH.chrome, [0, 0.9, -0.415], [0.12, 1.1, 0.07]);
    k.cbox(FINISH.chrome, [0, 1.93, -0.32], [0.24, 0.04, 0.26]);
    k.rod(FINISH.bronze, [-0.35, 1.95, -0.2], [0.35, 1.95, -0.2], 0.03);
    for (const x of [-0.15, 0.15]) k.cylinder(FINISH.lensWarm, [x, 1.923, -0.2], 0.04, 0.012, 6);
  });

  add("fit-basin", (k) => {
    k.cbox(FINISH.obsidian, [0, 0.73, 0], [0.5, 0.12, 0.45]);
    k.cylinder(FINISH.chrome, [0, 0.75, 0.02], 0.16, 0.1);
    k.cylinder(FINISH.black, [0, 0.77, 0.02], 0.135, 0.079);
    k.rod(FINISH.chrome, [0, 0.85, -0.16], [0, 0.98, -0.16], 0.03);
    k.rod(FINISH.chrome, [0, 0.965, -0.16], [0, 0.965, -0.05], 0.022);
    k.cbox(FINISH.chrome, [0, 1.0, -0.215], [0.5, 0.7, 0.02]);
    lens(k, [0, 0.98, -0.165], 0.4);
  });

  add("fit-planter", (k) => {
    k.cbox(FINISH.obsidian, [0, 0, 0], [0.5, 0.08, 0.5]);
    k.cbox(FINISH.bronze, [0, 0.08, 0], [0.5, 0.03, 0.5]);
    k.cbox(FINISH.obsidian, [0, 0.11, 0], [0.5, 0.39, 0.5]);
    k.cbox(FINISH.soil, [0, 0.42, 0], [0.46, 0.05, 0.46]);
    tuft(k, [0, 0.47, 0], 0.63, 0.22, 7);
    for (const x of [-0.235, 0.235]) for (const z of [-0.235, 0.235]) k.cbox(FINISH.bronze, [x, 0.5, z], [0.03, 0.8, 0.03]);
    const frame: Vector3[] = [[-0.235, 1.285, -0.235], [0.235, 1.285, -0.235], [0.235, 1.285, 0.235], [-0.235, 1.285, 0.235]];
    for (let i = 0; i < 4; i++) k.rod(FINISH.bronze, frame[i]!, frame[(i + 1) % 4]!, 0.03);
    lens(k, [0, 1.28, 0], 0.4);
  });

  add("fit-planted-screen", (k) => {
    k.cbox(FINISH.obsidian, [0, 0, 0], [2.5, 0.45, 0.5]);
    k.cbox(FINISH.soil, [0, 0.36, 0], [2.4, 0.06, 0.4]);
    slats(k, FINISH.timber, 17, [0, 0.45, 0], [2.38, 1.55, 0.04], 0.04);
    for (const x of [-0.8, 0, 0.8]) tuft(k, [x, 0.42, 0], 0.78, 0.35, x + 2);
    k.rod(FINISH.bronze, [-1.25, 1.985, 0], [1.25, 1.985, 0], 0.03);
    lens(k, [0, 0.46, 0], 2.2);
  });

  add("fit-aquarium-wall", (k) => {
    k.cbox(FINISH.timber, [0, 0, 0], [3.0, 0.5, 0.5]);
    k.cbox(FINISH.slate, [0, 0.5, -0.235], [3.0, 1.5, 0.03]);
    k.cbox(FINISH.soil, [0, 0.5, -0.025], [2.7, 0.08, 0.39]);
    for (const x of [-0.9, 0, 0.9]) tuft(k, [x, 0.56, -0.02], 0.7, 0.35, x + 5);
    for (const [x, y, z, a] of [[-0.6, 1.5, 0.0, 0.3], [0.4, 1.15, -0.05, 2.6], [1.0, 1.62, 0.02, 1.2]] as const) {
      k.leaf(FINISH.fish, [x, y, z], a, 0.12, 0.05, 0);
    }
    // the canopy caps the planted volume: the light record hangs on its underside
    k.cbox(FINISH.timber, [0, 1.497, -0.025], [2.76, 0.063, 0.39]);
    lens(k, [0, 1.488, 0], 2.4);
    k.cbox(FINISH.glass, [0, 0.5, 0.184], [2.76, 1.35, 0.012]);
    for (const x of [-1.44, 1.44]) k.cbox(FINISH.timber, [x, 0.5, 0.22], [0.12, 1.35, 0.06]);
    k.cbox(FINISH.timber, [0, 1.85, 0.22], [3.0, 0.15, 0.06]);
  });

  add("wall-screen", (k) => {
    for (const y of [0, 0.67]) k.cbox(FINISH.bronze, [0, y, -0.01], [1.2, 0.03, 0.06]);
    for (const x of [-0.585, 0.585]) k.cbox(FINISH.bronze, [x, 0.03, -0.01], [0.03, 0.64, 0.06]);
    k.cbox(FINISH.screen, [0, 0.03, 0.03], [1.14, 0.64, 0.02]);
  });

  add("wall-art", (k) => {
    for (const y of [0, 1.015]) k.cbox(FINISH.bronze, [0, y, -0.01], [0.7, 0.035, 0.04]);
    for (const x of [-0.3325, 0.3325]) k.cbox(FINISH.bronze, [x, 0.035, -0.01], [0.035, 0.98, 0.04]);
    k.cbox(FINISH.art, [0, 0.035, 0.02], [0.63, 0.98, 0.02]);
    lens(k, [0, 1.008, 0.005], 0.6, "x", FINISH.lensWarm, 0.012);
  });

  add("fit-shelf", (k) => {
    for (const x of [-0.885, 0.885]) k.cbox(FINISH.timber, [x, 0, 0], [0.03, 2.0, 0.5]);
    k.cbox(FINISH.timber, [0, 0, -0.235], [1.8, 2.0, 0.03]);
    for (const y of [0.42, 0.9, 1.38, 1.89]) k.cbox(FINISH.timber, [0, y, 0.01], [1.74, 0.04, 0.48]);
    for (const y of [0.46, 0.94, 1.42]) bottles(k, 4, [0, y, 0], 1.5);
    lens(k, [0, 1.88, 0.15], 1.6);
  });

  add("wall-shelf", (k) => {
    k.cbox(FINISH.timber, [0, 0.06, 0], [1.2, 0.04, 0.28]);
    for (const x of [-0.4, 0.4]) k.cbox(FINISH.bronze, [x, 0, -0.06], [0.04, 0.06, 0.16]);
    bottles(k, 3, [0, 0.1, -0.02], 0.9, 0.04, 0.23);
    lens(k, [0, 0.04, 0.06], 1.0);
  });

  add("fit-capsule-pod", (k) => {
    k.cbox(FINISH.capsuleWall, [0, 0, -0.71], [2.5, 2.0, 0.08]);
    for (const x of [-1.21, 1.21]) k.cbox(FINISH.capsuleWall, [x, 0, 0], [0.08, 2.0, 1.5]);
    k.cbox(FINISH.capsuleWall, [0, 1.92, 0], [2.5, 0.08, 1.5]);
    k.cbox(FINISH.capsuleFloor, [0, 0.27, 0.04], [2.34, 0.08, 1.42]);
    k.cbox(FINISH.capsuleCeiling, [0, 1.868, 0.01], [2.34, 0.052, 1.36]);
    // the mouth is bevelled: a steel rim set 0.06 inside the shell face
    for (const x of [-1.14, 1.14]) k.cbox(FINISH.steel, [x, 0, 0.72], [0.06, 1.92, 0.06]);
    k.cbox(FINISH.steel, [0, 1.86, 0.72], [2.34, 0.06, 0.06]);
    for (const x of [-1.2475, 1.2475]) k.cbox(FINISH.hatch, [x, 0.5, 0], [0.005, 1.1, 0.8]);
    k.cbox(FINISH.linen, [0, 0.35, 0.035], [2.3, 0.2, 1.37]);
    // the screen tips back over the sleeper's head
    k.mesh.addQuad(FINISH.screen, [[-0.65, 1.45, -0.5], [-0.65, 1.62, -0.58], [-1.0, 1.62, -0.58], [-1.0, 1.45, -0.5]]);
    for (const x of [-1.195, 1.195]) for (const [y0, y1] of [[0.58, 1.02], [1.12, 1.62]] as const) {
      k.cbox(FINISH.ledCyan, [x, y0, 0.732], [0.04, y1 - y0, 0.04]);
    }
    lens(k, [0, 1.859, -0.59], 1.9);
  });

  add("fit-crate", (k) => {
    k.cbox(FINISH.cardboard, [0, 0, 0], [0.62, 0.53, 0.62]);
    k.cbox(FINISH.cardboard, [0, 0.53, 0], [0.6, 0.02, 0.6]);
  });
};
