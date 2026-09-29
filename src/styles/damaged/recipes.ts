import { damagedQualityRecipes, DAMAGED_QUALITY_IDS, DAMAGED_MODEL_MATERIALS } from './quality-recipes.js';
import { damagedBathroomRecipes } from './bathroom.js';
import { damagedApartmentDoorRecipes } from './apartment-doors.js';
import { damagedServiceRecipes, DAMAGED_SERVICE_IDS } from './services.js';
import { FINISH } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';

const steel = DAMAGED_MODEL_MATERIALS.gunmetal;
const enamel = 'cyberpunk/interior-service-enamel/poor#petrol';
const vinyl = DAMAGED_MODEL_MATERIALS.vinyl;
const wetTile = 'cyberpunk/subway-tile/mid#running-bond';

function legs(k: Kit, w: number, d: number, h: number): void {
  for (const x of [-w / 2 + .045, w / 2 - .045]) for (const z of [-d / 2 + .045, d / 2 - .045])
    k.cbox(steel, [x, 0, z], [.04, h, .04]);
}
function handle(k: Kit, x: number, y: number, z: number, w = .12): void {
  for (const dx of [-w / 2, w / 2]) k.cbox(steel, [x + dx, y, z - .008], [.012, .014, .03]);
  k.cbox(FINISH.chrome, [x, y, z + .005], [w + .012, .014, .012]);
}
function papers(k: Kit, x: number, y: number, z: number): void {
  k.cbox(FINISH.paper, [x, y, z], [.18, .003, .24], 'unit');
  k.cbox(FINISH.paper, [x + .025, y + .004, z + .014], [.18, .003, .22], 'unit');
}
function cabinet(k: Kit, width: number, depth: number, height: number): void {
  k.cbox(steel, [0, .07, 0], [width - .04, height - .07, depth - .025]);
  k.cbox(FINISH.black, [0, 0, 0], [width - .12, .1, depth - .08]);
  const n = Math.max(2, Math.round(width / .6)), pitch = width / n;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + pitch * (i + .5);
    k.cbox(enamel, [x, .12, depth / 2 - .014], [pitch - .018, height - .18, .022]);
    handle(k, x + pitch * .22, height - .17, depth / 2 - .012);
  }
}

/** Based on the captures' exposed meter boxes, institutional furniture and repaired
 * domestic fittings. Everything stays inside its published furniture reservation. */
