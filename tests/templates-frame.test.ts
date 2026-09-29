import { describe, expect, it } from 'vitest';
import type { EdgeName } from '../src/layout/plan-types.js';
import { edgeToUv, localFrame, rectToUv, rotationToUv, toLocal, toUv } from '../src/layout/templates/frame.js';

const rect = { u: 10.25, v: -4.5, lu: 12, lv: 9 };

describe('template local frame', () => {
  it('puts local v = 0 on the entry edge and grows v into the target at every quarter turn', () => {
    const expected: Record<EdgeName, { origin: [number, number]; inward: EdgeName; width: number }> = {
      v0: { origin: [rect.u, rect.v], inward: 'v1', width: rect.lu },
      v1: { origin: [rect.u + rect.lu, rect.v + rect.lv], inward: 'v0', width: rect.lu },
      u0: { origin: [rect.u, rect.v + rect.lv], inward: 'u1', width: rect.lv },
      u1: { origin: [rect.u + rect.lu, rect.v], inward: 'u0', width: rect.lv },
    };
    for (const edge of ['v0', 'v1', 'u0', 'u1'] as EdgeName[]) {
      const frame = localFrame(rect, edge, false);
      expect(frame.width).toBe(expected[edge].width);
      expect(toUv(frame, [0, 0])).toEqual(expected[edge].origin);
      expect(edgeToUv(frame, 'v0')).toBe(edge);
      expect(edgeToUv(frame, 'v1')).toBe(expected[edge].inward);
      // round trip and handedness: local u0 and u1 are the two side edges
      const p: [number, number] = [2.5, 3.25];
      const back = toLocal(frame, toUv(frame, p));
      expect(back[0]).toBeCloseTo(p[0], 9);
      expect(back[1]).toBeCloseTo(p[1], 9);
      expect(new Set([edgeToUv(frame, 'u0'), edgeToUv(frame, 'u1'), edge, expected[edge].inward]).size).toBe(4);
    }
  });

  it('mirrors along the entry wall without moving the entry edge', () => {
    for (const edge of ['v0', 'v1', 'u0', 'u1'] as EdgeName[]) {
      const plain = localFrame(rect, edge, false), mirrored = localFrame(rect, edge, true);
      expect(edgeToUv(mirrored, 'v0')).toBe(edge);
      expect(edgeToUv(mirrored, 'u0')).toBe(edgeToUv(plain, 'u1'));
      expect(toUv(mirrored, [0, 1])).toEqual(toUv(plain, [plain.width, 1]));
      // a piece facing +u locally faces the other way once mirrored
      expect(rotationToUv(mirrored, 90)).toBe(rotationToUv(plain, 270));
      expect(rotationToUv(mirrored, 0)).toBe(rotationToUv(plain, 0));
    }
  });

  it('snaps rectangles that meet the target bounds exactly onto them', () => {
    for (const edge of ['v0', 'v1', 'u0', 'u1'] as EdgeName[]) for (const mirrored of [false, true]) {
      const frame = localFrame(rect, edge, mirrored);
      const whole = rectToUv(frame, 0, frame.width, 0, frame.depth);
      expect(whole).toEqual(rect);
      const part = rectToUv(frame, 0, 3.3, 1.4, frame.depth);
      expect(part.lu * part.lv).toBeCloseTo(3.3 * (frame.depth - 1.4), 6);
      const edges = [part.u === rect.u, part.v === rect.v, part.u + part.lu === rect.u + rect.lu, part.v + part.lv === rect.v + rect.lv];
      expect(edges.filter(Boolean).length).toBe(2);
    }
  });

  it('turns a piece backed onto the entry wall to face into the space', () => {
    expect(rotationToUv(localFrame(rect, 'v0', false), 0)).toBe(0);
    expect(rotationToUv(localFrame(rect, 'v1', false), 0)).toBe(180);
    expect(rotationToUv(localFrame(rect, 'u0', false), 0)).toBe(90);
    expect(rotationToUv(localFrame(rect, 'u1', false), 0)).toBe(270);
  });
});
