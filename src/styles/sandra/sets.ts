import type { Blueprint, InteriorRequest } from '../../core/types.js';

/** Sandra's source documents no confirmed exterior: these are compatible pairings,
 * never claims that either shell recreates the source apartment's building. */
export const SANDRA_BUILDING_SETS = [
  { id: 'sandra-serviced-40', architecture: 'residential-serviced', width: 40, depth: 40, floors: 6 },
  { id: 'sandra-paired-60', architecture: 'paired-rounded', width: 60, depth: 40, floors: 6 },
] as const;
export type SandraBuildingSet = typeof SANDRA_BUILDING_SETS[number];

export function sandraExteriorRequest(set: SandraBuildingSet) {
  const { id, architecture, width, depth, floors } = set;
  return { buildingId: id, seed: `sandra-detail:${id}`, theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [width, 0], [width, depth], [0, depth]], accessPoint: [width / 2, 0],
      maxHeight: floors * 4.5, buildingGrid: { origin: [0, 0], angle: 0, spacing: 0.5 } },
    building: { type: 'residential', tier: 'mid', floors },
    options: { architecture, glb: 'merged', minimumClearHeight: 4, balconies: 'off',
      facadeServices: 'off', roofArtifacts: 'off', adScreens: 'off', fireEscape: 'off', signage: null },
  };
}

export function sandraInteriorRequest(set: SandraBuildingSet, blueprint: Blueprint): InteriorRequest {
  return { seed: `sandra-detail:${set.id}`, building: { id: set.id, type: 'residential', tier: 'mid', interiorStyle: 'sandra-dorsett' },
    blueprint, materialTheme: 'cyberpunk', assignments: blueprint.floors.map(floor => ({ floor: floor.index, kind: floor.index === 0 ? 'lobby' : 'apartment' })) };
}
