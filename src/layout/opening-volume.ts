import type { Opening } from "../core/types.js";
import { WALL } from "./constants.js";

/** Half the partition plus Exterior's required safety space on each side. */
export const PARTITION_HALF = WALL / 2 + 0.02;

export interface OpeningVolume {
  offset: number;
  width: number;
  sill: number;
  height: number;
  depth: number;
}

/** Placement reservation only; doorway connections retain the opening's clear dimensions. */
export function openingVolume(opening: Opening, liningDepth: number): OpeningVolume {
  const cassette = opening.door?.motion?.kind === "pocket" ? opening.door.cassette : undefined;
  const bounds = cassette ?? opening;
  const motionDepth = opening.door?.motion?.clearDepth ?? opening.portal?.clearDepth ?? 0;
  return {
    offset: bounds.offset - PARTITION_HALF,
    width: bounds.width + 2 * PARTITION_HALF,
    sill: bounds.sill,
    height: bounds.height,
    depth: Math.max(liningDepth, motionDepth, cassette?.backDepth ?? 0) + PARTITION_HALF,
  };
}
