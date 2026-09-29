import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { Browser, sleep } from '../../../scripts/review-browser.mjs';

const directory = resolve(process.argv[2] ?? 'engine/out/reviews/loft-1702-01');
const out = join(directory, `duplex-captures-${Date.now()}`);
if (existsSync(out)) throw new Error('Capture output already exists');
await mkdir(out, { recursive: true });
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const review = await json(join(directory, 'review.json')), parcel = review.buildings[0].parcelId;
const manifest = await json(join(directory, parcel, 'interior/building.json'));
const layouts = Object.fromEntries(await Promise.all(Object.entries(manifest.layouts).map(async ([id, path]) => [id,
  await json(join(directory, parcel, 'interior', path))])));
const lowerRef = manifest.floors.find(ref => layouts[ref.layout].floor.duplexes?.some(slice => slice.level === 'lower'));
if (!lowerRef) throw new Error('No actual duplex in this published building');
const lower = layouts[lowerRef.layout], slice = lower.floor.duplexes.find(slice => slice.level === 'lower');
const upperRef = manifest.floors.find(ref => ref.index === slice.upperFloor), upper = layouts[upperRef.layout];
const angle = slice.frame.angleDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
const world = ([x, z]) => [slice.frame.origin[0] + x * c - z * s, slice.frame.origin[1] + x * s + z * c];
const xyz = (p, y) => ({ x: p[0], y, z: p[1] });
const report = { scope: 'Actual generated duplex visual comparison. Camera placement is explicit, not a gameplay traversal claim.',
  source: directory, unit: slice.unit, area: slice.area, images: [], exceptions: [], console: [], failedRequests: [] };
