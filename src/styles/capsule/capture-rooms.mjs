import { readFile } from 'node:fs/promises';
import { Browser, sleep } from '../../../scripts/review-browser.mjs';

const root = new URL('../../../out/proof/capsule-quality/units/', import.meta.url);
const reports = JSON.parse(await readFile(new URL('units.json', root), 'utf8'));
const browser = new Browser();
await browser.started;
const page = await browser.open();
page.on('Fetch.requestPaused', event => page.send('Fetch.continueRequest', {requestId:event.requestId}));
page.on('Runtime.exceptionThrown', event => console.error(event.exceptionDetails));
try {
  for (const report of reports) {
    const url = new URL('http://localhost:5306/@fs/work/interior/out/proof/capsule-quality/units/unit-view.html');
    url.searchParams.set('set', report.set);
    await page.navigate(url.href);
    for(let i=0;i<120&&!await page.evaluate('window.ready');i++) await sleep(250);
    if(!await page.evaluate('window.ready')) throw new Error(`Unit viewer failed: ${report.set}`);
    for(const view of report.views){
      await page.evaluate(`window.setView(${JSON.stringify(view)})`);
      await page.screenshot(new URL(`${report.set}-${view.name}.png`,root).pathname);
    }
  }
} finally { await browser.close(); }
