import { Browser, sleep } from '../../../../scripts/review-browser.mjs';
const browser=new Browser();await browser.started;
const page=await browser.open();const errors=[];
page.on('Fetch.requestPaused',e=>page.send('Fetch.continueRequest',{requestId:e.requestId}));
page.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails));
try{
for(const [profile,views] of [
 ['public',[[[2.3,1.62,1.25],[-.35,1.65,-1.5]], [[1.1,2.02,.75],[0,2.25,-.75]], [[-.9,1.75,-.25],[0,1.47,-1.35]]]],
 ['lodging',[[[2.4,1.65,1.8],[-.5,1.1,-1.1]], [[-2.6,1.62,1.5],[.6,1.1,-1.2]]]],
]){
 await page.navigate('http://localhost:5306/@fs/work/interior/src/styles/damaged/proof/services.html?profile='+profile);
 for(let i=0;i<90&&!await page.evaluate('window.ready');i++)await sleep(250);
 if(!await page.evaluate('window.ready'))throw new Error(`Proof did not load: ${profile}`);
 for(let i=0;i<views.length;i++){
  await page.evaluate(`window.setView(${JSON.stringify(views[i][0])},${JSON.stringify(views[i][1])})`);
  await page.screenshot(new URL(`../../../../out/proof/damaged-03/${profile}-${i+1}.png`,import.meta.url).pathname);
 }
}
console.log(JSON.stringify({ errors }));
}finally{await browser.close();}
