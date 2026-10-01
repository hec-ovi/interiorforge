import type { BuildingType, FloorKind, InteriorRequest } from '../src/index.js';
/** Exterior remains a runtime contract dependency, outside this box's TypeScript build. */
export async function assembly(family: 'mirror-frame' | 'mirror-shutters' | 'corporate-sectors' = 'mirror-frame',
    dimensions?: { width: number; depth: number; floors: number }): Promise<InteriorRequest> {
    const entry = new URL('../../exterior/src/index.ts', import.meta.url).href;
    const { planAssembly } = await import(entry);
    const size = family === 'mirror-frame' ? 40 : 56, floors = dimensions?.floors ?? (family === 'mirror-frame' ? 6 : 12);
    const { blueprint } = planAssembly({ buildingId: family, family, seed: 'interior-proof',
        lot: { width: dimensions?.width ?? size, depth: dimensions?.depth ?? size }, floors });
    return {
        seed: 'interior-proof', building: { id: family, type: family === 'mirror-frame' ? 'residential' : 'corpo', tier: 'mid' },
        blueprint, materialTheme: 'cyberpunk', ...(family === 'corporate-sectors' ? { assignments: blueprint.floors.map((f: {
                index: number;
            }) => ({ floor: f.index, kind: f.index === 0 ? 'lobby' : 'corpo_office' })) } : {})
    };
}

/** What each parcel type holds at street level and above it, written out independently of
 *  the table the generator reads. */
export const PROGRAM: Record<BuildingType, { ground: FloorKind[]; upper: FloorKind[] }> = {
    residential: { ground: ['lobby'], upper: ['apartment', 'residence_studio'] },
    hotel: { ground: ['lobby'], upper: ['hotel_rooms'] },
    offices: { ground: ['lobby'], upper: ['office'] },
    corpo: { ground: ['lobby'], upper: ['corpo_office'] },
    hospital: { ground: ['lobby'], upper: ['office'] },
    clinic: { ground: ['lobby'], upper: ['office'] },
    police: { ground: ['lobby'], upper: ['office'] },
    military: { ground: ['lobby'], upper: ['office'] },
    factory: { ground: ['mechanical'], upper: ['mechanical'] },
    mall: { ground: ['mall_floor'], upper: ['mall_floor'] },
    commerce: { ground: ['retail'], upper: ['office'] },
    restaurant: { ground: ['restaurant'], upper: ['office'] },
    coffee_shop: { ground: ['coffee_shop'], upper: ['office'] },
};
