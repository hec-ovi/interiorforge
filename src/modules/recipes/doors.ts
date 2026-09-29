import { FINISH } from '../finishes.js';
import type { Kit } from '../kit.js';
import type { RecipeSet } from '../recipes.js';

/** All detail stays inside the existing casing volume. In particular there is no
 * threshold, stop or decorative leaf across the published clear passage. Moving
 * entrance leaves belong to Exterior's named nodes, not these static modules. */
export const doorRecipes: RecipeSet = (add) => {
  // Keep this exact ID and envelope: the consumer splits it into three colliders.
  add('door-frame', (k) => {
    member(k, 'neutral', [-.58, 0, -.07], [.08, 2.5, .14], false);
    member(k, 'neutral', [.5, 0, -.07], [.08, 2.5, .14], false);
    member(k, 'neutral', [-.58, 2.5, -.07], [1.16, .08, .14], true);
  });
  for (const style of ['neutral', 'luxury', 'capsule', 'damaged', 'industrial'] as const) {
    const suffix = style === 'neutral' ? '' : `-${style}`;
    add(`door-jamb${suffix}`, (k) => member(k, style, [-.04, 0, -.1], [.08, .5, .2], false));
    add(`door-header${suffix}`, (k) => member(k, style, [-.25, 0, -.1], [.5, .08, .2], true));
  }
};

type Style = 'neutral' | 'luxury' | 'capsule' | 'damaged' | 'industrial';

/** A continuous dark reveal behind separately fitted face strips, a narrow
 * recessed joint, and an inlaid bright edge. The caps meet the backing without
 * coplanar faces and finish both sides of a partition. The worn frame has repair
 * tabs instead of a polished edge, like the utility doors in the source captures. */
function member(k: Kit, style: Style, at: [number, number, number], size: [number, number, number], horizontal: boolean): void {
  const [x, y, z] = at, [w, h, d] = size;
  const damagedDoorSteel = 'cyberpunk/interior-service-gunmetal/poor#aged';
  const body = style === 'damaged' ? damagedDoorSteel : style === 'neutral' ? FINISH.casing : FINISH.black;
  const face = style === 'luxury' ? FINISH.ivory : style === 'capsule' ? FINISH.capsuleWall
    : style === 'damaged' ? damagedDoorSteel : FINISH.steel;
  const edge = style === 'luxury' ? FINISH.bronze : style === 'damaged' ? FINISH.patch : FINISH.zinc;
  k.box(body, [x, y, z + .01], [w, h, d - .02]);
  for (const side of [0, 1]) {
    const front = z + side * (d - .01);
    // Full width dark backing is the bottom of the two fine recessed face joints.
    k.box(body, [x, y, front + (side ? 0 : .004)], [w, h, .006]);
    const strip = (offset: number, thickness: number, material: string, inset = 0, length?: number): void => {
      const faceZ = front + (side ? .006 : 0);
      const a: [number, number, number] = horizontal ? [x + inset, y + offset, faceZ] : [x + offset, y + inset, faceZ];
      const b: [number, number, number] = horizontal ? [length ?? w, thickness, .004] : [thickness, length ?? h, .004];
      k.box(material, a, b);
    };
    strip(0, .016, face);
    if (style === 'damaged' || style === 'industrial') {
      const run = horizontal ? w : h;
      const tab = Math.min(.016, run * .04);
      let cursor = 0;
      // Inlaid repair tabs replace the face locally without coincident surfaces.
      for (const t of [.16, .72]) {
        strip(.02, .04, face, cursor, run * t - cursor);
        strip(.02, .04, edge, run * t, tab);
        cursor = run * t + tab;
      }
      strip(.02, .04, face, cursor, run - cursor);
      strip(.064, .016, face);
    } else {
      strip(.02, .04, face);
      strip(.064, .007, face);
      strip(.071, .005, edge);
      strip(.076, .004, face);
    }
  }
}
