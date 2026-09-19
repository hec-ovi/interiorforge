import type { FurnitureKind, LightFixture } from "../core/types.js";
import type { PlanFurniture } from "./plan-types.js";
import { uvToWorld, type Frame } from "./uv.js";

type Vec = [number, number, number];
interface Lens { at: Vec; length: number; up?: boolean; lumens: number }
/** A built-in module authored at `size` (w, d, h) and the lenses it carries, in its own
 *  frame (x across, y up, z toward its front); a record scaled to another size scales them. */
interface Lit { size: Vec; lenses: Lens[] }

const LIT: Partial<Record<FurnitureKind, Lit>> = {
  reception_desk: { size: [2.6, 0.9, 1.1], lenses: [{ at: [0, 0.02, 0.43], length: 2.3, lumens: 160 }] },
  bar_counter: { size: [3, 0.65, 1.1], lenses: [{ at: [0, 0.09, 0.295], length: 2.7, lumens: 160 }] },
  counter: { size: [3, 0.65, 1.1], lenses: [{ at: [0, 0.09, 0.295], length: 2.7, lumens: 120 }] },
  bench: { size: [1.8, 0.4, 0.45], lenses: [{ at: [0, 0.35, 0.14], length: 1.6, lumens: 90 }] },
  bed_double: { size: [1.6, 2.1, 0.55], lenses: [{ at: [0, 1.42, -0.74], length: 1.4, lumens: 180 }, { at: [0, 0.05, 0.95], length: 1.2, lumens: 90 }] },
  bed_single: { size: [1.6, 2.1, 0.55], lenses: [{ at: [0, 1.42, -0.74], length: 1.4, lumens: 140 }, { at: [0, 0.05, 0.95], length: 1.2, lumens: 70 }] },
  wardrobe: { size: [1.6, 0.65, 2], lenses: [{ at: [0, 1.96, 0.275], length: 1.4, lumens: 120 }] },
  sink: { size: [0.5, 0.45, 0.85], lenses: [{ at: [0, 0.98, -0.165], length: 0.4, lumens: 110 }] },
  plant: { size: [0.5, 0.5, 1.3], lenses: [{ at: [0, 1.28, 0], length: 0.4, lumens: 90 }] },
  shelf: { size: [1.8, 0.5, 2], lenses: [{ at: [0, 1.88, 0.15], length: 1.6, lumens: 110 }] },
  wall_shelf: { size: [1.2, 0.28, 0.4], lenses: [{ at: [0, 0.04, 0.06], length: 1, lumens: 60 }] },
  room_divider: { size: [2.5, 0.5, 2], lenses: [{ at: [0, 0.46, 0], length: 2.2, up: true, lumens: 240 }] },
  ornament_wall: { size: [3, 0.5, 2], lenses: [{ at: [0, 1.488, 0], length: 2.4, lumens: 240 }] },
  sleeping_pod: { size: [2.5, 1.5, 2], lenses: [{ at: [0, 1.859, -0.59], length: 1.9, lumens: 115 }] },
};

/** Each source sits on a modeled lens, in the same local coordinate frame. */
export function furnitureLights(items: readonly PlanFurniture[], frame: Frame, elevation: number, tier: string): LightFixture[] {
  if (tier === "poor") return [];
  return items.flatMap(item => {
    const lit = LIT[item.kind];
    if (!lit) return [];
    const scale = item.size.map((v, i) => v / lit.size[i]!) as Vec;
    const scaled = (v: Vec): Vec => [v[0] * scale[0], v[1] * scale[2], v[2] * scale[1]];
    const angle = item.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const vector = ([x, y, z]: number[]): Vec => {
      const u = x! * c + z! * s, v = -x! * s + z! * c;
      return [u * frame.cos - v * frame.sin, y!, u * frame.sin + v * frame.cos];
    };
    const source = (suffix: string, local: Vec, length: number, axis: Vec, direction: Vec, lumens: number): LightFixture => {
      const [x, z] = uvToWorld([item.at[0] + local[0] * c + local[2] * s, item.at[1] - local[0] * s + local[2] * c], frame);
      return { id: `${item.id}-${suffix}`, furniture: item.id, kind: "strip", room: item.room,
        position: [x, elevation + (item.elevation ?? 0) + local[1], z], length,
        angleDeg: ((frame.angleDeg - item.rotationDeg) % 360 + 360) % 360,
        axis: vector(axis), direction: vector(direction), intensity: lumens,
        colorTemperatureK: tier === "mid" ? 6500 : 2700,
        ...(tier === "mid" ? { color: [.025, .72, 1] as Vec } : {}),
        range: 2.5, beamDeg: 170, diffuse: .95, facing: direction[1] > 0 ? "up" : "down" };
    };
    const lenses = lit.lenses.map((lens, i) => source(lit.lenses.length > 1 ? `lens-${i}` : "light", scaled(lens.at),
      lens.length * scale[0], [1, 0, 0], [0, lens.up ? 1 : -1, 0], lens.lumens));
    if (item.kind !== "sleeping_pod") return lenses;
    const [w, d, h] = item.size, bars: LightFixture[] = [];
    for (const side of [-1, 1]) for (const [index, low, high] of [[0, .58, 1.02], [1, 1.12, h - .38]]) {
      bars.push(source(`jamb-${side}-${index}`, [side * (w / 2 - .055), (low! + high!) / 2, d / 2 + .002], high! - low!, [0, 1, 0], [0, 0, 1], 42));
    }
    return [...bars, ...lenses];
  });
}
