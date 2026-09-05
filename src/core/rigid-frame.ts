import type { Point } from "./geom.js";

/** Metre-preserving source coordinates, rotated and translated into world coordinates. */
export class RigidFrame2D {
  readonly origin: Point;
  readonly cos: number;
  readonly sin: number;

  constructor(readonly angleDeg: number, origin: Point = [0, 0]) {
    this.origin = [...origin];
    const radians = angleDeg * Math.PI / 180;
    this.cos = Math.cos(radians);
    this.sin = Math.sin(radians);
  }

  toLocal([x, z]: Point): Point {
    const dx = x - this.origin[0], dz = z - this.origin[1];
    return [dx * this.cos + dz * this.sin, -dx * this.sin + dz * this.cos];
  }

  toWorld([u, v]: Point): Point {
    return [u * this.cos - v * this.sin + this.origin[0], u * this.sin + v * this.cos + this.origin[1]];
  }
}
