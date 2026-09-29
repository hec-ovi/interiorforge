import type { Point } from '../../core/geom.js';
import type { LightFixture } from '../../core/types.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { FloorSystem, PitSpec, SurfaceRoom } from './types.js';
import { bandRect, gridId, gridPieces, lay, subtractAll, wallBands, wallIntervals } from './surface-grid.js';

/** Floors: one support slab per rectangle with its top 2 mm under Y0 (so the walking-slab
 *  count sees the floor whole), a border and inlay along the real walls, and the field in
 *  baked tile blocks phased to the building grid or the room (rows, columns or single tiles
 *  where a block is clipped), with real joints over the support. The E1 glass pit is a
 *  walk-on glass sheet flush at Y0 over a rounded, lit tray: a stretched straight tray, two
 *  unscaled rounded ends, rock clusters at a fixed pitch and a cyan lens with its record. */

const CELL = .5;
/** Clear floor the pit leaves around it for furniture and walking. */
export const PIT_CLEARANCE = 1;
/** Rock clusters stand this far apart along the pit's straight part. */
export const ROCK_PITCH = 1.2;
/** The lens plate lies this far above the tray bottom. */
export const LENS_RISE = .05;

/** Module ids of a pit by convention, from its floor system id `floor-slab-<sid>`. */
export function pitIds(spec: FloorSystem) {
    const sid = spec.id.replace(/^floor-slab-/, '');
    return { glass: spec.pit!.rim, straight: spec.pit!.straight, end: spec.pit!.end, rocks: `${spec.pit!.straight}-rocks`, lens: `ceiling-cove-${sid}-pit` };
}

/** Where the pit of a room lies: centred on the room's bounds, its length along the longer
 *  side, with `PIT_CLEARANCE` of floor around it; none when the room cannot hold it. Plans
 *  reserve the same rectangle, so furniture keeps off the glass. */
export function pitRect(pit: PitSpec, room: Pick<SurfaceRoom, 'bounds'>): (UvRect & { alongU: boolean }) | undefined {
    const b = room.bounds, alongU = b.lu >= b.lv, [width, length] = pit.size;
    const lu = alongU ? length : width, lv = alongU ? width : length;
    if (lu > b.lu - 2 * PIT_CLEARANCE + 1e-6 || lv > b.lv - 2 * PIT_CLEARANCE + 1e-6) return undefined;
    return { u: b.u + (b.lu - lu) / 2, v: b.v + (b.lv - lv) / 2, lu, lv, alongU };
}

const inside = (a: UvRect, b: UvRect) => a.u >= b.u - 1e-6 && a.v >= b.v - 1e-6 && a.u + a.lu <= b.u + b.lu + 1e-6 && a.v + a.lv <= b.v + b.lv + 1e-6;

/** Where tiles count from: the building grid, or the room's low corner. */
export const floorOrigin = (spec: FloorSystem, room: SurfaceRoom): Point => spec.tile.phase === 'grid' ? room.gridOrigin : [room.bounds.u, room.bounds.v];

/** The support slab alone over a rectangle: the structure under a raised level zone. */
export function placeFloorSupport(builder: PlacementBuilder, spec: FloorSystem, room: string, rect: UvRect, y: number, frame: Frame): void {
    if (rect.lu >= 1e-3 && rect.lv >= 1e-3) lay(builder, spec.support, room, rect, y, frame, [rect.lu / CELL, rect.lv / CELL]);
}

