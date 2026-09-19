import type { BuildingType, FixtureOptions, FloorAssignment, FurnitureKind, RoomKind, Tier } from "../../index.js";
import type { AppParams } from "../app-state.js";

/** A review camera: in front of a piece of furniture, or in a room of one kind. */
export interface SampleView {
  title: string;
  floor: number;
  /** stand off this furniture kind of this width */
  furniture?: FurnitureKind;
  width?: number;
  /** or stand in the largest room of this kind */
  room?: RoomKind;
  /** metres from the piece in its own frame (x across, z in front), or from the room centre in world */
  offset: [number, number];
  /** degrees off the line back to the piece, or a world heading in a room */
  heading: number;
}

export interface PreviewSample {
  title: string;
  /** a fabricated fixture, or */
  fixture?: FixtureOptions & AppParams;
  assignments?: FloorAssignment[];
  /** a published kit plan under the shared resources root, generated as this building */
  plan?: string;
  building?: { id: string; type: BuildingType; tier: Tier };
  views: SampleView[];
}
