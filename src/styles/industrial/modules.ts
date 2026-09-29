import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import { chamferBox } from './geometry.js';
import { industrialServiceRecipes } from './service-recipes.js';
import { electricalElevation, ventilationBank, SERVICE_METAL } from './equipment.js';
import { softBox, tube } from '../luxury/model-geometry.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import type { RecipeSet } from '../../modules/recipes.js';


/** Sheet-metal edges catch light at millimetre scale; broad fields stay flat. */
function box(k: Kit, slot: string, at: Vec3, size: Vec3, ...rest: Parameters<Kit['cbox']> extends [any, any, any, ...infer R] ? R : never): void {
  if (!rest.length && Math.min(...size) >= .018) chamferBox(k, slot, at, size, slot === F.black ? .007 : .003);
  else k.cbox(slot, at, size, ...rest);
}
const ENAMEL = 'cyberpunk/interior-service-enamel/poor#petrol';

/** Utility details from the service-layer references: separate service runs,
 * collars, enclosures and kick protection.
 * Models use existing published materials and fit the planner's exact reservations. */
function vent(k: Kit, x: number, y: number, z: number, width: number, count: number): void {
  k.cbox(F.black, [x, y, z], [width, count * .025 + .015, .008]);
  for (let i = 0; i < count; i++) k.cbox(F.zinc, [x, y + .012 + i * .025, z + .008], [width - .012, .009, .006]);
}

function handle(k: Kit, x: number, y: number, z: number, width = .12): void {
  for (const dx of [-width / 2 + .007, width / 2 - .007]) k.cbox(F.chrome, [x + dx, y, z], [.014, .018, .018]);
  k.cbox(F.chrome, [x, y, z + .012], [width, .018, .012]);
}

function label(k: Kit, x: number, y: number, z: number, width: number): void {
  k.cbox(F.paper, [x, y, z], [width, .025, .002]);
  for (let i = 0; i < 13; i++) k.cbox(F.black, [x - width * .4 + i * width * .045, y + .004, z + .002], [width * (i % 3 === 0 ? .018 : .009), .014, .001]);
}

function feet(k: Kit, width: number, depth: number, height: number): void {
  for (const x of [-width / 2 + .055, width / 2 - .055]) for (const z of [-depth / 2 + .055, depth / 2 - .055]) {
    k.cbox(F.black, [x, 0, z], [.1, .025, .1]);
    k.cbox(F.steel, [x, .025, z], [.055, height - .025, .055]);
  }
}

/** Closed twelve-sided service pipe, along local X. */
function pipe(k: Kit, slot: string, x0: number, x1: number, y: number, z: number, radius: number): void {
  tube(k, slot, [[x0,y,z],[x1,y,z]], radius, false, 16);
}