const legacyDamagedRecipes: RecipeSet = add => {
  for (const id of ['wall-field-damaged-public', 'wall-field-damaged-megablock'])
    add(id, k => k.cbox(FINISH.damagedWall, [0, 0, .0475], [.5, .5, .095]));
  // A separate dado has a floor datum; stretched door headers never restart its paint.
  for (const [id, face] of [['wall-field-damaged-dado', enamel], ['wall-field-damaged-dado-gunmetal', steel]]) add(id!, k => {
    k.cbox(face!, [0, 0, .002], [.5, .5, .004]);
    k.cbox(steel, [0, 0, .0045], [.5, .03, .001]);
    k.cbox(steel, [0, .494, .0045], [.5, .006, .001]);
  });
  add('wall-field-damaged-wet', k => k.cbox(wetTile, [0, 0, .0475], [.5, .5, .095]));
  add('floor-slab-damaged-wet', k => {
    k.cbox(FINISH.concrete, [0, -.15, 0], [.5, .15, .5], undefined, ['north', 'south', 'east', 'west', 'bottom']);
    k.cbox(FINISH.damagedFloor, [0, -.02, 0], [.5, .02, .5], undefined, ['top']);
  });
  add('fit-damaged-sofa', k => {
    legs(k, 1.7, .76, .16);
    k.cbox(steel, [0, .13, 0], [1.76, .16, .78]);
    for (const x of [-.415, .415]) {
      k.cbox(vinyl, [x, .29, 0], [.8, .2, .64]);
      k.cbox(vinyl, [x, .41, -.325], [.8, .39, .18]);
      k.cbox(steel, [x, .296, .407], [.72, .008, .007]);
    }
    for (const x of [-.856, .856]) {
      k.cbox(steel, [x, .29, 0], [.088, .23, .85]);
      k.cbox(vinyl, [x, .52, 0], [.088, .065, .8]);
    }
  });

  for (const [id, w, d, h] of [['fit-damaged-low-table', .9, .5, .4], ['fit-damaged-table', .9, .9, .75], ['fit-damaged-desk', 1.6, .8, .75]] as const) {
    add(id, k => {
      legs(k, w - .04, d - .04, h - .04);
      k.cbox(steel, [0, h - .09, 0], [w - .05, .065, d - .05]);
      k.cbox(enamel, [0, h - .025, 0], [w, .025, d]);
      if (id === 'fit-damaged-desk') {
        k.cbox(steel, [-.52, .1, -.03], [.36, .54, .6]);
        for (const y of [.16, .33, .5]) { k.cbox(enamel, [-.52, y, .277], [.335, .15, .016]); handle(k, -.52, y + .08, .294); }
      }
    });
  }
  add('fit-damaged-chair', k => {
    legs(k, .43, .43, .43);
    k.cbox(vinyl, [0, .43, 0], [.44, .06, .42]);
    for (const x of [-.195, .195]) k.cbox(steel, [x, .43, -.195], [.027, .47, .027]);
    k.cbox(enamel, [0, .62, -.185], [.43, .28, .045]);
  });
  add('fit-damaged-office-chair', k => {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, x = Math.cos(a) * .27, z = Math.sin(a) * .27;
      k.rod(steel, [0, .14, 0], [x, .07, z], .035);
      k.cbox(FINISH.black, [x, .01, z], [.065, .06, .065]);
    }
    k.cylinder(steel, [0, .13, 0], .035, .3);
    k.cbox(vinyl, [0, .43, 0], [.54, .06, .48]);
    k.cbox(steel, [0, .48, -.235], [.08, .65, .045]);
    k.cbox(vinyl, [0, .63, -.23], [.5, .52, .09]);
    for (const x of [-.3, .3]) {
      k.cbox(steel, [x, .44, -.01], [.03, .19, .04]);
      k.cbox(vinyl, [x, .63, -.01], [.05, .03, .35]);
    }
  });

  add('fit-damaged-kitchen', k => {
    cabinet(k, 2.4, .65, .88);
    // Worktop surrounds a real recessed bowl instead of placing a sink on a solid slab.
    for (const [x, width] of [[-.975, .45], [.48, 1.44]] as const)
      k.cbox(enamel, [x, .88, 0], [width, .035, .65]);
    for (const z of [-.28, .28]) k.cbox(enamel, [-.48, .88, z], [.54, .035, .09]);
    k.cbox(FINISH.chrome, [-.48, .745, 0], [.52, .02, .47]);
    for (const x of [-.745, -.215]) k.cbox(FINISH.chrome, [x, .765, 0], [.02, .115, .47]);
    for (const z of [-.235, .235]) k.cbox(FINISH.chrome, [-.48, .765, z], [.52, .115, .02]);
    k.rod(FINISH.chrome, [-.48, .915, -.275], [-.48, 1.035, -.275], .022);
    k.rod(FINISH.chrome, [-.48, 1.025, -.275], [-.48, 1.025, -.11], .022);
    k.cbox(FINISH.black, [.7, .915, 0], [.75, .018, .54]);
    for (const x of [.5, .9]) for (const z of [-.14, .14]) k.cylinder(steel, [x, .933, z], .095, .009, 12);
    for (const x of [.48, .62, .76, .9]) k.cylinder(FINISH.chrome, [x, .942, .225], .022, .016, 8);
    k.cbox(steel, [0, .915, -.316], [2.4, .135, .018]);
  });
  add('fit-damaged-fridge', k => {
    k.cbox(steel, [0, 0, 0], [.7, 1.8, .7]);
    k.cbox(enamel, [0, .08, .337], [.672, 1.14, .024]);
    k.cbox(enamel, [0, 1.235, .337], [.672, .54, .024]);
    for (const y of [1.08, 1.38]) handle(k, .21, y, .335, .13);
    for (let i = 0; i < 6; i++) k.cbox(FINISH.black, [-.25 + i * .1, .022, .35], [.07, .022, .001]);
  });
  add('fit-damaged-counter', k => {
    cabinet(k, 2, .7, .87);
    k.cbox(enamel, [0, .87, 0], [2, .03, .7]);
  });
  add('fit-damaged-caretaker-desk', k => {
    k.cbox(FINISH.black, [0, 0, .16], [2.48, .1, .52]);
    for (const x of [-1.15, 1.15]) k.cbox(steel, [x, .1, 0], [.18, .67, .82]);
    k.cbox(enamel, [0, .16, .39], [2.58, .8, .06]);
    for (const x of [-.87, 0, .87]) k.cbox(steel, [x, .22, .424], [.015, .69, .012]);
    k.cbox(enamel, [0, .75, -.045], [2.6, .035, .79]);
    k.cbox(steel, [0, .96, .34], [2.6, .065, .22]);
    k.cbox(FINISH.black, [-.65, .785, -.12], [.36, .035, .24]);
    k.cbox(steel, [-.65, .82, -.17], [.035, .07, .045]);
    k.cbox(FINISH.black, [-.65, .89, -.18], [.4, .21, .035]);
    k.cbox(FINISH.screen, [-.65, .905, -.2], [.36, .175, .003], 'unit');
    papers(k, .4, .785, -.13);
  });
  add('fit-damaged-shelf', k => shelving(k, 1.8, .5));
  add('fit-damaged-community-shelf', k => shelving(k, 2.5, .5));
  add('wall-shelf-damaged', k => {
    for (const y of [0, .365]) k.cbox(enamel, [0, y, 0], [1.2, .035, .28]);
    for (const x of [-.5, .5]) k.cbox(steel, [x, 0, -.123], [.035, .4, .035]);
    for (const x of [-.3, -.1, .1, .3]) k.cylinder(FINISH.ceramic, [x, .035, 0], .045, .14, 8);
  });
  add('wall-art-damaged-noticeboard', k => {
    k.cbox(steel, [0, 0, 0], [.7, 1.05, .06]);
    k.cbox(FINISH.cardboard, [0, .035, .031], [.63, .98, .001]);
    for (const [x, y, w, h] of [[-.16, .56, .22, .34], [.14, .47, .27, .27], [-.13, .12, .27, .29], [.16, .83, .23, .15]]) {
      k.cbox(FINISH.paper, [x!, y!, .032], [w!, h!, .001], 'unit');
      k.cbox(steel, [x!, y! + h! - .01, .033], [.015, .012, .002]);
    }
  });
  add('fit-damaged-storage-wall', k => {
    cabinet(k, 3, .5, .88);
    k.cbox(enamel, [0, .88, 0], [3, .035, .5]);
    k.cbox(steel, [0, .915, -.236], [3, 1.085, .028]);
    for (const x of [-1.48, -.5, .5, 1.48]) k.cbox(steel, [x, .915, 0], [.04, 1.085, .5]);
    for (const y of [1.4, 1.965]) k.cbox(enamel, [0, y, 0], [3, .035, .5]);
    for (const x of [-1.17, -.98, .77, .96, 1.15]) k.cylinder(FINISH.ceramic, [x, 1.435, 0], .065, .2, 8);
    k.cbox(FINISH.cardboard, [0, .915, 0], [.65, .31, .38], 'unit');
    k.cbox(enamel, [-1, .97, .223], [.92, .37, .025]);
    handle(k, -.7, 1.18, .234);
  });
  add('fit-damaged-mail-bank', k => {
    k.cbox(steel, [0, 0, -.01], [3, 2, .48]);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
      const x = -1.25 + col * .5, y = .025 + row * .39;
      k.cbox(enamel, [x, y, .236], [.474, .368, .025]);
      k.cbox(FINISH.black, [x, y + .245, .25], [.34, .022, .001]);
      k.cbox(FINISH.paper, [x - .08, y + .16, .251], [.13, .038, .001], 'unit');
      k.cbox(FINISH.chrome, [x + .15, y + .12, .249], [.025, .035, .001]);
    }
  });
  // Shallow wall-mounted services: never consume a landing or a doorway approach.
  add('ceiling-services-damaged-run', k => {
    // The shell is above y=0: these pipes are actually visible below its soffit.
    for (const z of [-.19, .17]) {
      horizontalPipe(k, steel, -.25, .25, -.15, z, .045);
    }
    k.cbox(steel, [0, -.1, 0], [.5, .028, .12]);
    for (const z of [-.065, .065]) k.cbox(enamel, [0, -.13, z], [.5, .055, .014]);
  });
  add('ceiling-services-damaged-hanger', k => {
    for (const z of [-.19, .17]) horizontalPipe(k, FINISH.chrome, -.025, .025, -.15, z, .058);
    for (const z of [-.21, .21]) k.cbox(steel, [0, -.23, z], [.018, .24, .018]);
    k.cbox(steel, [0, -.23, 0], [.04, .025, .46]);
  });
  add('wall-shelf-damaged-meter-bank', k => {
    for (const x of [-.38, 0, .38]) {
      k.cbox(steel, [x, .32, .07], [.34, .64, .14]);
      k.cbox(enamel, [x, .38, .148], [.29, .51, .016]);
      k.cbox(FINISH.black, [x, .7, .159], [.17, .12, .004]);
      k.cbox(FINISH.paper, [x, .55, .159], [.13, .035, .004], 'unit');
      for (const dx of [-.08, .08]) {
        k.rod(steel, [x + dx, 0, .065], [x + dx, .32, .065], .022);
        for (const y of [.08, .24]) k.cbox(FINISH.chrome, [x + dx, y, .067], [.035, .02, .028]);
      }
    }
  });
};

