import { FINISH as F } from '../../modules/finishes.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';

/** Peralez residence: broad stone pieces and very fine joints; the mineral
 * wall fields replace the former half-metre white picture frames and light bars. */
export const MERIDIAN_STONE = 'cyberpunk/meridian-lobby-stone/rich#honed';
export const MERIDIAN_MINERAL = 'cyberpunk/meridian-wall-mineral/rich#field';
export const MERIDIAN_IVORY = 'cyberpunk/ivory-panel/rich#meridian-satin';
export const PRIVATE_WALNUT = 'cyberpunk/corpo-plaza-veneer/rich#walnut';
export const PRIVATE_STONE = 'cyberpunk/corpo-plaza-stone/rich#polished';
const CELL = .5;
const JOINT = .003;

export const luxurySurfaceRecipes: RecipeSet = add => {
  // Complete finished slab for landings, thresholds and other direct surface users.
  add('floor-slab-meridian-stone', k => {
    k.cbox(F.concrete, [0, -.15, 0], [CELL, .13, CELL]);
    k.cbox(MERIDIAN_STONE, [0, -.02, 0], [CELL, .02, CELL]);
  });
  add('floor-slab-luxury-polished', k => {
    k.cbox(F.concrete, [0, -.15, 0], [CELL, .13, CELL]);
    k.cbox(PRIVATE_STONE, [0, -.02, 0], [CELL, .02, CELL]);
  });
  add('floor-finish-luxury-polished', k => k.cbox(PRIVATE_STONE, [0, -.018, 0], [CELL, .018, CELL]));
  // The support remains uninterrupted under every physical slab joint. Its top is
  // only 2 mm below the walking plane: a shallow filled joint, never a floor hole.
  add('floor-slab-meridian-support', k => {
    k.cbox(F.concrete, [0, -.15, 0], [CELL, .148, CELL]);
  });
  add('floor-finish-meridian-stone', k => {
    k.cbox(MERIDIAN_STONE, [0, -.018, 0], [CELL, .018, CELL]);
  });
  // The backing owns 0–88 mm, the finish only 88–95 mm. Full-depth
  // finish boxes duplicate the backing's exposed jamb/header end caps and
  // fight in the depth buffer at grazing angles. Keep the external datum.
  add('wall-field-meridian-mineral', k => {
    k.cbox(MERIDIAN_MINERAL, [0, 0, .0915], [CELL, CELL, .007]);
  });
  add('wall-field-meridian-ivory', k => {
    k.cbox(MERIDIAN_IVORY, [0, 0, .0915], [CELL, CELL, .007]);
  });
  add('wall-field-meridian-walnut', k => k.cbox(PRIVATE_WALNUT, [0, 0, .0915], [CELL, CELL, .007]));
  add('wall-field-meridian-backing', k => {
    k.cbox(F.black, [0, 0, .044], [CELL, CELL, .088]);
  });
  add('wall-meridian-glass-stile', k => k.cbox(F.black, [0, 0, .0475], [.025, CELL, .095]));
  add('wall-meridian-glass-rail', k => k.cbox(F.black, [0, 0, .0475], [CELL, .025, .095]));
  add('wall-meridian-skirting', k => {
    k.cbox(F.black, [0, 0, .090], [CELL, .09, .004]);
    k.cbox(F.bronze, [0, .09, .091], [CELL, .006, .006]);
  });
};

/** Slabs follow a shared building grid; cut pieces at room edges retain the same
 * 3 mm joints. Scaling a slab changes only its span, while UV repeat keeps the
 * stone's actual 2 m material size. No geometry rises above the true floor Y0. */
export function placeLuxuryStoneFloor(builder: PlacementBuilder, room: string, rect: UvRect, y: number, frame: Frame, face = 'floor-finish-meridian-stone'): void {
  const rotation = -frame.angleDeg * Math.PI / 180;
  const put = (module: string, part: UvRect) => {
    const [x, z] = uvToWorld([part.u + part.lu / 2, part.v + part.lv / 2], frame);
    builder.module(module, room, [x, y, z], [part.lu / CELL, 1, part.lv / CELL], rotation);
  };
  put('floor-slab-meridian-support', rect);
  const sizeU = 2, sizeV = 1.5;
  for (let j = Math.floor(rect.v / sizeV); j * sizeV < rect.v + rect.lv - 1e-7; j++) {
    for (let i = Math.floor(rect.u / sizeU); i * sizeU < rect.u + rect.lu - 1e-7; i++) {
      const u = Math.max(rect.u, i * sizeU + JOINT / 2);
      const v = Math.max(rect.v, j * sizeV + JOINT / 2);
      const endU = Math.min(rect.u + rect.lu, (i + 1) * sizeU - JOINT / 2);
      const endV = Math.min(rect.v + rect.lv, (j + 1) * sizeV - JOINT / 2);
      if (endU - u > 1e-6 && endV - v > 1e-6)
        put(face, { u, v, lu: endU - u, lv: endV - v });
    }
  }
}
