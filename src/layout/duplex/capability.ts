import type { Point } from '../../core/geom.js';
import type { FloorInterior } from '../../core/types.js';
import { PlacementBuilder } from '../../placements/builder.js';
import { placeDuplexStructure } from '../../placements/duplex.js';
import type { GeneratedInterior } from '../../placements/types.js';
import { makeFrame, uvToWorld, uvRectCorners } from '../uv.js';
import type { DuplexSection } from './section.js';
import { duplexSlices } from './metadata.js';

/** A deliberately unfurnished capability specimen. It proves the existing
 * consumer's floor cuts, streaming bands and body collision; it is not a
 * completed apartment, facade or visual-quality approval. */
export function duplexCapability(section: DuplexSection, angle = 0, origin: Point = [0, 0]): GeneratedInterior {
  const frame = makeFrame(angle);
  const world = (p: Point): Point => {
    const rotated = uvToWorld(p, frame); return [rotated[0] + origin[0], rotated[1] + origin[1]];
  };
  const lower = new PlacementBuilder(), upper = new PlacementBuilder();
  const slab = (builder: PlacementBuilder, room: string, rect: { u: number; v: number; lu: number; lv: number }, top: number) => {
    const p = world([rect.u + rect.lu / 2, rect.v + rect.lv / 2]);
    builder.module('floor-slab-plank', room, [p[0], top, p[1]], [rect.lu / .5, 1, rect.lv / .5], -angle * Math.PI / 180);
  };
  const room = 'duplex-105-living', gallery = 'duplex-105-gallery';
  const whole = { u: 0, v: 0, lu: section.width, lv: section.depth };
  slab(lower, room, whole, 0);
  for (const rect of section.upperSlabs) slab(upper, gallery, rect, 0);
  const polygon = uvRectCorners(whole).map(world), s = section.stairOpening;
  const slices = duplexSlices(section, 'duplex-105', 0, origin, angle);
  placeDuplexStructure(lower, slices[0], room);
  placeDuplexStructure(upper, slices[1], gallery);
  const floor = (index: number): FloorInterior => ({ floor: index, kind: 'apartment', elevation: 0,
    height: section.pitch, ceilingElevation: section.pitch - .2, coreAngleDeg: angle,
    core: { stairs: [], elevators: [], shafts: [] }, openingReservations: [], furniture: [], lights: [], duplexes: [slices[index]!],
    rooms: [{ id: index ? gallery : room, kind: index ? 'living' : 'living', unit: 'duplex-105',
      polygon, ...(index ? { holes: [...section.loungeVoids, s].map(rect => uvRectCorners(rect).map(world)) } : {}), doors: [] }] });
  const emptyNpc = () => ({ buildingId: 'duplex-capability', anchors: [], roles: [], routines: [], placements: [],
    nav: { cellSize: .5, floors: [], connectors: [] } });
  return { missingModels: [], building: { version: 1, generatorVersion: 'capability-proof', buildingId: 'duplex-capability',
    modules: 'modules.json', props: 'catalog.json', materialTheme: 'cyberpunk', tier: 'high_rich',
    layouts: { ground: 'layouts/ground.json', crown: 'layouts/crown.json' },
    floors: [{ index: 0, layout: 'ground', elevation: 0, openings: {} },
      { index: 1, layout: 'crown', elevation: section.pitch, openings: {} }],
    connectors: [{ id: slices[0].id, kind: 'stair', floors: [0, 1],
      entryByFloor: { 0: world(section.stair.lowerEntry), 1: world(section.stair.upperEntry) } }],
    corePlacement: { stairA: { center: world([s.u + 1.5, s.v + s.lv / 2]), axis: [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)], width: 3, depth: s.lv } } },
    layouts: { ground: { version: 1, id: 'ground', sourceFloor: 0, floor: floor(0), openings: [], placements: lower.placements, npc: emptyNpc() },
      crown: { version: 1, id: 'crown', sourceFloor: 1, floor: floor(1), openings: [], placements: upper.placements, npc: emptyNpc() } } };
}
