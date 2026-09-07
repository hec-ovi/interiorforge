import type { LightFixture } from "../core/types.js";
import type { PlanFurniture } from "./plan-types.js";
import { uvToWorld, type Frame } from "./uv.js";

/** Each source sits on a modeled lens, in the same local coordinate frame. */
export function furnitureLights(items: readonly PlanFurniture[], frame: Frame, elevation: number, tier: string): LightFixture[] {
  if (tier === "poor") return [];
  return items.flatMap(item => {
    if (!["ornament_wall", "room_divider", "sleeping_pod"].includes(item.kind)) return [];
    const angle = item.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const vector = ([x,y,z]: number[]): [number,number,number] => {
      const u = x! * c + z! * s, v = -x! * s + z! * c;
      return [u * frame.cos - v * frame.sin, y!, u * frame.sin + v * frame.cos];
    };
    const source = (suffix: string, local: [number,number,number], length: number,
      axis: [number,number,number], direction: [number,number,number], lumens: number): LightFixture => {
      const [x,z] = uvToWorld([item.at[0] + local[0]*c + local[2]*s, item.at[1] - local[0]*s + local[2]*c], frame);
      return { id: `${item.id}-${suffix}`, furniture: item.id, kind: "strip", room: item.room,
        position: [x, elevation + (item.elevation ?? 0) + local[1], z], length,
        angleDeg: ((frame.angleDeg - item.rotationDeg) % 360 + 360) % 360,
        axis: vector(axis), direction: vector(direction), intensity: lumens,
        colorTemperatureK: tier === "mid" ? 6500 : 2700,
        ...(tier === "mid" ? { color: [.025,.72,1] as [number,number,number] } : {}),
        range: 2.5, beamDeg: 170, diffuse: .95, facing: direction[1] > 0 ? "up" : "down" };
    };
    if (item.kind === "sleeping_pod") {
      const [w,d,h] = item.size, bars: LightFixture[] = [];
      for (const side of [-1,1]) for (const [index,low,high] of [[0,.58,1.02],[1,1.12,h-.38]]) {
        bars.push(source(`jamb-${side}-${index}`, [side*(w/2-.055),(low!+high!)/2,d/2+.002],
          high!-low!, [0,1,0], [0,0,1], 42));
      }
      bars.push(source("ceiling", [0,h-.141,-d/2+.16], w-.6, [1,0,0], [0,-1,0], 115));
      return bars;
    }
    const open = item.kind === "room_divider";
    return [source("light", [0,open ? .514 : item.size[2]-.512,0], item.size[0]-.6,
      [1,0,0], [0,open ? 1 : -1,0], tier === "mid" ? 160 : 240)];
  });
}
