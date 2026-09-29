import { describe, expect, it } from 'vitest';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { fitResidentialComposition, type ResidentialPiece } from '../src/styles/capsule/composition.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import type { UvRect } from '../src/layout/uv.js';

const footprint = (piece: ResidentialPiece): UvRect => {
  const [width, depth] = piece.rotationDeg % 180 ? [piece.size[1], piece.size[0]] : piece.size;
  return { u: piece.at[0] - width! / 2, v: piece.at[1] - depth! / 2, lu: width!, lv: depth! };
};
const overlap = (a: UvRect, b: UvRect) => Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
  && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;

describe('coherent standard-residential living bays', () => {
  it('keeps the seating group in the broad part of a concave living room', () => {
    const room: PlanRoom = { id: 'living', kind: 'living', unit: '101', doors: [], rect: { u: 0, v: 0, lu: 8, lv: 8 },
      polygon: [[0,0],[8,0],[8,8],[6,8],[6,5],[0,5]] };
    const group = fitResidentialComposition(room, room.rect, 'h10', (reservation, pieces) =>
      roomCoversRect(room, reservation, .05) && pieces.every(piece => roomCoversRect(room, footprint(piece), .05)));
    expect(group).not.toBeNull();
    expect(group!.reservation.lu).toBeGreaterThanOrEqual(4.4);
    expect(group!.reservation.lv).toBeGreaterThanOrEqual(4.4);
    expect(group!.pieces.filter(piece => piece.kind === 'sofa')).toHaveLength(2);
    expect(group!.pieces.some(piece => piece.kind === 'low_table')).toBe(true);
    expect(group!.pieces.some(piece => piece.kind === 'display_screen')).toBe(true);
    for (const [i, piece] of group!.pieces.entries()) for (const other of group!.pieces.slice(i + 1))
      expect(overlap(footprint(piece), footprint(other)), `${piece.kind}/${other.kind}`).toBe(false);
  });

  it('fits the complete small bay at full dimensions without compressing furniture', () => {
    const room: PlanRoom = { id: 'living', kind: 'living', unit: '101', doors: [], rect: { u: 0, v: 0, lu: 3.0, lv: 4.5 } };
    const group = fitResidentialComposition(room, room.rect, 'damaged', () => true)!;
    expect(group).not.toBeNull();
    expect(group.pieces.find(piece => piece.kind === 'sofa')!.size).toEqual([1.8, .85, .8]);
    expect(group.pieces.find(piece => piece.kind === 'low_table')!.size).toEqual([.9, .5, .4]);
    expect(group.pieces.some(piece => piece.kind === 'display_screen')).toBe(true);
  });

  it('rejects an entry arm even when the room bounding rectangle is long', () => {
    const room: PlanRoom = { id: 'living', kind: 'living', unit: '101', doors: [], rect: { u: 0, v: 0, lu: 2.4, lv: 8 } };
    expect(fitResidentialComposition(room, room.rect, 'japantown', () => true)).toBeNull();
  });

  it('uses the exact remaining media-wall seat beside the published Japantown bedroom approach', () => {
    const room: PlanRoom = { id: 'f1-r28', kind: 'living', unit: 'f1-unit-8', doors: [],
      rect: { u: .5, v: 29.5, lu: 8.5, lv: 10 },
      polygon: [[.5,29.5],[2.5,29.5],[2.5,32.5],[9,32.5],[9,35.5],[5.076,35.5],[5.076,39.5],[.5,39.5]] };
    const blocked = [
      { u: 7.8, v: 33.25, lu: 2.4, lv: 1.5 }, { u: 6.25, v: 31.5, lu: 1.5, lv: 2 },
      { u: 3.55, v: 31.5, lu: 1.9, lv: 2 }, { u: 4.076, v: 35.75, lu: 2, lv: 1.5 },
      { u: 0, v: 29.5, lu: .67, lv: 10 }, { u: 0, v: 39.33, lu: 9, lv: .67 },
    ];
    const group = fitResidentialComposition(room, room.rect, 'japantown', (_, pieces) => {
      const screen = pieces.find(piece => piece.kind === 'display_screen')!;
      if (screen.rotationDeg !== 270 || Math.abs(screen.at[0] - 4.976) > 1e-5) return false;
      return pieces.every(piece => {
        const fp = footprint(piece), gap = piece.kind === 'display_screen' ? .05 : .15;
        return roomCoversRect(room, fp, .05) && !blocked.some(rect => overlap(rect,
          { u: fp.u - gap, v: fp.v - gap, lu: fp.lu + 2 * gap, lv: fp.lv + 2 * gap }));
      });
    });
    expect(group).not.toBeNull();
    expect(group!.pieces.find(piece => piece.kind === 'display_screen')!.at[1]).toBeCloseTo(38, 6);
  });
});
