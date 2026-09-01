import type { Point, Rect } from "../core/geom.js";
import { triangulate } from "../core/triangulate.js";

export type Vec3 = [number, number, number];

export type BoxFace = "top" | "bottom" | "north" | "south" | "east" | "west";

/** world: UVs in meters, so tiled materials never stretch. unit: 0..1 over the face, for
 *  exact-placement materials (an elevator door panel wears its texture once). */
export type UvMode = "world" | "unit";

const UNIT_QUAD: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];

const ALL_FACES: BoxFace[] = ["top", "bottom", "north", "south", "east", "west"];

export interface MeshGroup {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

/** Accumulates interior geometry per material key with glTF-correct winding
 *  (CCW front faces, right-handed, +Y up) and world-meter UVs. */
export class MeshBuilder {
  private readonly groups = new Map<string, MeshGroup>();

  private group(material: string): MeshGroup {
    let g = this.groups.get(material);
    if (!g) {
      g = { positions: [], normals: [], uvs: [], indices: [] };
      this.groups.set(material, g);
    }
    return g;
  }

  /** Quad with vertices CCW as seen from the front face. */
  addQuad(material: string, [v0, v1, v2, v3]: [Vec3, Vec3, Vec3, Vec3], uv: UvMode = "world"): void {
    const n = faceNormal(v0, v1, v2);
    const g = this.group(material);
    const base = g.positions.length / 3;
    [v0, v1, v2, v3].forEach((v, i) => {
      g.positions.push(...v);
      g.normals.push(...n);
      g.uvs.push(...(uv === "unit" ? UNIT_QUAD[i]! : uvFor(v, n)));
    });
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Horizontal surface from a simple polygon at height y. */
  addHorizontalPolygon(
    material: string, polygon: readonly Point[], y: number, facing: "up" | "down", uv: UvMode = "world",
  ): void {
    const g = this.group(material);
    const base = g.positions.length / 3;
    const n: Vec3 = facing === "up" ? [0, 1, 0] : [0, -1, 0];
    const xs = polygon.map((p) => p[0]);
    const zs = polygon.map((p) => p[1]);
    const [x0, z0] = [Math.min(...xs), Math.min(...zs)];
    const [w, d] = [Math.max(...xs) - x0 || 1, Math.max(...zs) - z0 || 1];
    for (const [x, z] of polygon) {
      g.positions.push(x, y, z);
      g.normals.push(...n);
      if (uv === "unit") g.uvs.push((x - x0) / w, (z - z0) / d);
      else g.uvs.push(x, z);
    }
    for (const [a, b, c] of triangulate(polygon)) {
      // shoelace-CCW in XZ faces -Y; flip for an upward surface
      if (facing === "up") g.indices.push(base + a, base + c, base + b);
      else g.indices.push(base + a, base + b, base + c);
    }
  }

  /** Axis-aligned box with outward normals. north = +Z, east = +X. */
  addBox(material: string, r: Rect, y0: number, y1: number, faces: readonly BoxFace[] = ALL_FACES): void {
    const { x, z, w, d } = r;
    const quads: Record<BoxFace, [Vec3, Vec3, Vec3, Vec3]> = {
      top: [[x, y1, z], [x, y1, z + d], [x + w, y1, z + d], [x + w, y1, z]],
      bottom: [[x, y0, z], [x + w, y0, z], [x + w, y0, z + d], [x, y0, z + d]],
      east: [[x + w, y0, z], [x + w, y1, z], [x + w, y1, z + d], [x + w, y0, z + d]],
      west: [[x, y0, z + d], [x, y1, z + d], [x, y1, z], [x, y0, z]],
      north: [[x + w, y0, z + d], [x + w, y1, z + d], [x, y1, z + d], [x, y0, z + d]],
      south: [[x, y0, z], [x, y1, z], [x + w, y1, z], [x + w, y0, z]],
    };
    for (const face of faces) this.addQuad(material, quads[face]);
  }

  /** Oriented wall slab along the segment p0 -> p1, extruded `thickness` to the LEFT of the
   *  direction of travel (the interior side of a CCW polygon edge), from y0 to y1.
   *  Handles walls at any angle; outward normals on all six faces. */
  addSlab(material: string, p0: Point, p1: Point, thickness: number, y0: number, y1: number): void {
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * thickness;
    const nz = (dx / len) * thickness;
    const a: Point = p0;
    const b: Point = p1;
    const c: Point = [p1[0] + nx, p1[1] + nz];
    const d: Point = [p0[0] + nx, p0[1] + nz];
    const v = (p: Point, y: number): Vec3 => [p[0], y, p[1]];
    // right side (faces away from the offset direction), left side, two ends, top, bottom
    this.addQuad(material, [v(a, y0), v(a, y1), v(b, y1), v(b, y0)]);
    this.addQuad(material, [v(c, y0), v(c, y1), v(d, y1), v(d, y0)]);
    this.addQuad(material, [v(d, y0), v(d, y1), v(a, y1), v(a, y0)]);
    this.addQuad(material, [v(b, y0), v(b, y1), v(c, y1), v(c, y0)]);
    this.addQuad(material, [v(a, y1), v(d, y1), v(c, y1), v(b, y1)]);
    this.addQuad(material, [v(a, y0), v(b, y0), v(c, y0), v(d, y0)]);
  }

  /** Vertical prism over a CCW plan polygon: outward side quads plus top and bottom. */
  addPrism(material: string, corners: readonly Point[], y0: number, y1: number, uv: UvMode = "world"): void {
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % corners.length]!;
      this.addQuad(material, [[a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]]], uv);
    }
    this.addHorizontalPolygon(material, corners, y1, "up", uv);
    this.addHorizontalPolygon(material, corners, y0, "down", uv);
  }

  isEmpty(): boolean {
    return this.groups.size === 0;
  }

  /** Material keys in insertion order; stable across runs. */
  materials(): string[] {
    return [...this.groups.keys()];
  }

  getGroup(material: string): MeshGroup | undefined {
    return this.groups.get(material);
  }
}

function faceNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
  const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
  const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** World-planar UVs in meters: horizontal faces map x/z, walls map along-wall/height. */
function uvFor(v: Vec3, n: Vec3): [number, number] {
  if (Math.abs(n[1]) > 0.9) return [v[0], v[2]];
  // horizontal tangent along the wall: cross(up, n)
  const tx = n[2], tz = -n[0];
  const len = Math.hypot(tx, tz) || 1;
  return [(v[0] * tx + v[2] * tz) / len, v[1]];
}
