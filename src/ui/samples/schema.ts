import type { FixtureOptions, FloorAssignment, FurnitureKind } from "../../index.js";
import type { AppParams } from "../app-state.js";

export interface PreviewSample {
  title: string;
  fixture: FixtureOptions & AppParams;
  assignments: FloorAssignment[];
  assets: boolean;
  views: { title: string; floor: number; furniture: FurnitureKind; width: number; offset: [number, number]; heading: number }[];
}
