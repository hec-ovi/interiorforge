import type { Point } from "../../core/geom.js";
import { MeshBuilder, type UvFrame, type UvMode, type Vec3 } from "../../glb/mesh-builder.js";

type Vertex = { position: Vec3; uv: Point };

/** Routes a structural surface into its two slab bands without adding a cut face. */
export class ElevationSplitMesh extends MeshBuilder {
  constructor(
    private readonly lower: MeshBuilder,
    private readonly upper: MeshBuilder,
    private readonly elevation: number,
    private readonly axes: UvFrame,
    private readonly grid: Point,
  ) { super(axes, grid); }

  override addQuad(material: string, vertices: [Vec3, Vec3, Vec3, Vec3], uv: UvMode = "world"): void {
    const target = this.target(vertices);
    if (target) { target.addQuad(material, vertices, uv); return; }
    const face = new MeshBuilder(this.axes, this.grid);
    face.addQuad(material, vertices, uv);
    const uvs = face.getGroup(material)!.uvs;
    this.addQuadUv(material, vertices, vertices.map((_, i): Point => [uvs[i * 2]!, uvs[i * 2 + 1]!]) as [Point, Point, Point, Point]);
  }

  override addQuadUv(material: string, vertices: [Vec3, Vec3, Vec3, Vec3], uvs: readonly [Point, Point, Point, Point]): void {
    const target = this.target(vertices);
    if (target) { target.addQuadUv(material, vertices, uvs); return; }
    const polygon = vertices.map((position, i) => ({ position, uv: uvs[i]! }));
    emitPolygon(this.lower, material, clip(polygon, this.elevation, false));
    emitPolygon(this.upper, material, clip(polygon, this.elevation, true));
  }

  override addHorizontalPolygon(material: string, polygon: readonly Point[], y: number, facing: "up" | "down", uv: UvMode = "world"): void {
    (y >= this.elevation ? this.upper : this.lower).addHorizontalPolygon(material, polygon, y, facing, uv);
  }

  private target(vertices: readonly Vec3[]): MeshBuilder | undefined {
    if (vertices.every(vertex => vertex[1] >= this.elevation)) return this.upper;
    if (vertices.every(vertex => vertex[1] <= this.elevation)) return this.lower;
    return undefined;
  }
}

function mix(a: Vertex, b: Vertex, t: number): Vertex {
  return {
    position: a.position.map((value, i) => value + (b.position[i]! - value) * t) as Vec3,
    uv: a.uv.map((value, i) => value + (b.uv[i]! - value) * t) as Point,
  };
}

function clip(polygon: Vertex[], elevation: number, above: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const ay = a.position[1] - elevation, by = b.position[1] - elevation;
    if (above ? ay >= 0 : ay <= 0) result.push(a);
    if (ay < 0 && by > 0 || ay > 0 && by < 0) {
      const crossing = mix(a, b, ay / (ay - by));
      crossing.position[1] = elevation;
      result.push(crossing);
    }
  }
  return result;
}

function emitPolygon(mesh: MeshBuilder, material: string, polygon: Vertex[]): void {
  if (polygon.length < 3) return;
  if (polygon.length === 4) {
    mesh.addQuadUv(material, polygon.map(vertex => vertex.position) as [Vec3, Vec3, Vec3, Vec3],
      polygon.map(vertex => vertex.uv) as [Point, Point, Point, Point]);
    return;
  }
  for (let i = 1; i < polygon.length - 1; i++) {
    const triangle = [polygon[0]!, polygon[i]!, polygon[i + 1]!];
    const center = mix(mix(triangle[0]!, triangle[1]!, .5), triangle[2]!, 1 / 3);
    for (let j = 0; j < 3; j++) {
      const face = [triangle[j]!, mix(triangle[j]!, triangle[(j + 1) % 3]!, .5), center,
        mix(triangle[(j + 2) % 3]!, triangle[j]!, .5)];
      mesh.addQuadUv(material, face.map(vertex => vertex.position) as [Vec3, Vec3, Vec3, Vec3],
        face.map(vertex => vertex.uv) as [Point, Point, Point, Point]);
    }
  }
}
