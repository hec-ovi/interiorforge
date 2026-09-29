/** One-dimensional template solver: exact reference spans when the target allows them,
 *  weighted growth and shrink within authored bounds otherwise, then a snap of every
 *  interior line onto its legal candidates (grid, facade seat or exact value). */

export interface AxisSpan {
  ref: number;
  min: number;
  /** Infinity for an unbounded (remainder) span */
  max: number;
  weight: number;
}

const EPS = 1e-6;

/** Span lengths summing to `length`, or null when even every minimum is too long.
 *  Growth: weighted spans share the slack up to their max, anything left goes to the
 *  unbounded spans, then (last resort) to the weighted spans past their max.
 *  Shrink: weighted spans first (toward their min), rigid spans only after that. */
export function solveAxis(spans: readonly AxisSpan[], length: number): number[] | null {
  const total = spans.reduce((sum, span) => sum + span.ref, 0);
  const out = spans.map(span => span.ref);
  let slack = length - total;
  if (Math.abs(slack) < EPS) return out;
  if (slack > 0) {
    slack = waterFill(out, spans.map((span, i) => span.weight > 0 ? i : -1).filter(i => i >= 0), spans,
      slack, i => spans[i]!.max, i => spans[i]!.weight);
    if (slack > EPS) {
      const flexible = spans.map((span, i) => span.weight > 0 ? i : -1).filter(i => i >= 0);
      const pool = flexible.length ? flexible : spans.map((_, i) => i);
      const weights = pool.map(i => flexible.length ? spans[i]!.weight : Math.max(spans[i]!.ref, EPS));
      const sum = weights.reduce((a, b) => a + b, 0);
      pool.forEach((i, k) => { out[i]! += slack * weights[k]! / sum; });
    }
    return out;
  }
  let need = -slack;
  need = shrink(out, spans, need, span => span.weight > 0, span => span.weight);
  if (need > EPS) need = shrink(out, spans, need, span => span.weight === 0, span => Math.max(span.ref - span.min, EPS));
  return need > EPS ? null : out;
}

/** Shares `amount` among `pool` by weight, each capped at `cap(i)`; returns what is left. */
function waterFill(out: number[], pool: number[], _spans: readonly AxisSpan[], amount: number,
  cap: (i: number) => number, weight: (i: number) => number): number {
  let active = pool.filter(i => out[i]! < cap(i) - EPS);
  while (amount > EPS && active.length) {
    const sum = active.reduce((s, i) => s + weight(i), 0);
    let used = 0;
    for (const i of active) {
      const give = Math.min(amount * weight(i) / sum, cap(i) - out[i]!);
      out[i]! += give;
      used += give;
    }
    amount -= used;
    active = active.filter(i => out[i]! < cap(i) - EPS);
    if (used < EPS) break;
  }
  return amount;
}

function shrink(out: number[], spans: readonly AxisSpan[], need: number,
  eligible: (span: AxisSpan) => boolean, weight: (span: AxisSpan) => number): number {
  let active = spans.map((span, i) => eligible(span) && out[i]! > span.min + EPS ? i : -1).filter(i => i >= 0);
  while (need > EPS && active.length) {
    const sum = active.reduce((s, i) => s + weight(spans[i]!), 0);
    let used = 0;
    for (const i of active) {
      const take = Math.min(need * weight(spans[i]!) / sum, out[i]! - spans[i]!.min);
      out[i]! -= take;
      used += take;
    }
    need -= used;
    active = active.filter(i => out[i]! > spans[i]!.min + EPS);
    if (used < EPS) break;
  }
  return need;
}

export interface SnapCandidate { at: number; penalty: number }

/** Picks one candidate per line (first and last are pinned) minimising the squared
 *  distance to the solved positions plus each candidate's penalty, subject to every
 *  span staying within [min, max]. Null when no combination satisfies the bounds. */
export function snapAxis(solved: readonly number[], candidates: readonly SnapCandidate[][],
  bounds: readonly [number, number][]): number[] | null {
  const n = solved.length;
  if (n === 0) return [];
  type Cell = { cost: number; from: number };
  const table: Cell[][] = candidates.map(list => list.map(() => ({ cost: Infinity, from: -1 })));
  candidates[0]!.forEach((c, k) => { table[0]![k] = { cost: (c.at - solved[0]!) ** 2 + c.penalty, from: -1 }; });
  for (let i = 1; i < n; i++) {
    const [lo, hi] = bounds[i - 1]!;
    candidates[i]!.forEach((c, k) => {
      const own = (c.at - solved[i]!) ** 2 + c.penalty;
      let best: Cell = { cost: Infinity, from: -1 };
      candidates[i - 1]!.forEach((p, j) => {
        const prev = table[i - 1]![j]!;
        if (!Number.isFinite(prev.cost)) return;
        const length = c.at - p.at;
        if (length < lo - 1e-4 || length > hi + 1e-4) return;
        if (prev.cost + own < best.cost) best = { cost: prev.cost + own, from: j };
      });
      table[i]![k] = best;
    });
  }
  const last = table[n - 1]!;
  let k = -1, cost = Infinity;
  last.forEach((cell, j) => { if (cell.cost < cost) { cost = cell.cost; k = j; } });
  if (k < 0) return null;
  const out = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = candidates[i]![k]!.at;
    k = table[i]![k]!.from;
  }
  return out;
}

/** Cumulative line positions from span lengths, starting at zero. */
export function positionsOf(lengths: readonly number[]): number[] {
  const out = [0];
  for (const length of lengths) out.push(out.at(-1)! + length);
  return out;
}
