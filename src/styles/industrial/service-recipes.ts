import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import { tube } from '../luxury/model-geometry.js';
import { SERVICE_METAL } from './equipment.js';

/** Hare 73030 and Clouds 74647: distinct diameter/depth hierarchies,
 * connected cable trays and independent fixed-size supports and coupling bolts. */
export const industrialServiceRecipes:RecipeSet=add=>{
  add('ceiling-services-industrial-bank',k=>{
    tube(k,F.zinc,[[-.25,-.12,-.2],[.25,-.12,-.2]],.105,false,20);
    tube(k,SERVICE_METAL,[[-.25,-.14,.015],[.25,-.14,.015]],.055,false,16);
    for(const z of [.175,.365])k.cbox(F.zinc,[0,-.26,z],[.5,.066,.014]);
    for(let i=0;i<6;i++)tube(k,F.black,[[-.25,-.222,.20+i*.027],[.25,-.222,.20+i*.027]],.009,false,8);
  });
  add('ceiling-services-industrial-bank-support',k=>{
    k.cbox(SERVICE_METAL,[0,-.268,.03],[.036,.017,.76]);
    for(const z of [-.34,.40])tube(k,F.zinc,[[0,-.25,z],[0,.035,z]],.007,false,8);
    for(const z of [-.34,.40])k.cbox(SERVICE_METAL,[0,.018,z],[.11,.022,.07]);
  });
  add('ceiling-services-industrial-bank-coupling',k=>{
    for(const [y,z,r]of [[-.12,-.2,.115],[-.14,.015,.064]]as const){
      tube(k,SERVICE_METAL,[[-.026,y,z],[.026,y,z]],r,false,20);
      for(const side of [-1,1])for(let i=0;i<8;i++){
        const a=i*Math.PI/4,rr=r+.009,yy=y+Math.cos(a)*rr,zz=z+Math.sin(a)*rr;
        tube(k,F.zinc,[[side*.026,yy,zz],[side*.037,yy,zz]],.006,false,6);
      }
    }
  });
  add('ceiling-services-industrial-tray-rungs',k=>{
    for(const x of [-.2,-.1,0,.1,.2])k.cbox(F.zinc,[x,-.255,.27],[.016,.016,.19]);
  });
  add('ceiling-services-industrial-feed-drop',k=>{
    for(const x of [-.031,0,.031])tube(k,F.black,[[x,0,0],[x,.5,0]],.011,false,10);
  });
  add('ceiling-services-industrial-feed-run',k=>{
    for(const z of [-.031,0,.031])tube(k,F.black,[[-.25,0,z],[.25,0,z]],.011,false,10);
  });
  add('ceiling-services-industrial-feed-joint',k=>{
    k.cbox(SERVICE_METAL,[0,-.042,0],[.11,.084,.11]);
    for(const x of [-.036,.036])k.cbox(F.zinc,[x,.042,0],[.011,.003,.011]);
  });
  add('ceiling-services-industrial-feed-clamp',k=>{
    k.cbox(F.zinc,[0,0,.01],[.095,.018,.028]);
    for(const x of [-.04,.04])k.cbox(SERVICE_METAL,[x,.018,.021],[.009,.006,.009]);
  });

};
