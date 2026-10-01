import { InteriorError } from '../../core/errors.js';
import type { Point } from '../../core/geom.js';
import type { UvRect } from '../uv.js';
import { subtractRect } from '../../placements/thresholds.js';

/** A private two-storey section in its own planning frame. Room packing is a
 * separate pass: no room, furniture or area is silently discarded to fit it. */
export interface DuplexSection {
  /** A stair against the unit's low or high side wall (a composed loft's); absent, the type C
   *  stair in the middle of the unit. */
  stairWall?: 'low' | 'high';
  width: number;
  depth: number;
  pitch: number;
  lowerArea: number;
  upperArea: number;
  grossArea: number;
  loungeVoids: UvRect[];
  stairOpening: UvRect;
  upperSlabs: UvRect[];
  stair: {
    risers: number;
    risersPerFlight: number;
    rise: number;
    tread: number;
    flightWidth: number;
    clearWidth: number;
    turnLanding: UvRect;
    turnElevation: number;
    lowerEntry: Point;
    upperEntry: Point;
    /** Walking boxes exclude the upper floor and the intermediate landing. */
    steps: (UvRect & { top: number; flight: 0 | 1 })[];
    route: [number, number, number][];
  };
}

export interface DuplexSectionInput {
  width?: number;
  depth?: number;
  pitch: number;
  /** Default is the type C 38 m² lounge and 12 m² stair opening. */
  loungeVoidArea?: number;
  stairOpeningDepth?: number;
  /** Stand the stair against the unit's low or high side wall, the double-height lounge across
   *  the back of the unit from it, as a composed loft (Apartment 1702) has it. */
  stairWall?: 'low' | 'high';
}

/** The 15×10 / 150+100 m² type C is feasible with a 3.0–3.6 m pitch.
 * At higher pitches callers must explicitly enlarge the stair opening and
 * accept the reported upper-area change. Entry/arrival landings occupy the
 * private circulation before the opening; neither is an upper public exit. */
export function planDuplexSection(input: DuplexSectionInput): DuplexSection {
  const { pitch } = input;
  const width = input.width ?? 15, depth = input.depth ?? 10;
  const loungeArea = input.loungeVoidArea ?? 38;
  const openingDepth = input.stairOpeningDepth ?? 4;
  if (![width, depth, pitch, loungeArea, openingDepth].every(Number.isFinite)
    || width < 15 || depth < 10 || pitch < 3 || loungeArea < 30) {
    throw new InteriorError('E_ASSIGNMENT_INVALID', 'duplex section needs a finite plate of at least 15×10 m, 3 m pitch and a meaningful double-height lounge');
  }
  const risers = Math.ceil(pitch / .18 / 2) * 2, risersPerFlight = risers / 2;
  const rise = pitch / risers, tread = .3, run = (risersPerFlight - 1) * tread;
  const turnDepth = openingDepth - run;
  if (turnDepth < 1.3 - 1e-8) {
    const needed = Math.ceil((run + 1.3) * 2) / 2;
    throw new InteriorError('E_ASSIGNMENT_INVALID', `${pitch.toFixed(2)} m duplex pitch cannot fit a 3×${openingDepth.toFixed(2)} m stair opening with 0.30 m treads and a 1.30 m clear turn; opening depth must be at least ${needed.toFixed(2)} m`);
  }
  const wall = input.stairWall;
  const x = wall === 'low' ? 0 : wall === 'high' ? width - 3 : width - 9, z = 2;
  const stairOpening: UvRect = { u: x, v: z, lu: 3, lv: openingDepth };
  let loungeVoids: UvRect[];
  if (wall) {
    // The wall stair rises along the side wall to a mezzanine walkway at least 3 m deep; the
    // double-height lounge spans the back of the unit from the stair's wall to a 4 m strip of
    // upper rooms on the other side.
    const rearDepth = Math.min(6, depth - (z + openingDepth) - 3);
    loungeVoids = [{ u: wall === 'low' ? 0 : 4, v: depth - rearDepth, lu: width - 4, lv: rearDepth }];
    if (rearDepth < 3 || (width - 4) * rearDepth < 30) {
      throw new InteriorError('E_ASSIGNMENT_INVALID', 'a wall-stair loft needs room for a 3 m mezzanine walkway and a double-height lounge of 30 m²; enlarge the unit allocation');
    }
  } else {
    // A small return preserves the exact 38 m² budget on the planning grid:
    // canonical 9×4 m rear void plus a 2×1 m return. It leaves two genuine
    // 2 m approach routes beside the central stair and a connected upper gallery.
    const rearDepth = (loungeArea - 2) / (x + 3);
    loungeVoids = [
      { u: 0, v: depth - rearDepth, lu: x + 3, lv: rearDepth },
      { u: 0, v: depth - rearDepth - 1, lu: 2, lv: 1 },
    ];
    if (loungeVoids[1]!.v < 4.5 || z + openingDepth > loungeVoids[0]!.v + 1e-8) {
      throw new InteriorError('E_ASSIGNMENT_INVALID', 'duplex openings leave less than the required front gallery or rear habitable floor; enlarge the unit allocation');
    }
  }
  const turnLanding: UvRect = { u: x, v: z + run, lu: 3, lv: turnDepth };
  const flightWidth = 1.45;
  const steps: DuplexSection['stair']['steps'] = [];
  const route: DuplexSection['stair']['route'] = [[x + .75, 0, z - .8]];
  for (let step = 0; step < risersPerFlight - 1; step++) {
    const rect = { u: x + .025, v: z + step * tread, lu: flightWidth, lv: tread,
      top: (step + 1) * rise, flight: 0 as const };
    steps.push(rect); route.push([x + .75, rect.top, rect.v + tread / 2]);
  }
  route.push([x + .75, pitch / 2, z + run + turnDepth / 2],
    [x + 2.25, pitch / 2, z + run + turnDepth / 2]);
  for (let step = 0; step < risersPerFlight - 1; step++) {
    const rect = { u: x + 1.525, v: z + run - (step + 1) * tread, lu: flightWidth, lv: tread,
      top: pitch / 2 + (step + 1) * rise, flight: 1 as const };
    steps.push(rect); route.push([x + 2.25, rect.top, rect.v + tread / 2]);
  }
  const upperEntry: Point = [x + 2.25, z - .8];
  route.push([upperEntry[0], pitch, upperEntry[1]]);
  const whole = { u: 0, v: 0, lu: width, lv: depth };
  let upperSlabs = [whole];
  for (const hole of [...loungeVoids, stairOpening]) upperSlabs = upperSlabs.flatMap(rect => subtractRect(rect, hole));
  const lowerArea = width * depth;
  const upperArea = upperSlabs.reduce((area, rect) => area + rect.lu * rect.lv, 0);
  return { ...(wall ? { stairWall: wall } : {}), width, depth, pitch, lowerArea, upperArea, grossArea: lowerArea + upperArea,
    loungeVoids, stairOpening, upperSlabs,
    stair: { risers, risersPerFlight, rise, tread, flightWidth, clearWidth: 1.32,
      turnLanding, turnElevation: pitch / 2, lowerEntry: [x + .75, z - .8], upperEntry, steps, route } };
}
