import { Browser, sleep } from '../../../scripts/review-browser.mjs';

const output = new URL('../../../out/proof/capsule-quality/', import.meta.url);
const browser = new Browser();
await browser.started;
const page = await browser.open();
page.on('Fetch.requestPaused', event => page.send('Fetch.continueRequest', { requestId: event.requestId }));
page.on('Runtime.exceptionThrown', event => console.error(event.exceptionDetails));
try {
  for (const [name, models, views] of [
    ['niche', [['fit-capsule-sleeping-niche', 0, 0]], [[[3.2, 2.5, 4.5], [0, 0.95, 0]], [[0.8, 1.55, 2.2], [0, 1.02, -0.3]]]],
    ['japantown-niche', [['fit-capsule-japantown-niche', 0, 0]], [[[3.2, 2.5, 4.5], [0, 0.95, 0]], [[-.8, 1.55, 2.2], [0, 1.02, -.3]]]],
    ['wardrobe', [['fit-capsule-wardrobe', 0, 0]], [[[2.0, 1.7, 3.0], [0, 1.03, 0]], [[-1.1, 1.4, 2.0], [0, 1.1, -.04]]]],
    ['h10-wardrobe', [['fit-capsule-h10-wardrobe', 0, 0]], [[[2.0, 1.7, 3.0], [0, 1.03, 0]], [[-1.1, 1.4, 2.0], [0, 1.1, -.04]]]],
    ['seating', [['fit-capsule-curved-sofa', 0, 0], ['fit-capsule-low-table', 0, 1.15]], [[[2.9, 2, 3.5], [0, 0.4, 0.5]], [[1.2, 1.15, 1.5], [0.35, 0.43, 0]]]],
    ['kitchen', [['fit-capsule-kitchen', -0.4, 0], ['fit-capsule-fridge', 1.3, 0]], [[[3.2, 2.3, 4], [0, 0.8, 0]], [[0.9, 1.6, 1.2], [0.35, 0.85, 0]]]],
    ['japantown-kitchen', [['fit-capsule-japantown-kitchen', 0, 0]], [[[3.2, 2.5, 4], [0, 1.1, 0]], [[-1.7, 1.6, 2.1], [0, 1.37, -.13]]]],
    ['basin', [['fit-capsule-basin', 0, 0]], [[[1.0, 1.35, 1.4], [0, 0.76, 0]], [[0.65, 0.7, 1.0], [0, 0.64, 0]]]],
    ['shower', [['fit-capsule-shower', 0, 0]], [[[2.2, 2.0, 3.1], [0, 1.05, 0]], [[0.55, 1.7, 1.6], [0, 1.05, -0.40]]]],
    ['sandra-lounge', [['fit-sandra-sofa', 0, 0], ['fit-sandra-low-table', 0, 1.15], ['fit-sandra-lattice-screen', -2.3, -.45]], [[[3.2, 2.2, 4.4], [-.45, .85, .2]], [[-2.6, 1.7, 3.8], [-.65, .8, .2]]]],
    ['sandra-storage', [['fit-sandra-wardrobe', -1.0, 0], ['fit-sandra-bookcase', 1.0, 0]], [[[3.1, 2.0, 4.8], [0, 1.0, 0]], [[-2.9, 1.65, 4.0], [0, 1.07, -.05]]]],
    ['sandra-desk', [['fit-sandra-writing-desk', 0, 0], ['fit-sandra-chair', 0, .85]], [[[2.4, 1.9, 3], [0, .60, .25]], [[-1.8, 1.5, 2.1], [0, .60, .2]]]],
  ]) {
    const url = new URL('http://localhost:5306/@fs/work/interior/out/proof/capsule-quality/proof.html');
    url.searchParams.set('models', JSON.stringify(models));
    await page.navigate(url.href);
    for (let i = 0; i < 80 && !await page.evaluate('window.ready'); i++) await sleep(250);
    if (!await page.evaluate('window.ready')) throw new Error(`proof viewer did not become ready: ${name}`);
    for (const [index, [at, aim]] of views.entries()) {
      await page.evaluate(`window.setView(${JSON.stringify(at)},${JSON.stringify(aim)})`);
      await page.screenshot(new URL(`${name}-${index + 1}.png`, output).pathname);
    }
  }
} finally {
  await browser.close();
}
