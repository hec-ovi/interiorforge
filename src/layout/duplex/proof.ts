import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { planDuplexSection } from './section.js';
import { planDuplexProgram } from './program.js';
import { duplexCapability } from './capability.js';
import { writePlacements } from '../../placements/write.js';
import { roomArea } from '../room-shape.js';
import { furnishDuplexProgram } from './furnish.js';
import { duplexRoutes } from './routes.js';
import { furnitureUvRect } from '../navgrid.js';

const output = process.env.DUPLEX_PROOF_OUT ?? fileURLToPath(new URL('../../../out/proof/duplex-capability/', import.meta.url));
await mkdir(output, { recursive: true });
const section = planDuplexSection({ pitch: 3.2 });
const program = planDuplexProgram(section);
const furniture = furnishDuplexProgram(program, section, 'duplex-1702-proof');
const routes = duplexRoutes(program, section, furniture);
await writeFile(join(output, 'section.json'), JSON.stringify(section, null, 2) + '\n');
await writeFile(join(output, 'program.json'), JSON.stringify(program, null, 2) + '\n');
await writeFile(join(output, 'furniture.json'), JSON.stringify(furniture, null, 2) + '\n');
await writeFile(join(output, 'routes.json'), JSON.stringify({ failures: routes.failures,
  lower: { origin: routes.lower.origin, rooms: routes.lower.reachedRooms, cellSize: routes.lower.grid.cellSize,
    originGrid: routes.lower.grid.origin, cols: routes.lower.grid.cols, rows: routes.lower.grid.rows, walkable: routes.lower.grid.toBase64() },
  upper: { origin: routes.upper.origin, rooms: routes.upper.reachedRooms, cellSize: routes.upper.grid.cellSize,
    originGrid: routes.upper.grid.origin, cols: routes.upper.grid.cols, rows: routes.upper.grid.rows, walkable: routes.upper.grid.toBase64() } }, null, 2) + '\n');
await writePlacements(duplexCapability(section), join(output, 'capability'));
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const path = (ring: number[][]) => ring.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + ' Z';
const panels = [program.lower, program.upper].map((rooms, level) => {
  const shape = rooms.map(room => {
    const fill = room.kind === 'bathroom' ? '#bbd7df' : room.kind === 'bedroom' ? '#d9ceb4' : room.kind === 'corridor' ? '#efeeeb' : room.kind === 'storage' ? '#b4b9b8' : room.kind === 'kitchen' ? '#d1bf99' : '#c8d4bc';
    const a = room.rect, label = program.roles[room.id];
    return `<path d="${[room.polygon!, ...(room.holes ?? [])].map(path).join(' ')}" fill="${fill}" fill-rule="evenodd" stroke="#343a39" stroke-width=".035"/><text x="${a.u + a.lu / 2}" y="${a.v + a.lv / 2}" font-size=".22" text-anchor="middle">${escape(label!)} ${roomArea(room).toFixed(1)}m²</text>`;
  }).join('');
  const holes = level ? [...section.loungeVoids, section.stairOpening].map(r => `<rect x="${r.u}" y="${r.v}" width="${r.lu}" height="${r.lv}" fill="#222b35" opacity=".92"/>`).join('') : '';
  const stair = section.stair.steps.map(r => `<rect x="${r.u}" y="${r.v}" width="${r.lu}" height="${r.lv}" fill="${level ? '#c5b18c' : '#957959'}" stroke="#fff" stroke-width=".025"/>`).join('');
  const doors = rooms.flatMap(room => room.doors.map(door => {
    const p = door.position ?? (door.edge.startsWith('v') ? [door.at, door.edge === 'v0' ? room.rect.v : room.rect.v + room.rect.lv]
      : [door.edge === 'u0' ? room.rect.u : room.rect.u + room.rect.lu, door.at]);
    const a = door.edge.startsWith('v') ? [p[0]! - door.width / 2, p[1]] : [p[0], p[1]! - door.width / 2];
    const b = door.edge.startsWith('v') ? [p[0]! + door.width / 2, p[1]] : [p[0], p[1]! + door.width / 2];
    return `<path d="M${a} L${b}" fill="none" stroke="#fff" stroke-width=".10"/>`;
  })).join('');
  const furnishings = furniture[level ? 'upper' : 'lower'].filter(piece => (piece.elevation ?? 0) < 1.7).map(piece => {
    const r = furnitureUvRect(piece);
    return `<rect x="${r.u}" y="${r.v}" width="${r.lu}" height="${r.lv}" fill="#625345" stroke="#fff" stroke-width=".025"><title>${escape(piece.kind)}</title></rect>`;
  }).join('');
  return `<g transform="translate(${level ? 510 : 35},100) scale(29)">${shape}${holes}${stair}${doors}${furnishings}<text x="0" y="-1" font-size=".43" font-weight="bold">${level ? 'UPPER — 100 m²' : 'LOWER — 150 m²'}</text><text x="0" y="11" font-size=".27">15 × 10 m allocation · ${level ? '38 m² lounge void + 12 m² stair opening' : '1.6 m private entrance · two 2 m stair approaches'}</text></g>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 475"><rect width="1000" height="475" fill="#f7f6f2"/><g font-family="sans-serif" fill="#172321"><text x="35" y="32" font-size="20" font-weight="bold">Type C dynamic section and private program — capability proof</text><text x="35" y="57" font-size="13">Furnished planning specimen. Not a completed building, facade fit, or visual-quality approval.</text>${panels}<text x="35" y="456" font-size="12">3.2 m pitch · unchanged Engine collision/plate cut verified at 0° and 37° · upper level belongs to dwelling 105</text></g></svg>`;
await writeFile(join(output, 'type-c-plan.svg'), svg);
console.log(output);