/** All furniture is centred in XZ, floor standing, and faces local +Z. */
export const industrialRecipes: RecipeSet = add => {
  industrialServiceRecipes(add);
  add('floor-industrial-route-line',k=>k.cbox('cyberpunk/interior-service-vinyl/poor#ochre',[0,.001,0],[.5,.002,.055]));
  add('ceiling-spot-industrial-batten',k=>{
    chamferBox(k,SERVICE_METAL,[0,.023,0],[.48,.055,.19],.008);
    for(const z of [-.043,.043])tube(k,F.lensCool,[[-.19,.009,z],[.19,.009,z]],.009,false,12);
    for(const x of [-.212,.212])chamferBox(k,F.zinc,[x,-.009,0],[.035,.06,.17],.005);
    for(const x of [-.15,0,.15])tube(k,SERVICE_METAL,[[x,.022,-.085],[x,-.013,-.07],[x,-.018,0],[x,-.013,.07],[x,.022,.085]],.003,false,6);
  });
  add('wall-field-industrial', k => k.cbox(F.damagedWall, [0, 0, .0475], [.5, .5, .095]));
  add('floor-slab-industrial', k => {
    k.cbox(F.concrete, [0, -.15, 0], [.5, .15, .5], undefined, ['bottom', 'north', 'south', 'east', 'west']);
    k.cbox(F.damagedFloor, [0, -.02, 0], [.5, .02, .5], undefined, ['top']);
  });
  add('ceiling-field-industrial', k => {
    k.cbox(F.concrete, [0, .04, 0], [.5, .06, .5], undefined, ['bottom', 'north', 'south', 'east', 'west']);
  });
  add('ceiling-services-industrial', k => {
    // Stretch only the continuous runs; separate collars and suspension frames
    // are placed at metre intervals, so their thickness never follows room size.
    pipe(k, SERVICE_METAL, -.25, .25, -.15, -.1, .06);
    pipe(k, F.zinc, -.25, .25, -.1, .1, .0225);
    for (const z of [-.025, .155]) k.cbox(F.zinc, [0, -.235, z], [.5, .055, .015]);
    for (const z of [.015, .055, .095, .135]) k.cbox(F.black, [0, -.24, z], [.5, .015, .02]);
  });
  add('ceiling-services-industrial-support', k => {
    k.rod(F.steel, [0, -.26, -.175], [0, -.26, .175], .018);
    for (const z of [-.165, .165]) k.rod(F.steel, [0, -.26, z], [0, .035, z], .014);
    for (const z of [-.025, .155]) k.cbox(F.zinc, [0, -.24, z], [.025, .055, .015]);
  });
  add('ceiling-services-industrial-coupling', k => {
    pipe(k, F.zinc, -.025, .025, -.15, -.1, .071);
    pipe(k, F.steel, -.022, .022, -.1, .1, .03);
  });
  add('fit-industrial-drive-bank', electricalElevation);
  add('fit-industrial-ventilation-bank', ventilationBank);
  add('ceiling-services-industrial-branch', k => {
    pipe(k,F.zinc,-.25,.25,-.15,0,.025);
  });
  add('ceiling-services-industrial-terminal', k => {
    box(k,F.steel,[0,-.24,0],[.26,.16,.24]);
    for(const x of [-.08,-.04,0,.04,.08])box(k,F.black,[x,-.245,0],[.018,.007,.18]);
    pipe(k,F.zinc,-.18,0,-.15,0,.031);
  });
  add('fit-industrial-storage-rack', k => {
    for (const x of [-.87, .87]) for (const z of [-.22, .22]) {
      // Open L-section uprights, not solid square posts.
      box(k, F.steel, [x, 0, z - .025], [.06, 2, .01]);
      box(k, F.steel, [x - .025, 0, z], [.01, 2, .06]);
      for (let y = .2; y < 1.9; y += .25) box(k, F.black, [x, y, z + .028], [.018, .04, .003]);
    }
    for (const y of [.1, .7, 1.3, 1.9]) {
      box(k, F.zinc, [0, y, 0], [1.74, .008, .47]);
      for (const x of [-.845,.845]) box(k, F.zinc, [x, y-.026, 0], [.018,.034,.47]);
      box(k, F.steel, [0, y - .035, .225], [1.74, .043, .02]);
    }
    // The rack carries its inventory; individual crates need not block floor aisles.
    for (const [y, count] of [[.135, 3], [.735, 2], [1.335, 3]] as const) {
      for (let i = 0; i < count; i++) {
        const x = -.55 + i * .53;
        box(k, i % 2 ? F.cardboard : SERVICE_METAL, [x, y, 0], [.43, .32, .39]);
        box(k, F.black, [x, y + .31, 0], [.45, .025, .41]);
        label(k, x, y + .22, .198, .15);
        if(i%2){
          box(k,F.paper,[x,y+.336,0],[.045,.002,.37]);
          box(k,F.paper,[x,y+.15,.197],[.045,.16,.001]);
        }else{
          for(const dx of [-.16,.16])box(k,F.zinc,[x+dx,y+.24,.197],[.035,.09,.008]);
          handle(k,x,y+.16,.195,.11);
        }
      }
    }
    k.rod(F.steel, [-.82, .14, -.235], [.82, 1.87, -.235], .025);
  });
  add('fit-industrial-transit-case', k => {
    for (const x of [-.23, .23]) box(k, F.black, [x, 0, 0], [.09, .05, .54]);
    box(k, SERVICE_METAL, [0, .05, 0], [.58, .43, .58]);
    box(k, F.steel, [0, .48, 0], [.62, .07, .62]);
    for (const x of [-.29, .29]) for (const z of [-.29, .29]) box(k, F.zinc, [x, .05, z], [.04, .43, .04]);
    for (const x of [-.2, .2]) box(k, F.zinc, [x, .4, .299], [.06, .1, .022]);
    handle(k, 0, .29, .288, .18);
    label(k, 0, .12, .292, .2);
  });
  add('fit-industrial-workbench', k => {
    feet(k, 1.6, .8, .68);
    box(k, F.steel, [0, .64, 0], [1.51, .06, .72]);
    box(k, F.zinc, [0, .7, 0], [1.6, .05, .8]);
    box(k, F.steel, [-.52, .31, 0], [.43, .33, .66]);
    for (let y = .32; y < .62; y += .1) {
      box(k, F.black, [-.52, y, .335], [.37, .008, .003]);
      handle(k, -.52, y + .045, .337);
    }
    k.rod(F.steel, [-.71, .2, -.31], [.71, .2, -.31], .045);
  });
  add('fit-industrial-tool-counter', k => {
    box(k, F.black, [0, 0, 0], [1.88, .1, .6]);
    box(k, ENAMEL, [0, .1, 0], [1.96, .73, .66]);
    box(k, F.zinc, [0, .83, 0], [2, .07, .7]);
    for (const x of [-.65, 0, .65]) {
      box(k, F.black, [x, .14, .331], [.615, .65, .004]);
      for (let row = 0; row < 4; row++) {
        box(k, ENAMEL, [x, .16 + row * .155, .335], [.59, .14, .006]);
        handle(k, x, .23 + row * .155, .329, .22);
      }
    }
  });
  add('fit-industrial-dispatch-desk', k => {
    box(k, F.black, [0, 0, 0], [2.48, .1, .78]);
    for (const x of [-1.2, 1.2]) box(k, F.steel, [x, .1, 0], [.16, .94, .82]);
    box(k, F.zinc, [0, .72, -.08], [2.5, .045, .68]);
    box(k, F.steel, [0, .1, .35], [2.5, .91, .14]);
    box(k, F.zinc, [0, 1.01, .29], [2.6, .09, .32]);
    box(k, F.black, [0, .18, .426], [2.36, .06, .008]);
    for (const x of [-.85, .85]) {
      vent(k, x, .3, .426, .48, 7);
      label(k, x, .82, .43, .3);
    }
    box(k, F.black, [0, .765, -.1], [.38, .06, .25]);
    box(k, F.steel, [0, .82, .02], [.36, .18, .05]);
  });
  add('fit-industrial-lockers', k => {
    box(k, F.black, [0, 0, 0], [1.52, .08, .59]);
    box(k, F.steel, [0, .08, 0], [1.6, 1.92, .62]);
    for (const x of [-.6, -.2, .2, .6]) {
      box(k, F.black, [x, .12, .312], [.385, 1.84, .006]);
      box(k, F.zinc, [x, .14, .319], [.365, 1.8, .008]);
      vent(k, x, 1.67, .313, .26, 5);
      vent(k, x, .26, .313, .26, 4);
      box(k, F.black, [x + .12, .96, .319], [.04, .16, .01]);
      label(k, x, 1.48, .321, .12);
    }
  });
  add('fit-industrial-bench', k => {
    for (const x of [-.68, .68]) {
      box(k, F.black, [x, 0, 0], [.24, .035, .38]);
      box(k, F.steel, [x, .035, 0], [.08, .34, .3]);
    }
    for (const z of [-.135, 0, .135]) box(k, F.zinc, [0, .375, z], [1.8, .075, .125]);
  });
  add('wall-shelf-industrial-parts', k => {
    box(k, F.steel, [0, 0, -.125], [1.2, .4, .03]);
    box(k, F.zinc, [0, 0, 0], [1.2, .03, .28]);
    for (const x of [-.58, .58]) box(k, F.steel, [x, 0, 0], [.04, .4, .28]);
    for (let i = 0; i < 4; i++) {
      const x = -.43 + i * .285;
      box(k, F.black, [x, .03, 0], [.25, .2, .24]);
      box(k, F.zinc, [x, .03, .125], [.25, .12, .018]);
      label(k, x, .07, .136, .12);
    }
  });
  add('wall-art-industrial-service', k => {
    // A shallow architectural maintenance diagram and breaker panel, no false door.
    box(k, F.steel, [0, 0, 0], [.7, 1.05, .04]);
    box(k, F.black, [0, .26, .022], [.63, .71, .009]);
    for (const x of [-.2, 0, .2]) {
      box(k, F.zinc, [x, .55, .021], [.175, .37, .012]);
      box(k, F.black, [x + .05, .62, .027], [.022, .1, .006]);
      label(k, x, .81, .026, .1);
      box(k, F.zinc, [x, .02, .02], [.025, .5, .016]);
    }
    vent(k, 0, .32, .017, .5, 4);
  });
  add('wall-screen-industrial-status', k => {
    box(k, SERVICE_METAL, [0, 0, 0], [1.2, .7, .072]);
    box(k, F.black, [0, .06, .036], [1.08, .57, .001]);
    // Static service schematic: equipment lanes with fine identifiers and levels,
    // not an unrelated advertising picture mapped over a utility display.
    for(let column=0;column<3;column++){
      const x=-.36+column*.36;
      k.cbox(F.paper,[x,.49,.038],[.23,.014,.001]);
      k.cbox(F.paper,[x-.06,.53,.038],[.10,.035,.001]);
      k.cbox(F.zinc,[x,.15,.038],[.006,.29,.001]);
      for(let row=0;row<3;row++){
        k.cbox(F.paper,[x-.075,.17+row*.09,.038],[.085,.005,.001]);
        k.cbox(F.paper,[x-.12,.15+row*.09,.038],[.045,.04,.001]);
        k.cbox(ENAMEL,[x+.06,.15+row*.09,.038],[.09,.033,.001]);
      }
      for(let tick=0;tick<column+2;tick++)k.cbox(F.paper,[x+.03+tick*.019,.16,.039],[.006,.019,.001]);
    }
  });
  add('fit-industrial-task-chair', k => {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const x = Math.cos(angle) * .285, z = Math.sin(angle) * .285;
      tube(k,F.black,[[x-.025,.03,z],[x+.025,.03,z]],.03,false,16);
      box(k,F.zinc,[x,.037,z],[.034,.033,.023]);
      k.rod(F.steel, [0, .12, 0], [x, .06, z], .035);
    }
    k.cylinder(F.chrome, [0, .1, 0], .045, .32);
    softBox(k, 'cyberpunk/interior-service-vinyl/poor#umber', [0, .4, 0], [.52, .09, .51], {radius:.025, crown:.009, planRadius:.055});
    for(const x of [-.18,.18])tube(k,F.steel,[[x,.43,-.15],[x,.53,-.23],[x,.65,-.255],[x,1.1,-.255]],.012,false,12);
    softBox(k, 'cyberpunk/interior-service-vinyl/poor#umber', [0, .67, -.20], [.5, .45, .095], {radius:.025, planRadius:.035, lean:.035, frontCrown:.01});
    for (const x of [-.29, .29]) {
      box(k, F.steel, [x, .46, -.08], [.025, .2, .025]);
      box(k, F.black, [x, .65, -.03], [.07, .035, .33]);
    }
  });
  add('fit-industrial-chair', k => {
    feet(k, .45, .45, .43);
    box(k, F.steel, [0, .45, 0], [.45, .04, .45]);
    for (const x of [-.18, .18]) box(k, F.steel, [x, .47, -.18], [.025, .43, .025]);
    box(k, F.zinc, [0, .65, -.18], [.4, .23, .03]);
  });
  add('fit-industrial-table', k => {
    feet(k, .9, .9, .69);
    box(k, F.steel, [0, .65, 0], [.83, .05, .83]);
    box(k, F.zinc, [0, .7, 0], [.9, .05, .9]);
  });
};