/** One floor rectangle of a room in a floor system. Returns the pit's lens records. */
export function placeFloorSystem(builder: PlacementBuilder, spec: FloorSystem, room: SurfaceRoom, rect: UvRect, y: number, frame: Frame): LightFixture[] {
    if (rect.lu < 1e-3 || rect.lv < 1e-3) return [];
    const pit = spec.pit ? pitRect(spec.pit, room) : undefined;
    const hole = pit && inside(pit, rect) ? pit : undefined;
    for (const part of hole ? subtractAll(rect, [hole]) : [rect]) lay(builder, spec.support, room.id, part, y, frame, [part.lu / CELL, part.lv / CELL]);
    const cuts: UvRect[] = hole ? [hole] : [];
    const border = spec.border;
    if (border) {
        const walls = wallIntervals(rect, [room.polygon, ...(room.holes ?? [])]);
        const inlay = border.inlay;
        for (const band of wallBands(rect, walls, 0, border.width).bands) for (const r of subtractAll(bandRect(rect, band), cuts)) {
            lay(builder, border.module, room.id, r, y, frame, [r.lu / CELL, r.lv / CELL]);
            cuts.push(r);
        }
        if (inlay) for (const band of wallBands(rect, walls, border.width, inlay.width).bands) for (const r of subtractAll(bandRect(rect, band), cuts)) {
            lay(builder, inlay.module, room.id, r, y, frame, [r.lu / CELL, r.lv / CELL]);
            cuts.push(r);
        }
    }
    const origin = floorOrigin(spec, room);
    const grid = { pitch: spec.tile.size, cells: spec.tile.blockTiles, joint: spec.tile.joint };
    for (const region of subtractAll(rect, cuts)) for (const piece of gridPieces(region, origin, grid))
        lay(builder, gridId(spec.tile.block, spec.tile.blockTiles, piece.cells), room.id, piece.rect, y, frame, piece.scale);
    return hole ? placePit(builder, spec, room, hole, y, frame) : [];
}

/** The pit over `r`: the glass sheet over its whole rectangle (a walking slab at Y0), the
 *  straight tray stretched between two unscaled rounded ends, rock clusters on a fixed pitch
 *  and the lens plate with a cove record of the same id. Pieces run along the pit's length
 *  in their local +x. */
function placePit(builder: PlacementBuilder, spec: FloorSystem, room: SurfaceRoom, r: UvRect & { alongU: boolean }, y: number, frame: Frame): LightFixture[] {
    const pit = spec.pit!, ids = pitIds(spec), [width, length] = pit.size, end = Math.min(pit.radius, length / 2);
    const rotation = -frame.angleDeg * Math.PI / 180 + (r.alongU ? 0 : -Math.PI / 2);
    const centre: Point = [r.u + r.lu / 2, r.v + r.lv / 2], axis: Point = r.alongU ? [1, 0] : [0, 1];
    const at = (t: number, lift = 0): [number, number, number] => {
        const [x, z] = uvToWorld([centre[0] + axis[0] * t, centre[1] + axis[1] * t], frame);
        return [x, y + lift, z];
    };
    lay(builder, ids.glass, room.id, r, y, frame, [r.lu / CELL, r.lv / CELL]);
    const straight = length - 2 * end;
    if (straight > 1e-4) builder.module(ids.straight, room.id, at(0), [straight / CELL, 1, 1], rotation);
    // Each rounded end is authored on its inner edge at x = 0, bulging towards +x.
    builder.module(ids.end, room.id, at(straight / 2), [1, 1, 1], rotation);
    builder.module(ids.end, room.id, at(-straight / 2), [1, 1, 1], rotation + Math.PI);
    const clusters = Math.max(1, Math.floor(straight / ROCK_PITCH));
    for (let i = 0; i < clusters && straight > ROCK_PITCH * .5; i++)
        builder.module(ids.rocks, room.id, at(-straight / 2 + (i + .5) * straight / clusters), [1, 1, 1], rotation + (i % 2 ? Math.PI : 0));
    const lensLength = length - .1, lensWidth = width - .1;
    const lens = builder.module(ids.lens, room.id, at(0, -pit.depth + LENS_RISE), [lensLength / CELL, 1, lensWidth / CELL], rotation);
    const position = at(0, -pit.depth + LENS_RISE);
    return [{
        id: lens.id, kind: 'cove', room: room.id,
        position: [position[0], position[1] + room.elevation, position[2]].map(v => Math.round(v * 1000) / 1000) as [number, number, number],
        length: Math.round(lensLength * 1000) / 1000, angleDeg: Math.round(((-rotation * 180 / Math.PI) % 360 + 360) % 360 * 100) / 100,
        axis: [Math.cos(rotation), 0, -Math.sin(rotation)], direction: [0, 1, 0],
        intensity: Math.round(lensLength * pit.lens.lumensPerMetre), colorTemperatureK: 6500, color: [...pit.lens.color] as [number, number, number],
        range: 2.5, beamDeg: 170, diffuse: .9, facing: 'up',
    }];
}
