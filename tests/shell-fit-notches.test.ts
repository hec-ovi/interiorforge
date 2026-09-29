import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Blueprint } from '../src/core/types.js';
import { openingHole } from '../src/geometry/shell-fit.js';
import { shellWallDepth } from '../src/layout/shell.js';

const blueprint: Blueprint = JSON.parse(readFileSync(new URL('./kit-plans/balcony-grid-review-05.blueprint.json', import.meta.url), 'utf8'));

it('opens the reveal of every glazed bay of a notched facade, the ones beside a balcony notch included', () => {
  // The far side of a notch faces the bay across the balcony; its wall stops at its own skin.
  for (const floor of blueprint.floors.filter(item => item.index > 0)) for (const opening of floor.openings.filter(item => item.kind === 'window')) {
    const hole = openingHole(floor, opening, shellWallDepth(blueprint.facade));
    expect(hole.t1 - hole.t0, opening.id).toBeGreaterThan(opening.width / 2);
  }
});
