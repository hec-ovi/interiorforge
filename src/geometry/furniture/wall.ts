import type { Placer } from "./placer.js";

/** Wall display: a dark stepped-radius housing, inset screen and concealed wall mount. */
export function displayScreen(p: Placer): void {
  monitor(p);
}

/** Electronic artwork uses the same fitted monitor family as information displays. */
export function wallArt(p: Placer): void {
  monitor(p);
}

/** Tiles a convex stepped silhouette from disjoint closed boxes. Three corner steps make the
 *  small housing read rounded at character distance without stretching the screen texture. */
function monitor(p: Placer): void {
  const radius = Math.min(0.09, p.hw * 0.22, p.height * 0.16);
  const z0 = -p.hd;
  const z1 = p.hd - Math.min(0.025, p.hd * 0.25);

  // Concealed mounting block stays behind the housing and inside the planned depth.
  p.box("metal", -Math.min(0.14, p.hw * 0.35), Math.min(0.14, p.hw * 0.35), z0, z0 + Math.min(0.025, p.hd), p.height * 0.3, p.height * 0.7);

  p.box("metal", -p.hw + radius, p.hw - radius, z0, z1, 0, p.height);
  p.box("metal", -p.hw, -p.hw + radius, z0, z1, radius, p.height - radius);
  p.box("metal", p.hw - radius, p.hw, z0, z1, radius, p.height - radius);
  for (let step = 0; step < 2; step++) {
    const y0 = radius * (step + 1) / 3;
    const y1 = radius * (step + 2) / 3;
    const reach = radius * (step + 1) / 3;
    p.box("metal", -p.hw + radius - reach, -p.hw + radius, z0, z1, y0, y1);
    p.box("metal", p.hw - radius, p.hw - radius + reach, z0, z1, y0, y1);
    p.box("metal", -p.hw + radius - reach, -p.hw + radius, z0, z1, p.height - y1, p.height - y0);
    p.box("metal", p.hw - radius, p.hw - radius + reach, z0, z1, p.height - y1, p.height - y0);
  }

  // Uniform inset preserves the planned display aspect ratio exactly.
  const scale = 0.86;
  const screenX = p.hw * scale;
  const screenY = p.height * (1 - scale) / 2;
  const face0 = z1;
  const face1 = p.hd;
  p.box("screen", -screenX, screenX, face0, face1, screenY, p.height - screenY);
}
