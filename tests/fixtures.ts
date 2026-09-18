import type { InteriorRequest } from '../src/index.js';
/** Exterior remains a runtime contract dependency, outside this box's TypeScript build. */
export async function assembly(family: 'mirror-frame' | 'corporate-sectors' = 'mirror-frame',
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
