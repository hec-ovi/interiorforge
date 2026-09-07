import type { LightFixture } from "../core/types.js";
import type { PlanFurniture } from "./plan-types.js";
import { uvToWorld, type Frame } from "./uv.js";

/** Built-in lenses publish light separately from their model-owned housing. */
export function furnitureLights(items: readonly PlanFurniture[], frame: Frame, elevation: number, tier: string): LightFixture[] {
  if (tier === "poor") return [];
  return items.flatMap(item => {
    if (!["ornament_wall", "room_divider", "sleeping_pod"].includes(item.kind)) return [];
    const pod = item.kind === "sleeping_pod", back = pod ? -item.size[1] / 2 + .16 : 0;
    const angle = item.rotationDeg * Math.PI / 180;
    const [x, z] = uvToWorld([item.at[0] + back * Math.sin(angle), item.at[1] + back * Math.cos(angle)], frame);
    const open = item.kind === "room_divider";
    return [{ id: `${item.id}-light`, furniture: item.id, kind: "strip", room: item.room,
      position: [x, elevation + (open ? .514 : item.size[2] - (pod ? .14 : .512)), z],
      length: item.size[0] - .6, angleDeg: ((frame.angleDeg - item.rotationDeg) % 360 + 360) % 360,
      intensity: tier === "mid" ? 180 : 280, colorTemperatureK: tier === "mid" ? 6500 : 2700,
      range: 2.5, beamDeg: 170, diffuse: .95, facing: open ? "up" : "down",
    } satisfies LightFixture];
  });
}
