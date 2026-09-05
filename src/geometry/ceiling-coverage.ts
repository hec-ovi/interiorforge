import type { Point } from "../core/geom.js";
import { PolygonCoverage } from "./polygon-coverage.js";

/** Finished ceilings own their exposed plane. Concrete soffits retain only the uncovered
 *  area at that same exported height, including service rooms and changing floor plates. */
export class CeilingCoverage {
  private readonly planes = new Map<number, PolygonCoverage>();

  add(polygon: Point[], elevation: number): void {
    const key = Math.fround(elevation);
    const coverage = this.planes.get(key) ?? new PolygonCoverage();
    coverage.add(polygon);
    this.planes.set(key, coverage);
  }

  exposed(polygon: Point[], elevation: number): Point[][] {
    return this.planes.get(Math.fround(elevation))?.exposed(polygon) ?? [polygon];
  }
}
