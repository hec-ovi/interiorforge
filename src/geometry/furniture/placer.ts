import type { Point } from "../../core/geom.js";
import { MeshBuilder } from "../../glb/mesh-builder.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import type { Frame } from "../../layout/uv.js";
import { uvToWorld } from "../../layout/uv.js";
import type { MaterialKeys } from "../materials.js";

/** Material families a piece of furniture is built from. */
export type Mat = "wood" | "metal" | "door" | "fabric" | "glass" | "tile" | "plaster" | "screen" | "accent";

const KIND: Record<Mat, string> = {
  wood: "wood", metal: "metal", door: "door", fabric: "fabric", glass: "glass", tile: "tile",
  plaster: "plaster", screen: "ad-screen", accent: "tile",
};

/** Draws one piece of furniture in its own coordinates: x across the width, z from back to
 *  front (the piece faces +z), y up from its base. Rotation and the parcel's frame are
 *  applied on the way out, so a builder never thinks about either. */
export class Placer {
  private readonly cos: number;
  private readonly sin: number;
  /** half extents, so a builder writes in terms of its own edges */
  readonly hw: number;
  readonly hd: number;
  readonly height: number;

  constructor(
    private readonly mb: MeshBuilder,
    private readonly keys: MaterialKeys,
    private readonly frame: Frame,
    private readonly item: PlanFurniture,
    private readonly base: number,
  ) {
    const rad = (item.rotationDeg * Math.PI) / 180;
    this.cos = Math.cos(rad);
    this.sin = Math.sin(rad);
    this.hw = item.size[0] / 2;
    this.hd = item.size[1] / 2;
    this.height = item.size[2];
  }

  /** Deterministic 0..1 draw from this piece's id, for seeded variety inside a builder. */
  variant(salt: number): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < this.item.id.length; i++) {
      h = Math.imul(h ^ this.item.id.charCodeAt(i), 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  }

  box(mat: Mat, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): void {
    if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4 || y1 - y0 < 1e-4) return;
    const corners: Point[] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => this.toWorld(x!, z!));
    this.mb.addPrism(
      this.keys.key(KIND[mat], mat === "fabric" ? "flat" : undefined),
      corners, this.base + y0, this.base + y1,
      mat === "screen" ? "unit" : "world",
      y0 <= 1e-3 ? "top" : "both",
    );
  }

  /** Four legs at the corners, inset from the edges. */
  legs(mat: Mat, thickness: number, inset: number, top: number): void {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (this.hw - inset);
        const z = sz * (this.hd - inset);
        this.box(mat, x - (sx > 0 ? thickness : 0), x + (sx > 0 ? 0 : thickness),
          z - (sz > 0 ? thickness : 0), z + (sz > 0 ? 0 : thickness), 0, top);
      }
    }
  }

  private toWorld(x: number, z: number): Point {
    const u = this.item.at[0] + x * this.cos + z * this.sin;
    const v = this.item.at[1] - x * this.sin + z * this.cos;
    return uvToWorld([u, v], this.frame);
  }
}
