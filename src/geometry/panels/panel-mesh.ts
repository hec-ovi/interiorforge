import type { Point } from "../../core/geom.js";
import { clipPolygonToRect, polygonArea, polygonBounds } from "../../core/geom.js";
import { triangulate } from "../../core/triangulate.js";
import { MeshBuilder, type UvFrame, type UvMode, type Vec3 } from "../../glb/mesh-builder.js";
import { PanelPalette } from "./palette.js";
import { panelRegions } from "./regions.js";
import { fitInsert, type FaceInsert } from "./face-parts.js";

/** Geometry owns panel edges. Texture UVs retain physical scale across every cell. */
export class PanelMeshBuilder extends MeshBuilder {
  private wallInsertUsed = false;
  constructor(
    private readonly palette: PanelPalette,
    private readonly axes: UvFrame = { cos: 1, sin: 0 },
    private readonly grid: Point = [0, 0],
  ) { super(axes, grid); }

  override addQuad(material: string, vertices: [Vec3, Vec3, Vec3, Vec3], uv: UvMode = "world"): void {
    const [a, b, c, d] = vertices;
    const width = Math.hypot(d[0] - a[0], d[2] - a[2]);
    const height = b[1] - a[1];
    if (this.palette.role(material) !== "wall" || uv !== "world" || height < 0.5 || width < 0.5
      || Math.hypot(b[0] - a[0], b[2] - a[2], c[1] - b[1], d[1] - a[1]) > 1e-6) {
      super.addQuad(material, vertices, uv); return;
    }
    const [pitch] = this.palette.pitch("wall");
    const count = Math.max(1, Math.floor(width / pitch));
    // Keep end bays at least one metre; a narrow leftover expands the last field.
    const span = pitch;
    const point = (x: number, y: number): Vec3 => [a[0] + (d[0] - a[0]) * x / width, a[1] + y, a[2] + (d[2] - a[2]) * x / width];
    const artifact = this.palette.artifact();
    const insert: FaceInsert | undefined = !this.wallInsertUsed && artifact && width >= 1.5 && height >= 1.5
      ? { x: 0.25, y: 0.25, width: 1, height: 1, material: artifact } : undefined;
    if (insert) this.wallInsertUsed = true;
    for (let bay = 0; bay < count; bay++) {
      const bayWidth = bay === count - 1 ? width - bay * span : span;
      for (const piece of panelRegions(bayWidth, height, this.palette.data.joint).flatMap(region => fitInsert(region, bay === 0 ? insert : undefined))) {
        const x0 = bay * span + piece.x, x1 = x0 + piece.width, y0 = piece.y, y1 = y0 + piece.height;
        const tex = (x: number, y: number): [number, number] => piece.insert
          ? [(x-piece.insert.x)/piece.insert.width, 1-(y-piece.insert.y)/piece.insert.height] : [x,y];
        super.addQuadUv(piece.insert?.material ?? (piece.joint ? this.palette.trim() : material),
          [point(x0, y0), point(x0, y1), point(x1, y1), point(x1, y0)],
          [tex(x0,y0),tex(x0,y1),tex(x1,y1),tex(x1,y0)]);
      }
    }
  }

  override addHorizontalPolygon(material: string, polygon: readonly Point[], y: number, facing: "up" | "down", uv: UvMode = "world"): void {
    const role = this.palette.role(material);
    if (uv !== "world" || role !== "floor" && role !== "ceiling") {
      super.addHorizontalPolygon(material, polygon, y, facing, uv); return;
    }
    const local = polygon.map(([x,z]): Point => [x*this.axes.cos+z*this.axes.sin, -x*this.axes.sin+z*this.axes.cos]);
    const triangles = triangulate(local).map(indices => indices.map(i => local[i]!));
    const bounds = polygonBounds(local), [px, pz] = this.palette.pitch(role);
    const startX = this.grid[0] + Math.floor((bounds.x-this.grid[0])/px)*px;
    const startZ = this.grid[1] + Math.floor((bounds.z-this.grid[1])/pz)*pz;
    const regions = panelRegions(px, pz, this.palette.data.joint);
    for (let z=startZ; z<bounds.z+bounds.d-1e-8; z+=pz) for (let x=startX; x<bounds.x+bounds.w-1e-8; x+=px) {
      for (const piece of regions) {
        const box = {x:x+piece.x,z:z+piece.y,w:piece.width,d:piece.height};
        for (const triangle of triangles) {
          const clipped = clipPolygonToRect(triangle,box);
          if(clipped.length<3 || Math.abs(polygonArea(clipped))<1e-10) continue;
          const world = clipped.map(([u,v]): Point => [u*this.axes.cos-v*this.axes.sin,u*this.axes.sin+v*this.axes.cos]);
          super.addHorizontalPolygon(piece.joint?this.palette.trim():material,world,y,facing);
        }
      }
    }
  }
}
