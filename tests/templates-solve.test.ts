import { describe, expect, it } from 'vitest';
import { positionsOf, snapAxis, solveAxis, type AxisSpan } from '../src/layout/templates/solve.js';

const rigid = (ref: number, min = ref): AxisSpan => ({ ref, min, max: ref, weight: 0 });
const flexible = (ref: number, max = Infinity): AxisSpan => ({ ref, min: 0.8 * ref, max, weight: ref });

describe('template axis solver', () => {
  it('keeps every reference span when the target is exactly the reference', () => {
    expect(solveAxis([rigid(2.4), flexible(6), rigid(3)], 11.4)).toEqual([2.4, 6, 3]);
  });

  it('grows only the flexible spans and keeps rigid spans exact', () => {
    const out = solveAxis([rigid(2.4), flexible(6), rigid(3)], 14.4)!;
    expect(out[0]).toBe(2.4);
    expect(out[2]).toBe(3);
    expect(out[1]).toBeCloseTo(9, 9);
  });

  it('shares growth by weight and caps a bounded span at its max', () => {
    const out = solveAxis([{ ref: 4, min: 3, max: 5, weight: 2 }, flexible(6), rigid(2)], 16)!;
    expect(out[0]).toBeCloseTo(5, 9);
    expect(out[1]).toBeCloseTo(9, 9);
    expect(out[2]).toBe(2);
  });

  it('shrinks flexible spans first, then rigid spans toward their minimum', () => {
    const soft = solveAxis([rigid(2.4, 2.2), flexible(6), rigid(3, 2.6)], 10.4)!;
    expect(soft[0]).toBe(2.4);
    expect(soft[2]).toBe(3);
    expect(soft[1]).toBeCloseTo(5, 9);
    const hard = solveAxis([rigid(2.4, 2.2), flexible(6), rigid(3, 2.6)], 9.8)!;
    expect(hard[1]).toBeCloseTo(4.8, 9);
    expect(hard[0]).toBeLessThan(2.4);
    expect(hard[0]).toBeGreaterThanOrEqual(2.2);
    expect(hard.reduce((a, b) => a + b, 0)).toBeCloseTo(9.8, 9);
  });

  it('refuses a target shorter than every minimum', () => {
    expect(solveAxis([rigid(2.4, 2.2), flexible(6), rigid(3, 2.6)], 8)).toBeNull();
  });

  it('grows past a max only when nothing else can take the slack', () => {
    const out = solveAxis([rigid(2), { ref: 3, min: 2, max: 3.5, weight: 1 }], 7)!;
    expect(out[0]).toBe(2);
    expect(out[1]).toBeCloseTo(5, 9);
  });
});

describe('template line snapping', () => {
  it('pins the ends and prefers grid candidates within the span bounds', () => {
    const solved = positionsOf([2.4, 5.2, 3]);
    const out = snapAxis(solved, [
      [{ at: 0, penalty: 0 }],
      [{ at: 2.4, penalty: 0.003 }, { at: 2.5, penalty: 0 }, { at: 2, penalty: 0 }],
      [{ at: 7.6, penalty: 0.003 }, { at: 7.5, penalty: 0 }, { at: 8, penalty: 0 }],
      [{ at: 10.6, penalty: 0 }],
    ], [[2.4, 2.4], [4, Infinity], [3, 3]]);
    expect(out).toEqual([0, 2.4, 7.6, 10.6]);
  });

  it('moves a facade partition to its nearest legal seat', () => {
    const out = snapAxis([0, 4.2, 9], [
      [{ at: 0, penalty: 0 }], [{ at: 3.9, penalty: 0 }, { at: 4.8, penalty: 0 }], [{ at: 9, penalty: 0 }],
    ], [[3, 6], [3, 8]]);
    expect(out).toEqual([0, 3.9, 9]);
  });

  it('refuses when no legal seat keeps the spans within bounds', () => {
    expect(snapAxis([0, 4.2, 9], [
      [{ at: 0, penalty: 0 }], [{ at: 1, penalty: 0 }], [{ at: 9, penalty: 0 }],
    ], [[3, 6], [3, 8]])).toBeNull();
  });
});
