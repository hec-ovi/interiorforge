import type{Kit}from'../../modules/kit.js';
import{FINISH as F}from'../../modules/finishes.js';
import{softBox,upholsteryProfile}from'../luxury/model-geometry.js';
import{CORPORATE_MATERIAL as M}from'./materials.js';
const NAVY='cyberpunk/meridian-upholstery/rich#navy';
/** Fixed low upholstered bench, not a residential loose-cushion sofa. The seat
 * stays at the unchanged consumer's 0.49 m support, with a separate rigid base. */
export function corporateBench(k:Kit):void{
  softBox(k,F.black,[0,0,0],[2.71,.075,.94],{radius:.012});
  softBox(k,NAVY,[0,.075,0],[2.8,.325,1],{radius:.006,planRadius:.012});
  for(let i=0;i<3;i++){
    const x=-.923+i*.923;
    softBox(k,NAVY,[x,.400,.09],[.910,.09,.76],{radius:.018,planRadius:.023,crown:.006});
    upholsteryProfile(k,NAVY,x,.910,[[.44,-.33],[.47,-.265],[.76,-.35],[.84,-.415],[.83,-.46],[.42,-.46]]);
  }
  k.cbox(M.bronze,[0,.38,.489],[2.72,.008,.008]);
  for(const x of [-1.387,1.387])k.cbox(M.dark,[x,.12,0],[.012,.255,.94]);
}
