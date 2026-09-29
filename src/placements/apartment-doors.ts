import { doorHeadHeight } from '../geometry/walls.js';
import { placementRecipe } from './builder.js';
import { apartmentEntrances, apartmentSlots, type ApartmentEntrance } from '../styles/luxury/apartment-doors.js';
import type { GeneratedInterior, Placement } from './types.js';
import { carveApartmentPockets } from './apartment-pockets.js';
import { capsuleApartmentEntrances } from '../styles/capsule/apartment-doors.js';
import { damagedApartmentEntrances } from '../styles/damaged/apartment-doors.js';
import type { FloorInterior } from '../core/types.js';

/** Per-floor identities stay outside shared layouts. Only the apartment programme
 * produces private dwelling entrances; hotel, office and internal room doors retain
 * their own semantics. The current authored assembly is the luxury entrance kit. */
export function publishApartmentEntrances(result: GeneratedInterior): void {
  const residential = result.building.floors.filter(entry => {
    const floor = result.layouts[entry.layout]!.floor;
    return ['apartment', 'residence_studio'].includes(floor.kind) && floor.mezzanineOf === undefined;
  }).sort((a,b)=>a.index-b.index);
  const slots = apartmentSlots(residential.map(entry => numberedRooms(result.layouts[entry.layout]!.floor)));
  const displayOffset = residential.some(entry => entry.index === 0) ? 1 : 0;
  // A shared layout is carved once; the entrances it could carve hold on every floor using it.
  const carved = new Map<string, Set<string>>();
  for (const entry of residential) {
    const layout = result.layouts[entry.layout]!, floor = layout.floor;
    const numbered = apartmentEntrances(numberedRooms(floor), entry.index + displayOffset, slots,
      Math.round(doorHeadHeight(1, floor.ceilingElevation - floor.elevation) * 1e6) / 1e6);
    if (!carved.has(entry.layout)) carved.set(entry.layout, carveApartmentPockets(numbered, layout.placements, floor.rooms));
    const entrances = numbered.filter(entrance => carved.get(entry.layout)!.has(entrance.id));
    fitApartmentNumberplates(entrances, layout.placements);
    if (entrances.length) entry.apartmentEntrances = result.building.tier === 'poor' ? damagedApartmentEntrances(entrances)
      : result.building.tier === 'mid' ? capsuleApartmentEntrances(entrances) : entrances;
  }
}

/** A duplex upper slice belongs to its lower numbered dwelling. Other homes and
 * the shared corridor/core on that same storey retain their ordinary entrances. */
function numberedRooms(floor: FloorInterior) {
  const upper = new Set((floor.duplexes ?? []).filter(slice => slice.level === 'upper').map(slice => slice.unit));
  return floor.rooms.filter(room => !room.unit || !upper.has(room.unit));
}

/** Fit to actual opaque partition faces, not a guessed wall thickness. A plate
 * needs its entire width/height supported beyond a jamb; try the other side if a
 * corner or another doorway consumes the latch-side span, and leave the plate out
 * where neither side has one. Small panel joints are
 * allowed, glass and the deeper backing behind panels are not mounting surfaces. */
export function fitApartmentNumberplates(entrances: ApartmentEntrance[], placements: readonly Placement[]): void {
  if (!entrances.length) return;
  for (const entrance of entrances) {
    const [hx, , hz] = entrance.leaves[0]!.position, yaw = entrance.leaves[0]!.rotationY;
    const along = [Math.cos(yaw), -Math.sin(yaw)], inward = entrance.inward;
    const planes = new Map<number, [number, number][]>();
    for (const placement of placements) {
      const module = placement.module;
      // Only the loft's flat panel is a new mounting plane; its decorative ribs
      // and inlays do not become support merely because they share a prefix.
      if (placement.room !== entrance.corridorRoom || !module
        || !(/^wall-(field|panel|meridian)/.test(module) || module === 'loft1702-wall-panel')) continue;
      if (/glass|mirror|backing|skirting|line|light/.test(module)) continue;
      const recipe = placementRecipe(module);
      if (!recipe || recipe.mesh.materials().some(slot => /glass|mirror/.test(slot))) continue;
      // Every partition face's +Z points into its owner room.
      if (Math.sin(placement.rotationY) * inward[0] + Math.cos(placement.rotationY) * inward[1] > -0.999) continue;
      const y0 = placement.position[1] - recipe.origin[1] * placement.scale[1];
      const y1 = y0 + recipe.size[1] * placement.scale[1];
      if (y0 > 1.59 || y1 < 1.73) continue;
      const c = Math.cos(placement.rotationY), s = Math.sin(placement.rotationY);
      const xs: number[] = [], zs: number[] = [];
      for (const x of [-recipe.origin[0], recipe.size[0] - recipe.origin[0]]) {
        for (const z of [-recipe.origin[2], recipe.size[2] - recipe.origin[2]]) {
          const wx = placement.position[0] + c * x * placement.scale[0] + s * z * placement.scale[2] - hx;
          const wz = placement.position[2] - s * x * placement.scale[0] + c * z * placement.scale[2] - hz;
          xs.push(wx * along[0]! + wz * along[1]!); zs.push(wx * inward[0] + wz * inward[1]);
        }
      }
      const face = Math.round(Math.min(...zs) * 10000) / 10000;
      if (Math.abs(face) > 0.2) continue;
      if (!planes.has(face)) planes.set(face, []);
      planes.get(face)!.push([Math.min(...xs), Math.max(...xs)]);
    }
    let mounted: { x: number; z: number } | undefined;
    for (const x of [entrance.width + 0.26, -0.26]) {
      for (const [face, spans] of [...planes].sort((a, b) => a[0] - b[0])) {
        const sorted = spans.sort((a, b) => a[0] - b[0]);
        let reached = x - 0.158;
        for (const [a, b] of sorted) if (a <= reached + 0.005 && b > reached) reached = b;
        if (reached >= x + 0.158) { mounted = { x, z: face - 0.0065 }; break; }
      }
      if (mounted) break;
    }
    // A doorway with no opaque span beside it keeps its number in the record and stands
    // no plate: a plate never hangs on glass or in the air, and never costs the building.
    if (!mounted) {
      entrance.fixed = entrance.fixed.filter(part => !/^apartment-(numberplate|digit)/.test(part.module));
      continue;
    }
    const old = entrance.fixed[0]!.position;
    const target = [hx + along[0]! * mounted.x + inward[0] * mounted.z,
      hz + along[1]! * mounted.x + inward[1] * mounted.z];
    const dx = target[0]! - old[0], dz = target[1]! - old[2];
    for (const part of entrance.fixed) if (/^apartment-(numberplate|digit)/.test(part.module)) {
      part.position[0] += dx; part.position[2] += dz;
    }
  }
}
