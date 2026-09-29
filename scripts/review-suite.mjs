#!/usr/bin/env node
/** Interior-owned orchestration of native, single-building review sets.
 * Run inside the Engine container with --build; without it this only lists plans.
 * Every attempt gets a new world directory. A generated world is never automatically
 * marked movement-tested, visually approved or accepted in review. */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const interior = fileURLToPath(new URL('../', import.meta.url));
const workspace = dirname(interior), engine = join(workspace, 'engine');
const options = { catalog: join(interior, 'fixtures/reference-review-sets.json'), out: 'reference-suite-01',
  only: '', limit: Infinity, representatives: false, build: false, resume: false };
const argv = process.argv.slice(2);
while (argv.length) {
  const flag = argv.shift();
  if (['--build', '--resume', '--representatives'].includes(flag)) { options[flag.slice(2)] = true; continue; }
  const key = flag?.slice(2);
  if (!['catalog', 'out', 'only', 'limit'].includes(key) || !argv.length) throw new Error(`Unknown/incomplete argument ${flag}`);
  const value = argv.shift(); options[key] = key === 'limit' ? Number(value) : value;
}
if (!/^[a-z0-9][a-z0-9._-]*$/.test(options.out)) throw new Error('out must be one safe folder name');
if (!(options.limit > 0 && (Number.isInteger(options.limit) || options.limit === Infinity))) throw new Error('limit must be a positive integer');
const catalog = JSON.parse(await readFile(resolve(options.catalog), 'utf8'));
const requested = new Set(options.only.split(',').filter(Boolean));
for (const id of requested) if (!catalog.specimens.some(spec => spec.id === id)) throw new Error(`Unknown specimen ${id}`);
let selected = catalog.specimens.filter(spec => spec.eligibleForBatch && spec.execution === 'native-review'
  && (!requested.size || requested.has(spec.id)));
if (requested.size && selected.length !== requested.size) throw new Error('Selection contains a specimen that is not eligible for a native review');
if (options.representatives) {
  const seen = new Set();
  selected = selected.filter(spec => {
    const identity = `${spec.architecture}:${spec.interiorStyle ?? spec.interior.referenceIdentity}`;
    if (seen.has(identity)) return false; seen.add(identity); return true;
  });
}
selected = selected.slice(0, options.limit);
if (!selected.length) throw new Error('No eligible specimens selected');
for (const spec of selected) if (!/^[a-z0-9][a-z0-9._-]*$/.test(spec.id)) throw new Error(`Unsafe specimen id ${spec.id}`);
if (!options.build) {
  console.log(JSON.stringify({ mode: 'plan', count: selected.length, specimens: selected.map(spec => ({
    id: spec.id, name: spec.name, architecture: spec.architecture, style: spec.interiorStyle ?? spec.interior.referenceIdentity,
    size: [spec.width, spec.depth, spec.floors], blueprint: spec.blueprint,
  })) }, null, 2));
  process.exit(0);
}

