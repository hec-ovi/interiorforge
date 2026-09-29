/** Read-only visual inspection of streamed stair cores; no world documents change. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Browser, sleep } from './review-browser.mjs';
const directory=resolve(process.argv[2]??'engine/out/reviews/meridian-luxury-04');
const review=JSON.parse(await readFile(join(directory,'review.json'),'utf8'));
const entry=review.buildings[0], root=join(directory,entry.parcelId,'interior');
const manifest=JSON.parse(await readFile(join(root,'building.json'),'utf8'));
const layouts=Object.fromEntries(await Promise.all(Object.entries(manifest.layouts).map(async([id,file])=>[id,JSON.parse(await readFile(join(root,file),'utf8'))])));
const out=resolve(process.argv[3]??join(directory,`stair-views-${Date.now()}`));await mkdir(out,{recursive:true});
const url=new URL(review.playUrl);url.searchParams.set('automation','1');
const report={url:url.href,out,views:[],errors:[]};
const browser=new Browser();process.once('exit',()=>browser.kill());
try{
 await browser.started;const page=await browser.open();
 page.on('Fetch.requestPaused',async event=>{const pass=['GET','HEAD'].includes(event.request.method);await page.send(pass?'Fetch.continueRequest':'Fetch.failRequest',{requestId:event.requestId,...(pass?{}:{errorReason:'BlockedByClient'})});});
 page.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails.exception?.description??e.exceptionDetails.text));
 await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});await page.navigate(url.href);
 let previous='',ready=false;
 for(let count=0;count<360;count++){
  const state=await page.evaluate(`({ready:Boolean(window.urbe?.automation&&window.urbe.stats.drawCalls),step:document.querySelector('.hud-loading-step')?.textContent,error:document.querySelector('.hud-loading-error:not([hidden])')?.textContent})`);
  if(state.error)throw new Error(state.error);if(state.ready){ready=true;break;}if(state.step!==previous)console.log(previous=state.step);await sleep(500);
 }
 if(!ready)throw new Error('Game loading timeout');
 await page.evaluate(`(()=>{const g=window.urbe;if(!g.view.pause.element.hidden)g.view.pause.buttons.get('resume').click();g.input.onLockChange(g.input.locked=true);})()`);
 for(const index of [0,2,4]){
  const floor=manifest.floors.find(f=>f.index===index),layout=layouts[floor.layout];
  for(const stair of layout.floor.core.stairs){
   const flights=layout.placements.filter(p=>p.connector===stair.id&&p.module?.startsWith('stair-flight-')).sort((a,b)=>a.position[1]-b.position[1]);
   const flight=flights[0],count=Number(flight.module.split('-').at(-1));
   const point=(x,y,z)=>{x*=flight.scale[0];y*=flight.scale[1];z*=flight.scale[2];const c=Math.cos(flight.rotationY),s=Math.sin(flight.rotationY);return[x*c+z*s+flight.position[0],y+floor.elevation+flight.position[1],-x*s+z*c+flight.position[2]];};
   const cameras=[{name:'entrance',at:[stair.entry[0],floor.elevation+.025,stair.entry[1]],aim:point(.725,1.5,2)},
    {name:'up-flight',at:point(.725,.025,-.3),aim:point(.9,9,2.2)},
    {name:'up-landing',at:point(.725,count*.17+.025,count*.28+.55),aim:point(1.45,10,count*.28-1.2)}];
   for(const camera of cameras){
    const xyz=p=>({x:p[0],y:p[1],z:p[2]});
    await page.evaluate(`window.urbe.body.beginCarry(${JSON.stringify(xyz(camera.at))});window.urbe.stream.requestFloor(${JSON.stringify(entry.parcelId)},${index});`);
    for(let i=0;i<200;i++){if(await page.evaluate(`window.urbe.stream.floorShown(${JSON.stringify(entry.parcelId)},${index})`))break;await sleep(100);}
    await page.evaluate(`window.urbe.body.endCarry(${JSON.stringify(xyz(camera.at))});window.urbe.placePlayer(${JSON.stringify(xyz(camera.at))},${JSON.stringify(xyz(camera.aim))});`);await sleep(1300);
    const state=await page.evaluate(`(()=>{const g=window.urbe;return{feet:g.body.feet.toArray(),eye:g.camera.position.toArray(),yaw:g.controller.yaw,pitch:g.controller.pitch,indoors:g.indoors,standing:g.standing?{id:g.standing.id,kind:g.standing.kind,floor:g.standing.floor}:null,rainVisible:g.rain?.mesh.visible,rainSheltered:g.rainSheltered,rainDry:g.rain?.dry.value,bands:g.stream.live.get(${JSON.stringify(entry.parcelId)}).bands.map(b=>({floor:b.floor,elevation:b.elevation,state:b.state,live:b.live,stairs:b.record.placements.filter(p=>p.module?.startsWith('stair-flight')).length})),roofRay:g.physics.world.castRay(new g.physics.rapier.Ray(g.camera.position,{x:0,y:1,z:0}),30,true,undefined,undefined,undefined,undefined,c=>!c.isSensor()&&c.parent()?.isFixed())?.timeOfImpact??null};})()`);
    const name=`${stair.id}-floor-${index}-${camera.name}`;await page.screenshot(join(out,name+'.png'));
    report.views.push({name,camera,...state});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({name,...state}));
   }
  }
 }
} catch(error){report.error=error.stack;process.exitCode=1;}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(`Stair visual audit: ${out}`);}
