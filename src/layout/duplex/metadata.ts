import type { FloorDuplex } from '../../core/duplex.js';
import type { Point } from '../../core/geom.js';
import { makeFrame, uvRectCorners, uvToWorld } from '../uv.js';
import type { DuplexSection } from './section.js';

/** One immutable measured section, represented once on each affected floor. */
export function duplexSlices(section: DuplexSection, unit: string, lowerFloor: number,
  origin: Point, angleDeg: number, lowerCeilingGap = .2): [FloorDuplex, FloorDuplex] {
  const frame = makeFrame(angleDeg);
  const world = (point: Point): Point => {
    const p = uvToWorld(point, frame); return [p[0] + origin[0], p[1] + origin[1]];
  };
  const shared = { id: `${unit}-duplex`, unit, lowerFloor, upperFloor: lowerFloor + 1,
    frame: { origin: [...origin] as Point, angleDeg }, width: section.width, depth: section.depth, pitch: section.pitch, lowerCeilingGap,
    footprint: uvRectCorners({ u: 0, v: 0, lu: section.width, lv: section.depth }).map(world),
    loungeVoids: section.loungeVoids.map(rect => uvRectCorners(rect).map(world)),
    stairOpening: uvRectCorners(section.stairOpening).map(world),
    lowerEntry: world(section.stair.lowerEntry), upperEntry: world(section.stair.upperEntry),
    stairOpeningDepth: section.stairOpening.lv,
    area: { lower: section.lowerArea, upper: section.upperArea,
      loungeVoid: section.loungeVoids.reduce((sum, rect) => sum + rect.lu * rect.lv, 0),
      stairOpening: section.stairOpening.lu * section.stairOpening.lv } };
  return [{ ...shared, level: 'lower' }, { ...structuredClone(shared), level: 'upper' }];
}
