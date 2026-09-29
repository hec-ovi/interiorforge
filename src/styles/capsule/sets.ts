import type { Blueprint, InteriorRequest } from '../../core/types.js';

/** Exterior lot dimensions, never a claim about the smaller clear interior plate. */
export const CAPSULE_BUILDING_SETS = [
  { id: 'h10-serviced-40', interiorStyle: 'h10', architecture: 'residential-serviced', width: 40, depth: 40, floors: 6, reference: 'v-h10', connectionFloor: null },
  { id: 'h10-serviced-60', interiorStyle: 'h10', architecture: 'residential-serviced', width: 60, depth: 40, floors: 6, reference: 'v-h10', connectionFloor: null },
  { id: 'japantown-megablock-40', interiorStyle: 'japantown', architecture: 'residential-megablock', width: 40, depth: 40, floors: 6, reference: 'v-japantown', connectionFloor: null },
  { id: 'japantown-megablock-60', interiorStyle: 'japantown', architecture: 'residential-megablock', width: 60, depth: 40, floors: 6, reference: 'v-japantown', connectionFloor: 3 },
] as const;
export type CapsuleBuildingSet = typeof CAPSULE_BUILDING_SETS[number];

/** Explicit .5 m phase and 3 m minimum clear domestic height; Exterior owns actual seats. */
export function capsuleExteriorRequest(set: CapsuleBuildingSet, connection = false, source?: Blueprint) {
  const { id, architecture, width, depth, floors } = set;
  const storey = source?.floors.find(floor => floor.index === set.connectionFloor);
  if (connection && set.connectionFloor !== null && !storey) throw new Error('A connection request needs the actual generated floor geometry');
  const face = storey?.outline.map((a, index) => {
    const b = storey.outline[(index + 1) % storey.outline.length]!;
    return { index, a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  }).filter(edge => Math.abs(edge.a[0] - edge.b[0]) < 1e-6 && edge.b[1] > edge.a[1] && edge.length >= 3)
    .sort((a, b) => b.a[0] - a.a[0] || b.length - a.length)[0];
  if (connection && !face) throw new Error('No straight generated right facade can carry the bridge opening');
  const base = storey?.elevation ?? 0, u = face ? (face.length - 3) / 2 : 0;
  const point = (offset: number): [number, number] => face ? [face.a[0] + (face.b[0] - face.a[0]) * offset / face.length,
    face.a[1] + (face.b[1] - face.a[1]) * offset / face.length] : [0, 0];
  const lo = point(u), hi = point(u + 3);
  return {
    buildingId: id, seed: `capsule-detail:${id}`, theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [width, 0], [width, depth], [0, depth]], accessPoint: [width / 2, 0],
      maxHeight: floors * 4.5, buildingGrid: { origin: [0, 0], angle: 0, spacing: 0.5 } },
    building: { type: 'residential', tier: 'mid', floors },
    options: { architecture, glb: 'merged', minimumClearHeight: 3, preferredFloorHeight: 3.5, balconies: 'off',
      facadeServices: 'off', roofArtifacts: 'off', adScreens: 'off', fireEscape: 'off', signage: null },
    ...(connection && set.connectionFloor !== null ? { apertures: [{
      id: `${id}:connection`, buildingId: id, floor: set.connectionFloor, face: face!.index, kind: 'bridge',
      u, base, width: 3, height: 3, shape: 'rect', linkId: `${id}:reserved-link`,
      cut: { polygon: [[lo[0], base, lo[1]], [hi[0], base, hi[1]], [hi[0], base + 3, hi[1]], [lo[0], base + 3, lo[1]]], axisDir: [1, 0, 0] },
    }] } : {}),
  };
}

export function capsuleInteriorRequest(set: CapsuleBuildingSet, blueprint: Blueprint): InteriorRequest {
  return { seed: `capsule-detail:${set.id}`, building: { id: set.id, type: 'residential', tier: 'mid', interiorStyle: set.interiorStyle },
    blueprint, materialTheme: 'cyberpunk', assignments: blueprint.floors.map(floor => ({
      floor: floor.index, kind: floor.index === 0 ? 'lobby' : 'apartment',
    })) };
}
