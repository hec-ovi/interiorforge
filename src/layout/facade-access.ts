import type { FloorFrame } from "./plan-types.js";
import { inlineStairBypasses } from "./public-bypass.js";
import type { UvRect } from "./uv.js";

/** Inboard public bypasses join the corridor to both sides of an inline stair. */
export class FacadeAccess {
  private readonly bypasses: UvRect[];

  constructor(frame: FloorFrame) {
    this.bypasses = inlineStairBypasses(frame.stairB);
  }

  /** Keep the complete facade bay while reserving its inboard public access band. */
  unit(strip: UvRect, side: "v0" | "v1", low: number, high: number): UvRect {
    let near = side === "v0" ? strip.v : strip.v + strip.lv;
    for (const bypass of this.bypasses) {
      if (Math.min(high, bypass.u + bypass.lu) - Math.max(low, bypass.u) <= 1e-6) continue;
      if (Math.min(strip.v + strip.lv, bypass.v + bypass.lv) - Math.max(strip.v, bypass.v) <= 1e-6) continue;
      near = side === "v0" ? Math.max(near, bypass.v + bypass.lv) : Math.min(near, bypass.v);
    }
    return side === "v0"
      ? { u: low, v: near, lu: high - low, lv: strip.v + strip.lv - near }
      : { u: low, v: strip.v, lu: high - low, lv: near - strip.v };
  }
}
