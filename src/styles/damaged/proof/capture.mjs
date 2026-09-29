import { Browser, sleep } from '../../../../scripts/review-browser.mjs';
const browser=new Browser();await browser.started;
const page=await browser.open();page.on('Fetch.requestPaused',e=>page.send('Fetch.continueRequest',{requestId:e.requestId}));
page.on('Runtime.exceptionThrown',e=>console.log(e.exceptionDetails));
try{
for(const [name,models,views] of [
 ['seating',[['fit-damaged-sofa',0,0],['fit-damaged-chair',1.5,.1]],[[[2.7,1.9,3.6],[.3,.43,0]], [[-1.9,1.55,-3],[.2,.4,0]]]],
 ['bed',[['fit-damaged-bed',0,0]],[[[2.25,1.9,2.65],[0,.44,0]], [[1.2,1.2,-1.9],[0,.52,-.45]]]],
 ['storage',[['fit-damaged-wardrobe',-.95,0],['fit-damaged-fridge',.85,0]],[[[2.7,2.15,3.7],[0,.95,0]]]],
 ['kitchen',[['fit-damaged-kitchen',0,0]],[[[2.4,1.8,3.2],[0,.55,0]], [[.2,1.62,1.2],[-.45,.84,0]]]],
 ['bathroom',[['fit-shower-damaged',-.65,0],['fit-basin-damaged',.65,0],['fit-toilet',1.35,.02]],[[[2.7,2.15,3.7],[.2,.95,0]], [[.2,1.6,1.4],[-.65,.9,0]]]],
 ['reception',[['fit-damaged-caretaker-desk',0,0],['fit-damaged-mail-bank',-3,0]],[[[3.7,2.1,4.8],[-.8,.6,0]], [[1.6,1.75,-2.8],[0,.65,0]]]],
 ['door',[['apartment-leaf-damaged',-.45,0],['apartment-numberplate-damaged',.65,0]],[[[1.6,1.65,3.2],[0,1.12,0]]]],
]){
 const url=new URL('http://localhost:5306/@fs/work/interior/src/styles/damaged/proof/view.html');url.searchParams.set('models',JSON.stringify(models));await page.navigate(url.href);
 for(let i=0;i<90&&!await page.evaluate('window.ready');i++)await sleep(300);
 if(!await page.evaluate('window.ready'))throw new Error(`Proof did not load: ${name}`);
 for(let i=0;i<views.length;i++){
  await page.evaluate(`window.setView(${JSON.stringify(views[i][0])},${JSON.stringify(views[i][1])})`);
  await page.screenshot(new URL(`../../../../out/proof/damaged-02/${name}-${i+1}.png`,import.meta.url).pathname);
 }
}
}finally{await browser.close();}
