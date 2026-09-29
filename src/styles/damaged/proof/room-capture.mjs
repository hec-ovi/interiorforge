import { Browser, sleep } from '../../../../scripts/review-browser.mjs';
import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=process.env.DAMAGED_PROOF_OUT??fileURLToPath(new URL('../../../../out/proof/damaged-03/',import.meta.url));
const views=JSON.parse(await readFile(join(out,'actual-rooms.json'),'utf8'));
const errors=[], scenes=new Map();
for(const view of views){const scene=view.scene??view.name;if(!scenes.has(scene))scenes.set(scene,[]);scenes.get(scene).push(view);}
// Load each complete floor once, then inspect its rooms. A fresh renderer per
// floor releases GPU textures instead of accumulating a whole matrix in one tab.
for(const [scene, group] of scenes){
 const browser=new Browser();await browser.started;
 const page=await browser.open();
 page.on('Fetch.requestPaused',e=>page.send('Fetch.continueRequest',{requestId:e.requestId}));
 page.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails));
 try{
 await page.navigate('http://localhost:5306/@fs/work/interior/src/styles/damaged/proof/services.html?profile='+group[0].name+'&proof='+basename(out));
 for(let i=0;i<120&&!await page.evaluate('window.ready');i++)await sleep(250);
 if(!await page.evaluate('window.ready'))throw new Error(`Proof did not load: ${scene}`);
 const placements=JSON.parse(await readFile(join(out,`${scene}.json`),'utf8'));
 for(const view of group){
 await page.evaluate(`window.setRoomView(${JSON.stringify(view.at)},${JSON.stringify(view.aim)})`);
 await page.screenshot(join(out,`${view.name}.png`));
 const wardrobe=placements.find(p=>p.room===view.room&&p.module==='fit-damaged-wardrobe');
 const at=view.reverseAt??(wardrobe?[wardrobe.position[0]+Math.sin(wardrobe.rotationY)*2.2,1.62,wardrobe.position[2]+Math.cos(wardrobe.rotationY)*2.2]:view.at);
 const aim=view.reverseAim??(wardrobe?[wardrobe.position[0],1.3,wardrobe.position[2]]:[view.aim[0],3.45,view.aim[2]]);
 await page.evaluate(`window.setView(${JSON.stringify(at)},${JSON.stringify(aim)})`);
 await page.screenshot(join(out,`${view.name}-reverse.png`));
 }
 }finally{await browser.close();}
}
console.log(JSON.stringify({errors}));
