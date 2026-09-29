import { FINISH as F } from '../../modules/finishes.js';
import { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { sanitaryRecipes } from '../../modules/recipes/sanitary.js';
import { softBox, tube } from '../luxury/model-geometry.js';
import { DAMAGED_MODEL_MATERIALS as M } from './quality-recipes.js';

/** A 900mm walk-in shower, not a900mm sealed collision box. Rear and sides have
 * their own bounded placements; the exposed front stays open down to the tray. */
const PARTS: Record<string, (k: Kit) => void> = {
  tray(k) {
    softBox(k, F.ceramic, [0, 0, 0], [.9, .035, .9], { radius: .014 });
    for (const x of [-.432, .432]) softBox(k, F.ceramic, [x, .035, -.003], [.036, .028, .878], { radius: .008 });
    softBox(k, F.ceramic, [0, .035, -.432], [.83, .028, .036], { radius: .008 });
    // Flush threshold; the worn safety grille is geometry set just above the tray.
    softBox(k, M.stainless, [0, .035, .365], [.65, .0015, .06], { radius: .001 });
    for (let i = 0; i < 14; i++) k.cbox(F.black, [-.299 + i * .046, .0366, .365], [.025, .0005, .035]);
  },
  rear(k) {
    softBox(k, M.gunmetal, [0, .035, -.432], [.9, 1.965, .035], { radius: .012 });
    k.cbox('cyberpunk/subway-tile/mid#running-bond', [0, .075, -.409], [.82, 1.87, .008]);
  },
  left(k) { side(k, -.432); },
  right(k) { side(k, .432); },
  header(k) {
    // Rolled upper rail with retained curtain rings; the entrance remains open.
    tube(k, M.stainless, [[-.415, 1.968, .385], [.415, 1.968, .385]], .012, false, 12);
    for (const x of [-.37, -.338, -.306]) {
      tube(k, M.stainless, [[x, 1.938, .385], [x, 1.973, .367], [x, 1.989, .385], [x, 1.973, .403], [x, 1.938, .385]], .002, false, 8);
    }
  },
  riser(k) {
    tube(k, M.stainless, [[.15, .91, -.38], [.15, 1.87, -.38], [.15, 1.93, -.355]], .012, false, 12);
  },
  head(k) {
    tube(k, M.stainless, [[.15, 1.93, -.355], [.15, 1.94, -.20]], .012, false, 12);
    softBox(k, M.stainless, [.15, 1.905, -.20], [.135, .035, .095], { radius: .023 });
    k.cbox(F.black, [.15, 1.905, -.20], [.11, .002, .07]);
  },
  controls(k) {
    softBox(k, M.stainless, [.15, .98, -.386], [.19, .055, .035], { radius: .015 });
    for (const x of [.1, .2]) softBox(k, F.black, [x, .991, -.36], [.029, .033, .015], { radius: .007 });
  },
  soap(k) {
    // Its own shallow collider cannot turn the head/riser into a sealed full-height box.
    softBox(k, M.enamel, [-.19, 1.10, -.37], [.15, .024, .08], { radius: .009 });
  },
};
function side(k: Kit, x: number): void {
  softBox(k, M.gunmetal, [x, .035, 0], [.035, 1.965, .9], { radius: .012 });
  const inner = x + (x < 0 ? .023 : -.023);
  k.cbox('cyberpunk/subway-tile/mid#running-bond', [inner, .075, 0], [.008, 1.87, .82]);
}

export const DAMAGED_SHOWER_PARTS = Object.keys(PARTS).map(part => `fit-shower-damaged-${part}`);
export const damagedBathroomRecipes: RecipeSet = add => {
  add('fit-basin-damaged', k => {
    sanitaryRecipes((id, draw) => {
      if (id !== 'fit-basin-worn') return;
      const source = new Kit(() => [1, 1]); draw(source);
      for (const slot of source.mesh.materials()) k.mesh.addSurface(slot === F.damagedSteel ? M.gunmetal
        : slot === F.chrome ? M.stainless : slot, source.mesh.getGroup(slot)!);
    });
  });
  add('fit-shower-damaged', k => { for (const draw of Object.values(PARTS)) draw(k); });
  for (const [part, draw] of Object.entries(PARTS)) add(`fit-shower-damaged-${part}`, draw);
};
