import { MeshBuilder, type UvMode, type UvScale, type Vec3, type BoxFace } from "../glb/mesh-builder.js";
import type { Point } from "../core/geom.js";
import type { Vector3 } from "./types.js";

/** How a material wants its map laid on a face. */
export type Alignment = (slot: string) => "tile" | "exact";

const TILED: Alignment = () => "tile";

/** One authored module: geometry in metres, XZ centred where the placement table puts it,
 *  Y up from the surface it stands on. One UV convention: a tiled material wears tile-unit
 *  UVs (one unit per map repeat, at its published metre size) and an exact material wears
 *  its map once over the face. `uv` overrides that only where a face wants the other. */
export class Kit {
  readonly mesh: MeshBuilder;

  constructor(tile: UvScale, private readonly alignment: Alignment = TILED) {
    this.mesh = new MeshBuilder(undefined, null, tile);
  }

  /** The convention for this slot, unless the face asked for the other one. */
  private mode(slot: string, uv?: UvMode): UvMode {
    return uv ?? (this.alignment(slot) === "exact" ? "unit" : "world");
  }

  /** Box from its minimum corner. */
  box(slot: string, [x, y, z]: Vector3, [w, h, d]: Vector3, uv?: UvMode, faces?: readonly BoxFace[]): void {
    this.mesh.addBox(slot, { x, z, w, d }, y, y + h, faces, this.mode(slot, uv));
  }

  /** Box centred in XZ, standing on y. */
  cbox(slot: string, [cx, y, cz]: Vector3, [w, h, d]: Vector3, uv?: UvMode, faces?: readonly BoxFace[]): void {
    this.box(slot, [cx - w / 2, y, cz - d / 2], [w, h, d], uv, faces);
  }

  /** Regular polygon prism around (cx, cz): eight sides read as a cylinder at room scale. */
  cylinder(slot: string, [cx, y, cz]: Vector3, radius: number, height: number, sides = 8, uv?: UvMode): void {
    const corners: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      corners.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
    }
    this.mesh.addPrism(slot, corners, y, y + height, this.mode(slot, uv), "both");
  }

  /** Square-section rod between two points, e.g. a leg, a rail, a stem. */
  rod(slot: string, a: Vector3, b: Vector3, thickness: number): void {
    const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as Vector3;
    const length = Math.hypot(...axis) || 1;
    const n = axis.map((v) => v / length) as Vector3;
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(n, helper)), v = unit(cross(n, u));
    const h = thickness / 2;
    const corner = (p: Vec3, su: number, sv: number): Vec3 => [p[0] + u[0] * su * h + v[0] * sv * h, p[1] + u[1] * su * h + v[1] * sv * h, p[2] + u[2] * su * h + v[2] * sv * h];
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    const bottom = ring.map(([su, sv]) => corner(a, su, sv)), top = ring.map(([su, sv]) => corner(b, su, sv));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.mesh.addQuad(slot, [bottom[i]!, top[i]!, top[j]!, bottom[j]!], this.mode(slot));
    }
    this.mesh.addQuad(slot, [top[0]!, top[3]!, top[2]!, top[1]!], this.mode(slot));
    this.mesh.addQuad(slot, [bottom[0]!, bottom[1]!, bottom[2]!, bottom[3]!], this.mode(slot));
  }

  /** One leaf: a bent quad pair from `at` along a horizontal heading, rising a little. */
  leaf(slot: string, at: Vector3, headingRad: number, length: number, width: number, lift = 0.25): void {
    const dx = Math.cos(headingRad), dz = Math.sin(headingRad), px = -dz, pz = dx;
    const tip: Vec3 = [at[0] + dx * length, at[1] + length * lift, at[2] + dz * length];
    const mid: Vec3 = [at[0] + dx * length * 0.45, at[1] + length * lift * 0.7, at[2] + dz * length * 0.45];
    const left: Vec3 = [mid[0] + px * width / 2, mid[1], mid[2] + pz * width / 2];
    const right: Vec3 = [mid[0] - px * width / 2, mid[1], mid[2] - pz * width / 2];
    this.mesh.addQuad(slot, [at, left, tip, right], this.mode(slot));
    this.mesh.addQuad(slot, [at, right, tip, left], this.mode(slot));
  }

  /** A planted tuft: a stem with a fan of leaves, seeded so every tuft differs. */
  plant(leafSlot: string, stemSlot: string, at: Vector3, height: number, seed: number, leaves = 7): void {
    this.rod(stemSlot, at, [at[0], at[1] + height * 0.55, at[2]], 0.02);
    for (let i = 0; i < leaves; i++) {
      const t = noise(seed + i), a = i * 2.399 + noise(seed * 3 + i) * 0.8;
      const y = at[1] + height * (0.2 + 0.35 * t);
      this.leaf(leafSlot, [at[0], y, at[2]], a, height * (0.35 + 0.25 * noise(seed + 11 + i)), height * 0.12, 0.35 + 0.4 * t);
    }
  }
}

function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
