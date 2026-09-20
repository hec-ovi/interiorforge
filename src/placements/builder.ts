import { InteriorError } from '../core/errors.js';
import { MeshBuilder, type Vec3 } from '../glb/mesh-builder.js';
import { moduleRecipes } from '../modules/recipes.js';
import type { Placement } from './types.js';
const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
export class PlacementBuilder {
    readonly placements: Placement[] = [];
    readonly mesh = new MeshBuilder();
    module(module: string, room: string, position: Vec3, scale: Vec3 = [1, 1, 1], rotationY = 0, extra: Partial<Pick<Placement, 'id' | 'opening'>> = {}): Placement {
        if (scale.some(n => !Number.isFinite(n) || n <= 0) || position.some(n => !Number.isFinite(n))) {
            throw new InteriorError('E_SHELL_BREACH', `invalid transform for ${module}`);
        }
        // A module wears tile-unit UVs, so a stretched placement repeats them by the same
        // factor: u along local x, v along local y where the piece stands up, along local z
        // where it lies flat. Unstretched pieces publish nothing.
        const repeat: [number, number] = [scale[0], scale[1] !== 1 ? scale[1] : scale[2]].map(clean) as [number, number];
        const placement: Placement = {
            id: `module:${this.placements.length}`, module, room,
            position: position.map(clean) as Vec3, rotationY: clean(rotationY), scale: scale.map(clean) as Vec3,
            ...(repeat[0] !== 1 || repeat[1] !== 1 ? { uvRepeat: repeat } : {}), ...extra
        };
        this.placements.push(placement);
        const recipe = recipes.get(module);
        if (!recipe)
            throw new Error(`unknown module ${module}`);
        const c = Math.cos(placement.rotationY), s = Math.sin(placement.rotationY);
        const point = (p: ArrayLike<number>, i: number): Vec3 => {
            const x = p[i]! * placement.scale[0], y = p[i + 1]! * placement.scale[1], z = p[i + 2]! * placement.scale[2];
            return [x * c + z * s + placement.position[0], y + placement.position[1], z * c - x * s + placement.position[2]];
        };
        // Clearance sees the same authored vertices and transforms as the consumer.
        for (const key of recipe.mesh.materials()) {
            const group = recipe.mesh.getGroup(key)!;
            for (let i = 0; i < group.indices.length; i += 6) {
                const ids = [group.indices[i]!, group.indices[i + 1]!, group.indices[i + 2]!, group.indices[i + 5]!];
                this.mesh.addQuad(key, ids.map(index => point(group.positions, index * 3)) as [
                    Vec3,
                    Vec3,
                    Vec3,
                    Vec3
                ]);
            }
        }
        return placement;
    }
}
export const clean = (n: number) => Math.round(n * 1e9) / 1e9;