function shelving(k: Kit, w: number, d: number): void {
  for (const x of [-w / 2 + .025, w / 2 - .025]) for (const z of [-d / 2 + .025, d / 2 - .025])
    k.cbox(steel, [x, 0, z], [.05, 2, .05]);
  for (const y of [.06, .53, 1, 1.47, 1.94]) k.cbox(enamel, [0, y, 0], [w, .045, d]);
  for (const [x, y] of [[-.4, .105], [.33, .575], [-.22, 1.045]]) {
    k.cbox(FINISH.cardboard, [x!, y!, 0], [.36, .28, .38], 'unit');
    k.cbox(FINISH.paper, [x!, y! + .08, .192], [.12, .1, .002], 'unit');
  }
}

/** Eight sides are enough at room scale; each ring uses true radial normals/UV faces. */
function horizontalPipe(k: Kit, slot: string, x0: number, x1: number, y: number, z: number, radius: number): void {
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, b = (i + 1) * Math.PI / 4;
    k.mesh.addQuad(slot, [[x0, y + Math.cos(a) * radius, z + Math.sin(a) * radius],
      [x0, y + Math.cos(b) * radius, z + Math.sin(b) * radius],
      [x1, y + Math.cos(b) * radius, z + Math.sin(b) * radius],
      [x1, y + Math.cos(a) * radius, z + Math.sin(a) * radius]]);
  }
}

/** Family-local upgrade keeps the public recipe IDs stable for generated buildings. */
export const damagedRecipes: RecipeSet = add => {
  legacyDamagedRecipes((id, draw) => { if (!DAMAGED_QUALITY_IDS.has(id) && !DAMAGED_SERVICE_IDS.has(id)) add(id, draw); });
  damagedQualityRecipes(add);
  damagedServiceRecipes(add);
  damagedBathroomRecipes(add);
  damagedApartmentDoorRecipes(add);
};
