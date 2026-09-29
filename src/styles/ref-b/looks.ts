import type { RecipeSet } from '../../modules/recipes.js';

/** Material slots of kind B, the rich glass building, grouped by look so every module names
 *  a look and never a raw key. Every key resolves in the Materials theme today. */
export const B_LOOK = {
    /** smoked walnut veneer: the B3 living and study fields, bar carcass */
    smoked: 'cyberpunk/corpo-plaza-veneer/rich#smoked',
    /** warm walnut: timber upper of the lobby, screens, soffits */
    walnut: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
    /** dark polished stone: living floor, bar top, lobby lower course */
    stone: 'cyberpunk/corpo-plaza-stone/rich#polished',
    /** white marble with grey veins: bathrooms, loft stone */
    marble: 'cyberpunk/loft1702-stone/rich#pale',
    /** honed lobby stone */
    honed: 'cyberpunk/meridian-lobby-stone/rich#honed',
    /** pale timber: floor borders round the living planks */
    oak: 'cyberpunk/interior-luxury-timber/rich#field',
    /** dark wide planks: bedrooms */
    plank: 'cyberpunk/wood/high_rich#2',
    /** charcoal leather-like wall field (bedroom) */
    charcoal: 'cyberpunk/gutierrez-lacquer/rich#ink',
    /** glossy dark ceiling field */
    gloss: 'cyberpunk/gutierrez-lacquer/rich#ink',
    gold: 'cyberpunk/exterior-accent-gold/mid#coat',
    bronze: 'cyberpunk/interior-bronze/rich#plain',
    black: 'cyberpunk/paired-cladding-metal/mid#obsidian',
    glass: 'cyberpunk/corpo-plaza-glass/rich#clear',
    lensWarm: 'cyberpunk/light-fixture/rich#strip',
    lensAmber: 'cyberpunk/light-fixture/rich#corpo-amber',
    lensRed: 'cyberpunk/light-fixture/rich#loft-red',
} as const;

/** Warm white of the B coves and step lines. */
export const B_WARM = 2900;

/** A recipe set whose flat pieces (a single-face backing, a soffit or a fascia plane) gain
 *  a hidden back face 1 mm behind, so every module publishes a size above zero on each
 *  axis, as the module schema requires. Visible faces are unchanged. */
export const thickened = (set: RecipeSet): RecipeSet => add => set((id, draw) => add(id, k => {
    draw(k);
    const slots = k.mesh.materials();
    if (!slots.length) return;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const slot of slots) {
        const p = k.mesh.getGroup(slot)!.positions;
        for (let i = 0; i < p.length; i++) { min[i % 3] = Math.min(min[i % 3]!, p[i]!); max[i % 3] = Math.max(max[i % 3]!, p[i]!); }
    }
    const slot = slots[0]!, [x0, y0, z0] = min as [number, number, number], [x1, y1, z1] = max as [number, number, number];
    if (y1 - y0 < 1e-6) k.box(slot, [x0, y1, z0], [Math.max(x1 - x0, 1e-3), .001, Math.max(z1 - z0, 1e-3)], undefined, ['top']);
    else if (z1 - z0 < 1e-6) k.box(slot, [x0, y0, z0 - .001], [Math.max(x1 - x0, 1e-3), y1 - y0, .001], undefined, ['south']);
    else if (x1 - x0 < 1e-6) k.box(slot, [x0 - .001, y0, z0], [.001, y1 - y0, Math.max(z1 - z0, 1e-3)], undefined, ['west']);
}));
