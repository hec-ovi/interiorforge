import { InteriorError } from '../../core/errors.js';
import { createRng } from '../../core/rng.js';
import { furnish } from '../furnish.js';
import type { PlanFurniture, PlanRoom } from '../plan-types.js';
import { idGen } from '../rooms.js';
import { uvRectCorners } from '../uv.js';
import type { UvRect } from '../uv.js';
import { fitLuxuryComposition } from '../../styles/luxury/composition.js';
import { roomCoversRect } from '../room-shape.js';
import { furnitureUvRect } from '../navgrid.js';
import type { DuplexProgram } from './program.js';
import type { DuplexSection } from './section.js';
import { duplexRoutes } from './routes.js';

export interface DuplexFurniture {
  lower: PlanFurniture[];
  upper: PlanFurniture[];
  carpets: { lower: { room: string; rect: UvRect }[]; upper: { room: string; rect: UvRect }[] };
  attempts: number;
}

/** Furnish whole private levels atomically. A failed complete arrangement may
 * try another deterministic order; it never returns a home missing essentials. */
export function furnishDuplexProgram(program: DuplexProgram, section: DuplexSection, seed: string | number): DuplexFurniture {
  const polygon = uvRectCorners({ u: 0, v: 0, lu: section.width, lv: section.depth });
  const bounds = { outline: polygon, inner: polygon, facadeDepth: 0 };
  let failures: string[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const levels = {} as Pick<DuplexFurniture, 'lower' | 'upper'>;
    const carpets: DuplexFurniture['carpets'] = { lower: [], upper: [] };
    for (const level of ['lower', 'upper'] as const) {
      const rooms = program[level];
      const pieces = furnish(rooms, 'apartment', createRng(seed, 'duplex', level, attempt), idGen(level === 'lower' ? 1 : 2),
        bounds, program.reservations[level], 'high_rich', carpets[level], 'luxury', [], 'apartment-1702',
        // Each level is one half of a home; missingEssentials checks the pair below.
        Infinity, false);
      const living = rooms.find(room => program.roles[room.id] === 'living');
      if (living) {
        // The paired section has a deliberate four-metre-deep lounge beside
        // the stair. Search its complete polygon once; the general fitter's
        // outer bounding-box inset would count that boundary clearance twice.
        for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i]!.room === living.id) pieces.splice(i, 1);
        carpets[level] = carpets[level].filter(carpet => carpet.room !== living.id);
        const occupied = [...program.reservations[level]];
        for (const composition of ['living_compact', 'dining'] as const) {
          const group = fitLuxuryComposition(composition, living, living.rect, (zone, members) =>
            roomCoversRect(living, zone) && !occupied.some(other => overlaps(zone, other))
            && members.every(member => roomCoversRect(living, furnitureUvRect({ ...member, room: living.id, id: '' }), .035)));
          if (group) {
            occupied.push(group.reservation);
            group.pieces.forEach((piece, i) => pieces.push({ ...piece, id: `${living.id}-${composition}-${i}`, room: living.id }));
            if (group.carpet) carpets[level].push({ room: living.id, rect: group.carpet });
          }
        }
      }
      // Dressing and linen are occupied joinery, not generic service shelving
      // and freight crates. Keep native wardrobe dimensions and clear fronts.
      for (const room of rooms.filter(room => ['dressing', 'linen'].includes(program.roles[room.id]!))) {
        for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i]!.room === room.id) pieces.splice(i, 1);
        if (program.roles[room.id] === 'linen') {
          pieces.push(wardrobe(room, `${room.id}-cupboard`, [room.rect.u + room.rect.lu - .4, room.rect.v + room.rect.lv / 2], 270));
        } else {
          pieces.push(wardrobe(room, `${room.id}-wardrobe-a`, [room.rect.u + room.rect.lu - 1.4, room.rect.v + room.rect.lv - .4], 180));
          pieces.push(wardrobe(room, `${room.id}-wardrobe-b`, [room.rect.u + room.rect.lu - .4, room.rect.v + 1.1], 270));
        }
      }
      // An optional island must not consume the working aisle of the complete
      // kitchen block. Keep the primary worktop and appliance fronts usable.
      for (const room of rooms.filter(room => program.roles[room.id] === 'kitchen')) {
        const primary = pieces.filter(piece => piece.room === room.id && ['kitchen_block', 'fridge'].includes(piece.kind));
        const approaches = primary.map(piece => {
          const footprint = furnitureUvRect(piece), dir = piece.rotationDeg;
          return dir === 0 ? { u: footprint.u, v: footprint.v + footprint.lv, lu: footprint.lu, lv: 1.2 }
            : dir === 180 ? { u: footprint.u, v: footprint.v - 1.2, lu: footprint.lu, lv: 1.2 }
            : dir === 90 ? { u: footprint.u + footprint.lu, v: footprint.v, lu: 1.2, lv: footprint.lv }
            : { u: footprint.u - 1.2, v: footprint.v, lu: 1.2, lv: footprint.lv };
        });
        for (let i = pieces.length - 1; i >= 0; i--) {
          const piece = pieces[i]!;
          if (piece.room === room.id && piece.kind === 'counter' && approaches.some(zone => overlaps(zone, furnitureUvRect(piece)))) pieces.splice(i, 1);
        }
      }
      pieces.forEach((piece, index) => { piece.id = `${program.unit}-${level}-furniture-${index}`; });
      levels[level] = pieces;
    }
    failures = missingEssentials(program, levels);
    if (!failures.length) {
      const complete = { ...levels, carpets, attempts: attempt + 1 };
      failures = duplexRoutes(program, section, complete).failures;
      if (!failures.length) return complete;
    }
  }
  throw new InteriorError('E_FLOOR_TOO_SMALL', `duplex cannot fit its complete occupied program: ${failures.join('; ')}`);
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return a.u < b.u + b.lu - 1e-6 && a.u + a.lu > b.u + 1e-6
    && a.v < b.v + b.lv - 1e-6 && a.v + a.lv > b.v + 1e-6;
}

function wardrobe(room: PlanRoom, id: string, at: [number, number], rotationDeg: PlanFurniture['rotationDeg']): PlanFurniture {
  return { id, kind: 'wardrobe', room: room.id, at, rotationDeg, size: [1.6, .65, 2] };
}

function missingEssentials(program: DuplexProgram, levels: Pick<DuplexFurniture, 'lower' | 'upper'>): string[] {
  const failures: string[] = [];
  for (const level of ['lower', 'upper'] as const) for (const room of program[level]) {
    const present = new Set(levels[level].filter(piece => piece.room === room.id).map(piece => piece.kind));
    const role = program.roles[room.id];
    const required: PlanFurniture['kind'][] = role === 'guest' || role === 'primary' ? ['bed_double', 'wardrobe']
      : role === 'bathroom' ? ['sink', 'toilet', 'shower'] : role === 'kitchen' ? ['kitchen_block', 'fridge']
      : role === 'dressing' || role === 'linen' ? ['wardrobe'] : role === 'utility' ? ['shelf']
      : role === 'study' ? ['desk', 'office_chair'] : role === 'living' ? ['sofa', 'low_table', 'dining_table', 'chair', 'display_screen'] : [];
    for (const kind of required) if (!present.has(kind)) failures.push(`${room.id}: ${kind}`);
  }
  return failures;
}
