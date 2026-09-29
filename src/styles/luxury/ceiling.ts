import type { Kit } from '../../modules/kit.js';
import { FINISH } from '../../modules/finishes.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { uvToWorld, type Frame, type UvRect } from '../../layout/uv.js';

/** Ceiling skins use continuous PBR maps; the assembly, not the map, defines joints. */
const MINERAL = 'cyberpunk/ivory-panel/rich#meridian-satin';
const METAL = 'cyberpunk/meridian-ceiling-metal/rich#field';
const CELL = .5;
const JOINT = .012;
const BAND = .38;

/** Authored about the ceiling datum. Fields sit 46 mm above the service soffit.
 * The backing closes every reveal; all parts have outward-facing closed surfaces. */
export const luxuryCeilingRecipes: RecipeSet = add => {
  add('ceiling-luxury-backing', k => k.cbox(FINISH.charcoal, [0, .092, 0], [CELL, .008, CELL]));
  add('ceiling-luxury-panel', k => {
    // A shallow folded edge catches grazing light without creating a decorative grid.
    bevelPanel(k, MINERAL, .25, .022, .086, .00025);
  });
  add('ceiling-luxury-band', k => bevelPanel(k, METAL, .25, -.024, .086, .00025));
  add('ceiling-luxury-reveal-rail', k => k.cbox(FINISH.bronze, [0, -.013, 0], [CELL, .014, .008]));
  add('ceiling-luxury-vent', k => {
    // 850 x 172 mm linear return: deep black throat, separate bezel and airfoil blades.
    k.cbox(FINISH.black, [0, -.033, 0], [.85, .008, .172]);
    for (const z of [-.084, .084]) k.cbox(METAL, [0, -.040, z], [.85, .010, .008]);
    for (const x of [-.421, .421]) k.cbox(METAL, [x, -.040, 0], [.008, .010, .16]);
    for (const z of [-.060, -.036, -.012, .012, .036, .060]) {
      k.cbox(METAL, [0, -.039, z], [.825, .006, .009]);
    }
    for (const x of [-.34, .34]) k.cbox(FINISH.black, [x, -.038, 0], [.012, .008, .146]);
  });
  add('ceiling-luxury-access', k => {
    k.cbox(FINISH.black, [0, -.031, 0], [.3, .008, .25]);
    k.cbox(METAL, [0, -.035, 0], [.29, .012, .24]);
    for (const x of [-.123, .123]) for (const z of [-.098, .098]) {
      k.cylinder(FINISH.black, [x, -.037, z], .004, .002, 12);
    }
  });
};

function bevelPanel(k: Kit, slot: string, half: number, low: number, high: number, bevel: number): void {
  const inner = half - bevel;
  k.cbox(slot, [0, low + bevel, 0], [2 * half, high - low - bevel, 2 * half], undefined,
    ['top', 'north', 'south', 'east', 'west']);
  k.cbox(slot, [0, low, 0], [2 * inner, bevel, 2 * inner], undefined, ['bottom']);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!, b = corners[(i + 1) % 4]!;
    k.mesh.addQuad(slot, [[a[0] * half, low + bevel, a[1] * half],
      [b[0] * half, low + bevel, b[1] * half], [b[0] * inner, low, b[1] * inner],
      [a[0] * inner, low, a[1] * inner]]);
  }
}

/** Large removable ceiling fields, not visible 50 cm tiles. A physical 12 mm joint
 * remains 12 mm for every fitted room size. Only the continuous skins stretch. */
export function placeLuxuryCeiling(builder: PlacementBuilder, room: string, rect: UvRect, y: number, frame: Frame): void {
  const rotation = -frame.angleDeg * Math.PI / 180;
  const place = (module: string, r: UvRect) => {
    const [x, z] = uvToWorld([r.u + r.lu / 2, r.v + r.lv / 2], frame);
    builder.module(module, room, [x, y, z], [r.lu / CELL, 1, r.lv / CELL], rotation);
  };
  const fit = (module: string, r: UvRect, maxU: number, maxV: number) => {
    const cols = Math.max(1, Math.ceil(r.lu / maxU)), rows = Math.max(1, Math.ceil(r.lv / maxV));
    const w = r.lu / cols, d = r.lv / rows;
    const gapU = Math.min(JOINT, w / 5), gapV = Math.min(JOINT, d / 5);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      place(module, { u: r.u + i * w + gapU / 2, v: r.v + j * d + gapV / 2, lu: w - gapU, lv: d - gapV });
    }
  };
  place('ceiling-luxury-backing', rect);
  const banded = Math.min(rect.lu, rect.lv) >= 2.4;
  if (!banded) {
    fit('ceiling-luxury-panel', rect, 3, 2.4);
    return;
  }
  const field = { u: rect.u + BAND, v: rect.v + BAND, lu: rect.lu - 2 * BAND, lv: rect.lv - 2 * BAND };
  fit('ceiling-luxury-panel', field, 3, 2.4);
  for (const v of [rect.v, rect.v + rect.lv - BAND]) {
    fit('ceiling-luxury-band', { u: rect.u, v, lu: rect.lu, lv: BAND }, 3, BAND);
  }
  for (const u of [rect.u, rect.u + rect.lu - BAND]) {
    fit('ceiling-luxury-band', { u, v: field.v, lu: BAND, lv: field.lv }, BAND, 3);
  }
  // Narrow metal inlays run along the two long service bands, with unscaled cross-section.
  const alongU = rect.lu >= rect.lv;
  const run = alongU ? field.lu : field.lv;
  const angle = rotation + (alongU ? 0 : -Math.PI / 2);
  for (const side of [-1, 1]) {
    const u = rect.u + rect.lu / 2, v = rect.v + rect.lv / 2;
    const edgeOffset = (alongU ? rect.lv : rect.lu) / 2 - BAND + .035;
    const [x, z] = uvToWorld([u + (alongU ? 0 : side * edgeOffset), v + (alongU ? side * edgeOffset : 0)], frame);
    builder.module('ceiling-luxury-reveal-rail', room, [x, y, z], [run / CELL, 1, 1], angle);
    if (run < 2.5) continue;
    const count = Math.max(1, Math.floor(run / 5.5));
    for (let i = 0; i < count; i++) {
      const offset = run * ((i + .5) / count - .5);
      const bandOffset = (alongU ? rect.lv : rect.lu) / 2 - BAND / 2;
      const [vx, vz] = uvToWorld([u + (alongU ? offset : side * bandOffset), v + (alongU ? side * bandOffset : offset)], frame);
      builder.module('ceiling-luxury-vent', room, [vx, y, vz], [1, 1, 1], angle);
    }
  }
  if (run > 4) {
    const [x, z] = uvToWorld([rect.u + BAND / 2, rect.v + BAND + .35], frame);
    builder.module('ceiling-luxury-access', room, [x, y, z], [1, 1, 1], rotation);
  }
}
