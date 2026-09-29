import { describe, expect, it } from 'vitest';
import { tileScale } from '../src/modules/index.js';
import type { ThemeIndex } from '../src/materials/theme.js';

describe('material variant physical repeat', () => {
  const theme: ThemeIndex = { theme: 'test', entries: {
    'test/fabric/mid': { key: 'test/fabric/mid', alignment: 'tile', tiling: { worldSize: [2, 1] }, variants: [
      { id: 'coarse', resolution: [512, 512], maps: { basecolor: 'coarse.png' } },
      { id: 'linen', resolution: [512, 512], tiling: { worldSize: [.5, .25] }, maps: { basecolor: 'linen.png' } },
    ] },
  } };

  it('keeps each selected cloth at its own physical scale while retaining the entry fallback', () => {
    const scale = tileScale(theme);
    expect(scale('test/fabric/mid#linen')).toEqual([2, 4]);
    expect(scale('test/fabric/mid#coarse')).toEqual([.5, 1]);
    expect(scale('test/fabric/mid')).toEqual([.5, 1]);
    expect(scale('test/missing/mid')).toEqual([1, 1]);
  });
});
