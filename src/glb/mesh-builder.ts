import type { Point, Rect } from "../core/geom.js";
import { triangulate } from "../core/triangulate.js";

export type Vec3 = [number, number, number];

export type BoxFace = "top" | "bottom" | "north" | "south" | "east" | "west";

/** world: UVs in meters, so tiled materials never stretch. unit: 0..1 over the face, for
 *  exact-placement materials (an elevator door panel wears its texture once). */
export type UvMode = "world" | "unit";

/** A prism side quad is [bottom, top] of the edge start then [top, bottom] of its end. Seen from its
 *  front the edge start is on the viewer's right, so u runs 1 to 0 along it and a picture reads left to
 *  right; v follows glTF (0 at the top of the image), so the top of the face wears the top of the picture. */
const UNIT_QUAD: [number, number][] = [[1, 1], [1, 0], [0, 0], [0, 1]];

const ALL_FACES: BoxFace[] = ["top", "bottom", "north", "south", "east", "west"];

export interface MeshGroup {
  positions: number[] | Float32Array;
  normals: number[] | Float32Array;
  uvs: number[] | Float32Array;
  indices: number[] | Uint32Array;
}

interface MutableMeshGroup {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

/** Accumulates interior geometry per material key with glTF-correct winding
 *  (CCW front faces, right-handed, +Y up) and world-meter UVs. */
/** The building's own axes for horizontal tiling: a rotation of the world's, so tiles run along the building, not along north. */
export interface UvFrame {
  cos: number;
  sin: number;
}

const WORLD_FRAME: UvFrame = { cos: 1, sin: 0 };

export class MeshBuilder {
  /**
   * @param frame the building frame every floor, ceiling and roof tile follows
   * @param origin the frame-space corner tiles count from; without one, each polygon counts from its own corner
   */
  constructor(private readonly frame: UvFrame = WORLD_FRAME, private readonly origin: Point | null = null) {}

  private readonly groups = new Map<string, MeshGroup>();
  private sealed = false;

  private group(material: string): MutableMeshGroup {
    if (this.sealed) throw new Error("cannot add geometry to a sealed mesh");
    let g = this.groups.get(material);
    if (!g) {
      g = { positions: [], normals: [], uvs: [], indices: [] };
      this.groups.set(material, g);
    }
    return g as MutableMeshGroup;
  }

  /** Quad with vertices CCW as seen from the front face. World UVs start at the quad's own first
   *  vertex: u along the face from there, v up from its bottom, so a tile pattern begins at the
   *  corner and the floor line of every wall and cuts the same way on every building. */
  addQuad(material: string, [v0, v1, v2, v3]: [Vec3, Vec3, Vec3, Vec3], uv: UvMode = "world"): void {
    const n = faceNormal(v0, v1, v2);
    const g = this.group(material);
    const base = g.positions.length / 3;
    const bottom = Math.min(v0[1], v1[1], v2[1], v3[1]);
    [v0, v1, v2, v3].forEach((v, i) => {
      g.positions.push(...v);
      g.normals.push(...n);
      g.uvs.push(...(uv === "unit" ? UNIT_QUAD[i]! : this.faceUv(v, v0, n, bottom)));
    });
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Quad with explicit texture coordinates, for a non-repeating detail within a face. */
  addQuadUv(
    material: string, [v0, v1, v2, v3]: [Vec3, Vec3, Vec3, Vec3],
    uvs: readonly [[number, number], [number, number], [number, number], [number, number]],
  ): void {
    const n = faceNormal(v0, v1, v2);
    const g = this.group(material);
    const base = g.positions.length / 3;
    [v0, v1, v2, v3].forEach((vertex, i) => {
      g.positions.push(...vertex);
      g.normals.push(...n);
      g.uvs.push(...uvs[i]!);
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
    // tiles count from the building's grid corner, so they run whole from room to room; a builder
    // without one lets each polygon count from its own corner
    const framed = polygon.map(([x, z]) => this.toFrame(x, z));
    const origin: Point = this.origin ?? [Math.min(...framed.map((p) => p[0])), Math.min(...framed.map((p) => p[1]))];
    for (const [x, z] of polygon) {
      g.positions.push(x, y, z);
      g.normals.push(...n);
      if (uv === "unit") g.uvs.push((x - x0) / w, (z - z0) / d);
      else g.uvs.push(...this.planUv(x, z, origin));
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

  /** Vertical prism over a CCW plan polygon: outward side quads plus its caps. `caps` drops
   *  the underside for a box that sits on a floor, where it would only z-fight the slab. */
  addPrism(
    material: string, corners: readonly Point[], y0: number, y1: number, uv: UvMode = "world",
    caps: "both" | "top" | "none" = "both",
  ): void {
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % corners.length]!;
      this.addQuad(material, [[a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]]], uv);
    }
    if (caps === "none") return;
    this.addHorizontalPolygon(material, corners, y1, "up", uv);
    if (caps === "both") this.addHorizontalPolygon(material, corners, y0, "down", uv);
  }

  /** A plan point in the building frame. */
  private toFrame(x: number, z: number): Point {
    return [x * this.frame.cos + z * this.frame.sin, -x * this.frame.sin + z * this.frame.cos];
  }

  /** Horizontal tiling: building-frame meters from the polygon's corner. */
  private planUv(x: number, z: number, origin: Point): [number, number] {
    const [u, v] = this.toFrame(x, z);
    return [u - origin[0], v - origin[1]];
  }

  /** Wall tiling: meters along the face from its first vertex, meters up from its bottom. */
  private faceUv(v: Vec3, start: Vec3, n: Vec3, bottom: number): [number, number] {
    if (Math.abs(n[1]) > 0.9) return this.planUv(v[0], v[2], this.toFrame(start[0], start[2]));
    const tx = n[2], tz = -n[0];
    const len = Math.hypot(tx, tz) || 1;
    return [((v[0] - start[0]) * tx + (v[2] - start[2]) * tz) / len, v[1] - bottom];
  }

  /** Appends every group of `other` after this builder's own, material by material. */
  merge(other: MeshBuilder): void {
    for (const material of other.materials()) {
      const from = other.getGroup(material)!;
      const g = this.group(material);
      const base = g.positions.length / 3;
      for (const v of from.positions) g.positions.push(v);
      for (const v of from.normals) g.normals.push(v);
      for (const v of from.uvs) g.uvs.push(v);
      for (const index of from.indices) g.indices.push(base + index);
    }
  }

  /** Compacts completed geometry while retaining the same read-only contract for validation and IO. */
  seal(): void {
    if (this.sealed) return;
    for (const [material, group] of this.groups) {
      this.groups.set(material, {
        positions: new Float32Array(group.positions),
        normals: new Float32Array(group.normals),
        uvs: new Float32Array(group.uvs),
        indices: new Uint32Array(group.indices),
      });
    }
    this.sealed = true;
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