const browser = new Browser();
process.once('exit', () => browser.kill());
try {
  await browser.started;
  const page = await browser.open();
  page.on('Fetch.requestPaused', async event => {
    const allowed = ['GET', 'HEAD'].includes(event.request.method);
    await page.send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: event.requestId,
      ...allowed ? {} : { errorReason: 'BlockedByClient' } });
  });
  page.on('Runtime.exceptionThrown', event => report.exceptions.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text));
  page.on('Runtime.consoleAPICalled', event => report.console.push({ type: event.type, text: event.args.map(arg => arg.value ?? arg.description).join(' ') }));
  page.on('Network.responseReceived', event => { if (event.response.status >= 400 && !event.response.url.endsWith('/favicon.ico')) report.failedRequests.push({ url: event.response.url, status: event.response.status }); });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  const url = new URL(review.playUrl); url.searchParams.set('automation', '');
  await page.navigate(url.href);
  const evaluate = code => page.evaluate(`(async()=>{const game=window.urbe;${code}})()`);
  await until(async () => page.evaluate(`Boolean(window.urbe?.automation && window.urbe?.stats?.drawCalls && document.querySelector('.hud-loading')?.hidden)`), 180000);
  await evaluate(`if(!game.view.pause.element.hidden)game.view.pause.buttons.get('resume').click();game.input.onLockChange(game.input.locked=true);`);
  const at = async (name, ref, position, target, room) => {
    await evaluate(`game.input.clear();game.body.beginCarry(${JSON.stringify(xyz(position, ref.elevation + .025))});game.stream.requestFloor(${JSON.stringify(parcel)},${ref.index});`);
    await until(async () => {
      const state = await evaluate(`return {shown:game.stream.floorShown(${JSON.stringify(parcel)},${ref.index}),
        bands:game.stream.live.get(${JSON.stringify(parcel)})?.bands.map(b=>({floor:b.floor,state:b.state,live:b.live})),pause:game.pauseState.paused,feet:game.body.feet.toArray()};`);
      if (state.bands?.some(band => band.floor === ref.index && band.state === 'failed')) throw new Error(`Floor failed: ${JSON.stringify({state,console:report.console})}`);
      return state.shown;
    }, 60000);
    await evaluate(`game.body.endCarry(${JSON.stringify(xyz(position, ref.elevation + .025))});game.placePlayer(${JSON.stringify(xyz(position, ref.elevation + .025))},${JSON.stringify(target)});`);
    await sleep(1300);
    await page.screenshot(join(out, `${name}.png`));
    report.images.push({ name, floor: ref.index, room, position, target, footing: await evaluate('return game.automation.footing();') });
    console.log(`Captured ${name}`);
  };
  const lowerLiving = lower.floor.rooms.find(room => room.id === `${slice.unit}-lower-living`);
  const upperGallery = upper.floor.rooms.find(room => room.id === `${slice.unit}-upper-gallery`);
  const lounge = slice.loungeVoids[0], centre = lounge.reduce((p, q) => [p[0] + q[0] / lounge.length, p[1] + q[1] / lounge.length], [0, 0]);
  await at('01-private-arrival-and-stair', lowerRef, nearest(lower, lowerLiving, world([slice.width - 7.5, 1.1])),
    xyz(world([slice.width - 7.5, 6]), lowerRef.elevation + slice.pitch / 2 + .8), lowerLiving.id);
  await at('02-double-height-lounge', lowerRef, nearest(lower, lowerLiving, world([slice.width - 5, slice.depth - 2.2])),
    xyz(centre, lowerRef.elevation + slice.pitch + .8), lowerLiving.id);
  await at('03-lounge-and-furnishings', lowerRef, nearest(lower, lowerLiving, world([slice.width - 6, slice.depth - 4])),
    xyz(centre, lowerRef.elevation + 1), lowerLiving.id);
  await at('04-upper-arrival-overlook', upperRef, nearest(upper, upperGallery, slice.upperEntry),
    xyz(centre, lowerRef.elevation + 1.4), upperGallery.id);
  await at('05-gallery-reverse', upperRef, nearest(upper, upperGallery, world([slice.width - 5, slice.depth - 2])),
    xyz(slice.upperEntry, upperRef.elevation + 1.5), upperGallery.id);
  for (const [name, ref, layout, suffix, focus] of [
    ['06-primary-bedroom', upperRef, upper, 'upper-primary', 'bed_double'],
    ['07-twin-basin-bathroom', upperRef, upper, 'upper-bathroom', 'sink'],
    ['08-kitchen', lowerRef, lower, 'lower-kitchen', 'kitchen_block'],
    ['09-dressing-room', upperRef, upper, 'upper-dressing', 'wardrobe'],
  ]) {
    const room = layout.floor.rooms.find(room => room.id === `${slice.unit}-${suffix}`);
    const fixture = layout.floor.furniture.find(piece => piece.room === room.id && piece.kind === focus);
    const door = room.doors[0];
    const position = nearest(layout, room, door?.position ?? fixture.position);
    await at(name, ref, position, xyz(fixture.position, ref.elevation + (focus === 'sink' ? .95 : .8)), room.id);
  }
  report.stats = await evaluate('return {fps:game.stats.fps,drawCalls:game.stats.drawCalls,triangles:game.stats.triangles};');
} catch (error) {
  report.error = error.stack;
  await browser.page?.screenshot(join(out, 'failed.png')).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(out);
}

async function until(test, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await test()) return; await sleep(250); }
  throw new Error(`Timed out after ${timeout} ms`);
}
function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function nearest(layout, room, desired) {
  const nav = layout.npc.nav.floors.find(floor => floor.floor === layout.sourceFloor);
  const bits = Buffer.from(nav.walkable, 'base64'), cell = layout.npc.nav.cellSize;
  let best = null, score = Infinity;
  for (let row = 0; row < nav.rows; row++) for (let col = 0; col < nav.cols; col++) {
    const index = row * nav.cols + col;
    if (!(bits[index >> 3] & (1 << (index & 7)))) continue;
    const p = [nav.origin[0] + (col + .5) * cell, nav.origin[1] + (row + .5) * cell];
    if (!contains(p, room.polygon) || (room.holes ?? []).some(hole => contains(p, hole))) continue;
    const next = Math.hypot(p[0] - desired[0], p[1] - desired[1]);
    if (next < score) { score = next; best = p; }
  }
  if (!best) throw new Error(`No published standing point in ${room.id}`);
  return best;
}
