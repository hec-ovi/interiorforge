import type{FloorInterior}from'../../core/types.js';
import type{PlacementBuilder}from'../../placements/builder.js';

/** Gutierrez broad dark panels: fine vertical warm joints and a continuous low
 * red course. The finished wall runs already exclude doors, glass and openings. */
export function dressCorporateWalls(builder:PlacementBuilder,floor?:FloorInterior):void{
  const fields=builder.placements.filter(p=>p.module==='wall-field-corporate-graphite');
  for(const p of fields){
    const width=p.scale[0]*.5,height=p.scale[1]*.5;
    if(height<1.4||width<.35)continue;
    if(Math.abs(p.position[1])<.02)builder.module('wall-corporate-base',p.room,[...p.position],[width/.5,1,1],p.rotationY);
    const count=Math.max(1,Math.ceil(width/1.65));
    for(let i=1;i<count;i++){
      const x=-width/2+width*i/count;
      builder.module('wall-corporate-inlay',p.room,[p.position[0]+x*Math.cos(p.rotationY),p.position[1]+.027,p.position[2]-x*Math.sin(p.rotationY)],[1,(height-.027)/.5,1],p.rotationY);
    }
  }
  if(floor){
    const warm=new Set(floor.rooms.filter(r=>['reception','corridor','elevator_lobby','concourse','executive_office','office_private'].includes(r.kind)).map(r=>r.id));
    for(const light of floor.lights)if(!light.furniture&&warm.has(light.room)){light.colorTemperatureK=3000;delete light.color;}
  }
  if(floor)for(const p of builder.placements.filter(p=>p.module==='wall-corporate-art')){
    const c=Math.cos(p.rotationY),s=Math.sin(p.rotationY),z=.056*p.scale[2];
    floor.lights.push({id:`${p.id}:picture`,furniture:p.id,room:p.room,kind:'strip',
      position:[p.position[0]+z*s,floor.elevation+p.position[1]+.775*p.scale[1],p.position[2]+z*c],
      length:.92*p.scale[0],angleDeg:-p.rotationY*180/Math.PI,intensity:65,colorTemperatureK:2700,
      axis:[c,0,-s],direction:[-.24*s,-Math.sqrt(1-.24**2),-.24*c],range:2,beamDeg:120,diffuse:.65,facing:'down'});
  }

  if(floor)for(const p of builder.placements.filter(p=>p.module==='fit-botanical-display-biotechnica')){
    const c=Math.cos(p.rotationY),s=Math.sin(p.rotationY);
    for(const [n,y,z,up]of [[0,.625,0,true],[1,2.64,0,false],[2,2.634,-.35,false],[3,2.634,.35,false]]as const){
      floor.lights.push({id:`${p.id}:display-${n}`,furniture:p.id,room:p.room,kind:'strip',
        position:[p.position[0]+z*p.scale[2]*s,floor.elevation+p.position[1]+y*p.scale[1],p.position[2]+z*p.scale[2]*c],
        length:(n<2?2.721:2.95)*p.scale[0],angleDeg:-p.rotationY*180/Math.PI,intensity:up?150:90,colorTemperatureK:3000,
        axis:[c,0,-s],direction:[0,up?1:-1,0],range:2.5,beamDeg:160,diffuse:.95,facing:up?'up':'down'});
    }
  }

}
