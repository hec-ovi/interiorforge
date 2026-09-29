import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { createDocument } from '../src/glb/io.js';
import type { LightFixture } from '../src/core/types.js';
import { Kit } from '../src/modules/kit.js';
import type { RecipeSet } from '../src/modules/recipes.js';
import type { Placement } from '../src/placements/types.js';
import type { PlacementBuilder } from '../src/placements/builder.js';
import { makeFrame, uvToWorld, worldToUv, type Frame } from '../src/layout/uv.js';
import type { WallFace } from '../src/styles/systems/types.js';

/** Shared proof helpers for the surface-system tests: a recording face, local kits of one
 *  recipe set, placed vertices and GLB byte counts, without the whole module catalog. */

export type V3 = [number, number, number];

export function kits(...sets: RecipeSet[]): Map<string, Kit> {
    const out = new Map<string, Kit>();
    for (const set of sets) set((id, draw) => {
        if (out.has(id)) throw new Error(`duplicate module ${id}`);
        const k = new Kit(() => [1, 1]); draw(k); k.mesh.seal(); out.set(id, k);
    });
    return out;
}

export const triangles = (k: Kit): number => k.mesh.materials().reduce((n, m) => n + k.mesh.getGroup(m)!.indices.length / 3, 0);

export function bounds(k: Kit): { min: V3; max: V3 } {
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const m of k.mesh.materials()) {
        const p = k.mesh.getGroup(m)!.positions;
        for (let i = 0; i < p.length; i++) { min[i % 3] = Math.min(min[i % 3]!, p[i]!); max[i % 3] = Math.max(max[i % 3]!, p[i]!); }
    }
    return { min, max };
}

/** Every authored vertex of a placement, in world metres. */
export function placed(p: Placement, k: Kit): V3[] {
    const out: V3[] = [], c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
    for (const m of k.mesh.materials()) {
        const v = k.mesh.getGroup(m)!.positions;
        for (let i = 0; i < v.length; i += 3) {
            const x = v[i]! * p.scale[0], y = v[i + 1]! * p.scale[1], z = v[i + 2]! * p.scale[2];
            out.push([p.position[0] + x * c + z * s, p.position[1] + y, p.position[2] + z * c - x * s]);
        }
    }
    return out;
}

export async function glbBytes(k: Kit): Promise<number> {
    await MeshoptEncoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
    const doc = createDocument(k.mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
    await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 }));
    return (await io.writeBinary(doc)).byteLength;
}

export interface RecordingFace extends WallFace { placements: Placement[]; lights: LightFixture[]; t(p: Placement): number }

/** A wall face as `placements/walls.ts` builds it: local +z into the room on `side`. */
export function recordingFace(o: { axis: 'H' | 'V'; c?: number; side: 1 | -1; angle?: number; height?: number; ceilingY?: number;
    gridOrigin?: number; elevation?: number; room?: string }): RecordingFace {
    const frame: Frame = makeFrame(o.angle ?? 0), c = o.c ?? 0, side = o.side;
    const d = o.axis === 'H' ? [0, side] : [side, 0];
    const w = [d[0]! * frame.cos - d[1]! * frame.sin, d[0]! * frame.sin + d[1]! * frame.cos];
    const rotation = Math.atan2(w[0]!, w[1]!);
    const tangent = [Math.cos(rotation), -Math.sin(rotation)];
    const along = (o.axis === 'H' ? tangent[0]! * frame.cos + tangent[1]! * frame.sin : -tangent[0]! * frame.sin + tangent[1]! * frame.cos) > 0 ? 1 : -1;
    const placements: Placement[] = [], lights: LightFixture[] = [];
    let ids = 0;
    const at = (t: number, y: number, proud = 0): V3 => {
        const off = proud * side;
        const [x, z] = uvToWorld(o.axis === 'H' ? [t, c + off] : [c + off, t], frame);
        return [x, y, z];
    };
    const height = o.height ?? 3, room = o.room ?? 'room';
    return {
        builder: { module() { throw new Error('placers go through face.piece'); } } as unknown as PlacementBuilder,
        room, kind: 'living', axis: o.axis, c, side, frame, rotation, along, height, ceilingY: o.ceilingY ?? height,
        elevation: o.elevation ?? 0, gridOrigin: o.gridOrigin ?? 0, placements, lights,
        at,
        piece(module, t, y, scale, extra = {}) {
            const p: Placement = { id: extra.id ?? `module:${placements.length}`, module, room, position: at(t, y, extra.proud ?? 0), scale, rotationY: rotation };
            placements.push(p);
            return p;
        },
        nextId: () => `wl${ids++}`,
        t(p: Placement) { const uv = worldToUv([p.position[0], p.position[2]], frame); return o.axis === 'H' ? uv[0] : uv[1]; },
    };
}

/** A placed vertex in face coordinates: t along the line, y up, z into the room. */
export function local(face: RecordingFace, v: V3): V3 {
    const uv = worldToUv([v[0], v[2]], face.frame);
    const t = face.axis === 'H' ? uv[0] : uv[1], across = (face.axis === 'H' ? uv[1] : uv[0]) - face.c;
    return [t, v[1], across * face.side];
}
