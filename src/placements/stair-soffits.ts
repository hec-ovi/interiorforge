import { placementRecipe } from './builder.js';
import { stairWallLayer, stairWallSkinId } from '../modules/recipes/stair-wall-skins.js';
import type { BuildingManifest, FloorPlacement, LayoutMap, Placement } from './types.js';

const isSoffit = (placement: Placement): boolean => (placement.module?.startsWith('stair-soffit-') ?? false)
    && /^stair-[ab]$/.test(placement.connector ?? placement.room);

/** A stair's ceiling face belongs to the space below it. Publish those surfaces
 * through existing per-floor treatments so an upward view retains the next
 * flight's soffit without loading its furnished floor. Walking tops, risers and
 * guards stay on their own floor; each face is emitted exactly once. */
export function publishStairSoffits(floors: BuildingManifest['floors'], layouts: LayoutMap<Pick<FloorPlacement, 'placements'>>): void {
    const ordered = [...floors].sort((a, b) => a.index - b.index);
    if (!ordered.length) return;
    // Collect before removing: several floor references can reuse one layout.
    const source = new Map(Object.entries(layouts).map(([id, layout]) => [id, layout.placements.filter(isSoffit)]));
    for (let i = 1; i < ordered.length; i++) {
        const upper = ordered[i]!, owner = ordered[i - 1]!, rise = upper.elevation - owner.elevation;
        const pieces = source.get(upper.layout) ?? [];
        if (!pieces.length) continue;
        owner.treatments ??= [];
        for (const piece of pieces) owner.treatments.push({ ...structuredClone(piece),
            id: `core-soffit:${upper.index}:${piece.id}`,
            position: [piece.position[0], piece.position[1] + rise, piece.position[2]],
        });
    }
    // The next wall's finish is part of the enclosure visible above a return
    // flight. Retain its opaque body locally for views from higher landings,
    // and hand off a uniquely authored front skin to the lower floor.
    const wallSource = new Map(Object.entries(layouts).map(([id, layout]) => [id, layout.placements.filter(p =>
        /^stair-[ab]$/.test(p.connector ?? p.room) && !!p.module && !!placementRecipe(stairWallSkinId(p.module))
    ).map(p => structuredClone(p))]));
    for (let i = 1; i < ordered.length; i++) {
        const upper = ordered[i]!, owner = ordered[i - 1]!, rise = upper.elevation - owner.elevation;
        for (const piece of wallSource.get(upper.layout) ?? []) {
            owner.treatments ??= [];
            owner.treatments.push({ ...piece, id: `core-wall-skin:${upper.index}:${piece.id}`,
                module: stairWallSkinId(piece.module!),
                position: [piece.position[0], piece.position[1] + rise, piece.position[2]],
            });
        }
    }
    const ground = ordered[0]!.layout;
    for (const [id, layout] of Object.entries(layouts)) if (id !== ground) {
        const ids = new Set((wallSource.get(id) ?? []).map(p => p.id));
        for (const piece of layout.placements) if (ids.has(piece.id)) {
            const { back, bodyScale } = stairWallLayer(placementRecipe(piece.module!)!);
            const oldScale = piece.scale[2], scale = oldScale * bodyScale;
            const shift = back * (oldScale - scale);
            piece.position[0] += Math.sin(piece.rotationY) * shift;
            piece.position[2] += Math.cos(piece.rotationY) * shift;
            piece.scale[2] = scale;
        }
    }
    for (const [id, layout] of Object.entries(layouts)) {
        if (id !== ground) layout.placements = layout.placements.filter(placement => !isSoffit(placement));
    }
}