const directory = join(engine, 'out/reviews', options.out), reportPath = join(directory, 'suite.json');
let report;
if (options.resume) {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.id !== options.out || report.format !== 'urbe-reference-suite-v1') throw new Error('Existing directory is not this review suite');
} else {
  await mkdir(directory, { recursive: false });
  report = { format: 'urbe-reference-suite-v1', id: options.out, created: new Date().toISOString(),
    catalog: resolve(options.catalog), entries: [] };
}
await mkdir(join(directory, 'logs'), { recursive: true });
await publish();
let failed = 0;
for (const spec of selected) {
  let entry = report.entries.find(item => item.id === spec.id);
  if (!entry) {
    entry = { id: spec.id, name: spec.name, architecture: spec.architecture, tier: spec.tier, type: spec.type,
      interiorStyle: spec.interiorStyle, referenceIdentity: spec.interior.referenceIdentity,
      referenceGalleryIds: spec.referenceGalleryIds, referenceImages: spec.referenceImages,
      dimensions: [spec.width, spec.depth, spec.floors], attempts: [] };
    report.entries.push(entry);
  }
  if (entry.attempts.at(-1)?.status === 'generated') { console.log(`Preserved ${spec.id}`); continue; }
  const number = entry.attempts.length + 1, world = `${options.out}-${spec.id}-r${number}`;
  const log = `logs/${spec.id}-r${number}.log`;
  const attempt = { number, world, log, started: new Date().toISOString(), status: 'generating',
    sourceBefore: await sourceFingerprint(), movement: 'not-checked', visualComparison: 'not-checked', userApproval: false };
  entry.attempts.push(attempt); await publish();
  console.log(`Generating ${spec.id} → ${world}`);
  const args = ['--architecture', spec.architecture, '--tier', spec.tier, '--type', spec.type,
    '--width', String(spec.width), '--depth', String(spec.depth), '--floors', String(spec.floors),
    '--seed', spec.exteriorRequest.seed, '--name', spec.name, '--blueprint', spec.blueprint,
    '--entrance', 'south', '--exposure', '0.04', '--out', world];
  if (spec.interiorStyle) args.push('--interiorStyle', spec.interiorStyle);
  if (spec.minimumClearHeight !== undefined) args.push('--clearHeight', String(spec.minimumClearHeight));
  if (spec.preferredFloorHeight !== undefined) args.push('--floorHeight', String(spec.preferredFloorHeight));
  if (spec.duplexFloors?.length) args.push('--duplexFloors', spec.duplexFloors.join(','));
  try {
    const exitCode = await execute(args, join(directory, log));
    if (exitCode !== 0) throw new Error(`Producer exited ${exitCode}; see ${log}`);
    const review = JSON.parse(await readFile(join(engine, 'out/reviews', world, 'review.json'), 'utf8'));
    if (review.buildings.length !== 1 || review.buildings[0].actualArchitecture !== spec.expectedArchitecture)
      throw new Error('Published architecture does not match this specimen');
    Object.assign(attempt, { status: 'generated', playUrl: review.playUrl, building: review.buildings[0] });
    console.log(`Generated ${spec.id}; visual and movement review pending`);
  } catch (error) {
    failed++; Object.assign(attempt, { status: 'generation-failed', error: error.message });
    console.log(`Failed ${spec.id}: ${error.message}`);
  }
  attempt.finished = new Date().toISOString();
  attempt.sourceAfter = await sourceFingerprint();
  attempt.sourceChangedDuringBuild = attempt.sourceBefore !== attempt.sourceAfter;
  await publish();
}
console.log(`Suite report: http://localhost:5306/out/reviews/${options.out}/index.html`);
process.exitCode = failed ? 1 : 0;

function execute(args, logfile) {
  return new Promise((accept, reject) => {
    const output = createWriteStream(logfile, { flags: 'wx' });
    const child = spawn(process.execPath, ['--import', 'tsx', join(interior, 'scripts/review-building.mjs'), ...args],
      { cwd: engine, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    child.on('error', error => { output.end(); reject(error); });
    child.on('close', code => { output.end(() => accept(code ?? 1)); });
  });
}

async function sourceFingerprint() {
  const hash = createHash('sha256');
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'proof' || entry.name === 'models') continue;
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.(ts|js|json)$/.test(entry.name) && !/(proof|capture)/.test(entry.name)) {
        hash.update(file.slice(workspace.length)); hash.update(await readFile(file));
      }
    }
  }
  for (const box of ['interior', 'exterior']) { await visit(join(workspace, box, 'src')); await visit(join(workspace, box, 'schemas')); }
  return hash.digest('hex');
}

async function publish() {
  report.updated = new Date().toISOString();
  await writeFile(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  await rename(`${reportPath}.tmp`, reportPath);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cards = report.entries.map(entry => {
    const result = entry.attempts.at(-1);
    return `<article><h2>${escape(entry.name)}</h2><p>${escape(entry.referenceIdentity)} · ${escape(entry.tier)} · ${escape(entry.dimensions.join(' × '))}</p>
      <p>${result?.playUrl ? `<a href="${escape(result.playUrl)}">Open building</a>` : escape(result?.status ?? 'Pending')}</p>
      <p class="status">${result?.status === 'generated' ? 'Generated · visual and walking review pending' : escape(result?.status ?? 'Pending')}</p>
      ${result?.log ? `<details><summary>Generation record</summary><a href="${escape(result.log)}">Log</a>${result.error ? `<p>${escape(result.error)}</p>` : ''}</details>` : ''}</article>`;
  }).join('\n');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Building reference studies</title>
    <style>body{font:16px/1.5 system-ui;background:#121719;color:#e8e4da;margin:0;padding:40px;max-width:1400px}h1{font-size:2rem}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px}article{background:#1e272b;border:1px solid #3b494d;padding:24px;border-radius:8px}h2{font-size:1.25rem}a{color:#b1d9d7}.status{color:#c3bcae;font-size:.9rem}details{font-size:.85rem}</style>
    <h1>Building reference studies</h1><p>Separate buildings generated from the same flexible system. These are review candidates; generation alone does not establish reference quality.</p><main>${cards}</main><p><a href="suite.json">Complete review record</a></p></html>`;
  await writeFile(join(directory, 'index.html'), html);
}
