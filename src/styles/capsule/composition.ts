import type { Point } from '../../core/geom.js';
import type { FurnitureKind } from '../../core/types.js';
import type { EdgeName, PlanFurniture, PlanRoom } from '../../layout/plan-types.js';
import { roomArea, roomCoversRect, roomEdges } from '../../layout/room-shape.js';
import type { UvRect } from '../../layout/uv.js';

export type ResidentialCompositionProfile = 'h10' | 'japantown' | 'sandra-dorsett' | 'damaged';
type Turn = 0 | 90 | 180 | 270;
export type ResidentialPiece = Pick<PlanFurniture, 'kind' | 'at' | 'size' | 'rotationDeg' | 'elevation'>;
interface Recipe { id: string; span: [number, number]; pieces: ResidentialPiece[] }
export interface ResidentialComposition { reservation: UvRect; pieces: ResidentialPiece[]; carpet?: UvRect; recipe: string }
const piece = (kind: FurnitureKind, at: Point, size: [number, number, number], rotationDeg: Turn = 0, elevation?: number): ResidentialPiece =>
  ({ kind, at, size, rotationDeg, ...(elevation === undefined ? {} : { elevation }) });

/** H10/Japantown's seating wraps a low table and faces media, with storage at
 * the side. Furniture is authored at canonical size; the room supplies the bay.
 * The same interfaces admit Sandra's timber joinery and the worn lodging kit. */
const CORNER: Recipe = { id: 'corner', span: [4.5, 4.4], pieces: [
  piece('display_screen', [0, -2.20], [1.2, .08, .7], 0, 1.35),
  piece('sofa', [.40, 1.50], [1.8, .85, .8], 180),
  piece('sofa', [-1.60, .12], [1.8, .85, .8], 90),
  piece('low_table', [.30, .10], [.9, .5, .4]),
  piece('shelf', [1.60, -.80], [1.8, .5, 2], 270),
] };
const LINEAR: Recipe = { id: 'linear', span: [3.0, 3.9], pieces: [
  piece('display_screen', [0, -1.95], [1.2, .08, .7], 0, 1.35),
  piece('sofa', [0, 1.34], [1.8, .85, .8], 180),
  piece('low_table', [0, -.05], [.9, .5, .4]),
  piece('shelf', [1.14, -.64], [1.8, .5, 2], 270),
] };
const LINEAR_OPEN: Recipe = { id: 'linear-open', span: [3.0, 3.9], pieces: LINEAR.pieces.filter(item => item.kind !== 'shelf') };
const CORNER_OPEN: Recipe = { id: 'corner-open', span: [4.5, 4.4], pieces: CORNER.pieces.filter(item => item.kind !== 'shelf') };

/** Try whole groups against real wall segments and polygons. A concave room's
 * long bounding box never turns its two-metre entry arm into a living bay. */
