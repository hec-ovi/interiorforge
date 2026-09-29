import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Vector3 } from '../../modules/types.js';
import { CORPORATE_MATERIAL as M } from './materials.js';
import { recordsCabinet,occupiedLibrary,binder } from './library.js';
import { executiveDesk } from './desk.js';
import { corporateBench } from './seating.js';
import { lettering } from './lettering.js';
import { softBox, tube } from '../luxury/model-geometry.js';

const ALLOY = M.alloy;
const MINERAL = M.mineral;
const DARK = M.dark;
function joinery(k: Kit, material: string, at: Vector3, size: Vector3, radius = .003): void {
  softBox(k, material, at, size, { radius, planRadius: radius, detail: 0 });
}
function pull(k: Kit, x: number, y: number, z: number, width: number): void {
  tube(k, ALLOY, [[x - width / 2, y, z - .012], [x - width / 2, y, z],
    [x + width / 2, y, z], [x + width / 2, y, z - .012]], .005, false, 12);
}

/** Gutierrez reference: broad dark architectural planes, inset light drawer fronts,
 * fine metal joints, layered shelves and a quiet timber ceiling. All joinery is solid. */
export const corporateRecipes: RecipeSet = add => {
  add('fit-corporate-bench',corporateBench);
  add('fit-corporate-executive-desk',executiveDesk);
  add('wall-corporate-inlay',k=>k.cbox(M.bronze,[0,0,.096],[.003,.5,.002]));
  add('wall-corporate-base',k=>k.cbox('cyberpunk/district-panel-red/rich#clean',[0,0,.097],[.5,.025,.004]));
  for (const horizontal of [false, true]) add(horizontal ? 'door-header-corporate' : 'door-jamb-corporate', k => {
    const w = horizontal ? .5 : .08, h = horizontal ? .08 : .5;
    // Closed charcoal reveal with satin face strips; no threshold blocks the opening.
    k.cbox(F.black, [0, 0, 0], [w, h, .18]);
    for (const z of [-.095, .095]) {
      k.cbox(M.bronze, [0, 0, z], [w, h, .01]);
      k.cbox(DARK, [0, horizontal ? .016 : 0, z + Math.sign(z) * .004],
        [horizontal ? w : .048, horizontal ? .048 : h, .002]);
    }
  });
  for (const [name, slot] of [['graphite', DARK], ['mineral', MINERAL]]) {
    add(`wall-field-corporate-${name}`, k => k.cbox(slot!, [0, 0, .0475], [.5, .5, .095]));
  }
  for (const [name, slot] of [['timber', M.ceiling], ['mineral', F.ceilingLight], ['public', M.dark]]) {
    add(`ceiling-field-corporate-${name}`, k => k.cbox(slot!, [0, 0, 0], [.5, .092, .5]));
  }
  add('ceiling-spot-corporate-panel',k=>{
    joinery(k,M.dark,[0,.008,0],[.49,.06,.49],.006);
    for(const x of [-.2375,.2375])k.cbox(M.bronze,[x,-.002,0],[.010,.010,.485]);
    for(const z of [-.2375,.2375])k.cbox(M.bronze,[0,-.002,z],[.465,.010,.010]);
    k.cbox(F.lensWarm,[0,0,0],[.455,.004,.455]);
  });
  add('ceiling-corporate-backing', k => k.cbox(F.black, [0, .092, 0], [.5, .008, .5]));
  add('floor-slab-corporate-wood',k=>{
    k.cbox(F.concrete,[0,-.15,0],[.5,.14,.5]);
    k.cbox(M.ceiling,[0,-.01,0],[.5,.01,.5]);
  });
  add('floor-slab-corporate-carpet', k => {
    k.cbox(F.concrete, [0, -.15, 0], [.5, .142, .5]);
    k.cbox(M.carpet, [0, -.008, 0], [.5, .008, .5]);
  });
  add('fit-corporate-boardroom-table', k => {
    // Twin cast feet, independent uprights, cable spine and a thin walnut top.
    for (const x of [-.87, .87]) {
      joinery(k, F.black, [x, 0, 0], [.40, .023, .79], .009);
      joinery(k, ALLOY, [x, .023, 0], [.15, .654, .50], .012);
    }
    joinery(k, F.black, [0, .55, 0], [2.10, .075, .17]);
    joinery(k, M.bronze, [0, .677, 0], [2.74, .023, 1.14], .007);
    softBox(k, M.stone, [0, .70, 0], [2.8, .05, 1.2], { radius: .007, planRadius: .095, detail: 0 });
    // Flush cable hatches: no large electronic blocks on the shared worktop.
    for (const x of [-.64, .64]) {
      joinery(k, F.black, [x, .749, 0], [.286, .001, .114], .0002);
      joinery(k, ALLOY, [x, .7496, 0], [.270, .0004, .098], .0001);
    }
  });
  add('fit-corporate-security-desk', k => {
    joinery(k, F.black, [.36, 0, .015], [1.72, .09, .70]);
    joinery(k, DARK, [.36, .09, .325], [1.80, .945, .18]);
    for (const x of [-.49, 1.21]) joinery(k, DARK, [x, .09, -.05], [.1, .945, .67]);
    joinery(k, M.bronze, [.35, 1.033, .02], [1.90, .009, .86]);
    joinery(k, M.stone, [.35, 1.055, .02], [1.90, .045, .86], .006);
    joinery(k,M.bronze,[.35,1.042,.02],[1.90,.013,.86],.002);
    // Lower accessible transaction leaf, open knee space, staff working surface.
    joinery(k, M.veneer, [-.85, .745, 0], [.9, .04, .84]);
    joinery(k, ALLOY, [-1.25, .04, 0], [.05, .705, .68]);
    joinery(k, M.veneer, [.34, .745, -.115], [1.58, .04, .49]);
    joinery(k, F.black, [.47, .785, -.22], [.20, .015, .12]);
    joinery(k, ALLOY, [.47, .80, -.22], [.033, .083, .03]);
    joinery(k, F.black, [.47, .875, -.22], [.38, .20, .025]);
    k.cbox(F.art, [.47, .887, -.234], [.354, .175, .002], 'unit', ['north']);
    joinery(k, F.black, [-.96, .785, .10], [.10, .04, .15], .006);
    joinery(k, ALLOY, [-.96, .825, .10], [.035, .001, .048], .0002);
    joinery(k, ALLOY, [.36, .15, .417], [1.68, .014, .008]);
    // Recessed front panels retain millimetre reveals, not a luminous outline.
    for (const x of [-.08, .80]) joinery(k, DARK, [x, .205, .421], [.86, .69, .020]);
  });
  add('fit-corporate-records-cabinet',recordsCabinet);
  add('fit-corporate-occupied-library',occupiedLibrary);
  add('fit-corporate-credenza', k => {
    joinery(k, F.black, [0, 0, -.015], [1.90, .09, .59]);
    joinery(k, M.veneer, [0, .09, 0], [2, .76, .67]);
    joinery(k, M.stone, [0, .85, 0], [2, .05, .70], .004);
    for (const x of [-.74, -.247, .247, .74]) {
      joinery(k, MINERAL, [x, .12, .34], [.482, .69, .020]);
      pull(k, x, .758, .345, .21);
    }
  });
  add('wall-corporate-document-shelf', k => {
    for (const x of [-.53, .53]) joinery(k, ALLOY, [x, 0, -.125], [.035, .4, .028]);
    for (const y of [.015, .37]) joinery(k, M.veneer, [0, y, 0], [1.2, .03, .28]);
    // Bound pages, finger rings and label pockets remain separate small forms.
    for(let i=0;i<14;i++)binder(k,-.49+i*.066,.046,-.01,.056,.27+(i%3)*.013,.225,i%6===0);
  });
  add('wall-corporate-art',k=>{
    joinery(k,M.veneer,[0,.025,-.045],[1.38,.73,.05],.004);
    for(const x of [-.676,.676])joinery(k,M.bronze,[x,.04,-.012],[.018,.70,.014],.002);
    for(const y of [.04,.722])joinery(k,M.bronze,[0,y,-.012],[1.37,.018,.014],.002);
    // Exact 2:1 artwork stays unlit; the separately modeled hood lights it.
    k.cbox('cyberpunk/gutierrez-art/rich#teal-copper',[0,.070,-.016],[1.28,.64,.003],'unit',['north']);
    for(const x of [-.43,.43])joinery(k,M.bronze,[x,.745,-.01],[.016,.05,.08],.002);
    joinery(k,M.veneer,[0,.790,.015],[1.04,.052,.13],.007);
    k.cbox(F.black,[0,.775,.042],[.96,.015,.054]);
    k.cbox(F.lensWarm,[0,.773,.056],[.92,.004,.018]);
  });
  add('wall-corporate-directory', k => {
    joinery(k,M.bronze,[0,0,0],[1.4,.85,.05],.005);
    joinery(k,DARK,[0,.018,.027],[1.364,.814,.012],.003);
    lettering(k,M.bronze,'DIRECTORY',-.58,.69,.034,.011);
    for(const [label,y]of [['RECEPTION',.49],['LIFTS',.31],['MEETING',.13]]as const){
      lettering(k,MINERAL,label,-.55,y,.034,.008);
      joinery(k,M.bronze,[0,y-.035,.034],[1.10,.002,.001],.0001);
    }
  });
};