export function fitResidentialComposition(room: PlanRoom, bounds: UvRect, profile: ResidentialCompositionProfile,
  accepts: (reservation: UvRect, pieces: readonly ResidentialPiece[]) => boolean): ResidentialComposition | null {
  // The worn dwelling's separate wardrobe supplies domestic storage. Keep its
  // arrival and seating open instead of installing a tall utility rack across it.
  const recipes = profile === 'damaged' ? [LINEAR_OPEN, CORNER_OPEN, LINEAR, CORNER] : [CORNER, CORNER_OPEN, LINEAR, LINEAR_OPEN];
  for (const recipe of recipes) {
    const candidates: { rect: UvRect; rotation: Turn; score: number }[] = [];
    for (const edge of roomEdges(room)) {
      if (!edge.edge) continue;
      const rotation = edge.edge === 'v0' ? 0 : edge.edge === 'u0' ? 90 : edge.edge === 'v1' ? 180 : 270;
      const horizontal = edge.edge.startsWith('v'), along = horizontal ? 0 : 1, cross = 1 - along;
      const lo = Math.min(edge.a[along]!, edge.b[along]!), hi = Math.max(edge.a[along]!, edge.b[along]!);
      if (hi - lo < 1.5) continue;
      const boundLow = horizontal ? bounds.u : bounds.v, boundHigh = boundLow + (horizontal ? bounds.lu : bounds.lv);
      // Exact bay ends matter alongside the quarter-metre search: a doorway
      // can leave a legal last position between two sampling phases.
      const centres = new Set([lo + .8, hi - .8, (lo + hi) / 2,
        lo + recipe.span[0] / 2, hi - recipe.span[0] / 2,
        boundLow + recipe.span[0] / 2, boundHigh - recipe.span[0] / 2]);
      for (let value = lo + .8; value < hi - .8; value += .25) centres.add(value);
      const direction = edge.edge.endsWith('0') ? 1 : -1;
      for (const centre of centres) {
        const middle: Point = [0, 0]; middle[along] = centre;
        middle[cross] = edge.a[cross]! + direction * (recipe.span[1] / 2 + .1);
        const [width, depth] = horizontal ? recipe.span : [recipe.span[1], recipe.span[0]];
        const rect = { u: middle[0] - width! / 2, v: middle[1] - depth! / 2, lu: width!, lv: depth! };
        if (rect.u < bounds.u - 1e-6 || rect.v < bounds.v - 1e-6 || rect.u + rect.lu > bounds.u + bounds.lu + 1e-6
          || rect.v + rect.lv > bounds.v + bounds.lv + 1e-6 || !roomCoversRect(room, rect)) continue;
        const score = Math.abs(centre - (lo + hi) / 2) * .2
          + Math.hypot(middle[0] - bounds.u - bounds.lu / 2, middle[1] - bounds.v - bounds.lv / 2) * .05;
        candidates.push({ rect, rotation, score });
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.rotation - b.rotation || a.rect.u - b.rect.u || a.rect.v - b.rect.v);
    for (const { rect: reservation, rotation } of candidates) {
      const centre: Point = [reservation.u + reservation.lu / 2, reservation.v + reservation.lv / 2];
      const pieces = recipe.pieces.map(item => {
        const [x, z] = rotate(item.at, rotation);
        return { ...item, at: [centre[0] + x, centre[1] + z] as Point, size: [...item.size] as [number, number, number],
          rotationDeg: ((item.rotationDeg + rotation) % 360) as Turn };
      });
      if (!accepts(reservation, pieces)) continue;
      // Sandra's bordered mat is already architectural floor; do not cover it
      // with an unrelated rug. Other profiles retain the same clear floor here.
      return { reservation, pieces, recipe: recipe.id };
    }
  }
  return null;
}

export interface ResidentialCompositionPlacer {
  residentialComposition(profile: ResidentialCompositionProfile): boolean;
  compositionDiagnostics?(): unknown;
  wallPiece(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  anyEdge(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  center(kind: FurnitureKind): PlanFurniture | null;
  workstation(): PlanFurniture | null;
}

export function furnishResidentialComposition(room: PlanRoom, p: ResidentialCompositionPlacer,
  profile: ResidentialCompositionProfile): boolean {
  if (room.kind !== 'living' || !room.unit) return false;
  // The complete sofa/table/media bay at its real dimensions first; a living room
  // too tight for it keeps the plain seating that fits its own clearances.
  if (!p.residentialComposition(profile)) {
    if (roomArea(room) >= 10) {
      p.anyEdge('sofa');
      p.center('low_table');
    }
    p.wallPiece('display_screen');
  }
  if (roomArea(room) >= 38) p.workstation();
  p.wallPiece('wall_art');
  return true;
}

function rotate([u, v]: Point, rotation: Turn): Point {
  return rotation === 0 ? [u, v] : rotation === 90 ? [v, -u] : rotation === 180 ? [-u, -v] : [-v, u];
}
