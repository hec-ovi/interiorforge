import { MeshBuilder, type Vec3 } from '../../glb/mesh-builder.js';
import type { ModuleRecipe } from '../types.js';
import type { RecipeSet } from '../recipes.js';

export const stairWallSkinId = (id: string): string => `stair-wall-skin-${id}`;
export const stairWallLayer = (recipe: ModuleRecipe) => {
    const depth = recipe.size[2], recess = Math.min(.001, depth / 4);
    return { back: -recipe.origin[2], bodyScale: 1 - 2 * recess / depth, skinScale: 1 - recess / depth };
};

/** A real front finish and its closed rear surface. The wall body remains local;
 * this finish belongs to the landing below, which can see it before its floor
 * streams in. The 1 mm cavity prevents coincident body/finish faces. Front UVs
 * and relief are copied exactly from the authored wall, rather than retiled.
 * Only fields a stair wall can wear get one: `skip` names the plain-looking pieces of
 * panel systems (backings, fills, bands), which stair walls never stand as. */
export function stairWallSkins(recipes: readonly ModuleRecipe[], add: Parameters<RecipeSet>[0], skip: (id: string) => boolean = () => false): void {
    for (const recipe of recipes) {
        if (!(/^(wall-field-|wall-meridian-skirting$)/.test(recipe.id)) || skip(recipe.id) || recipe.size[2] <= .00001
            || recipe.mesh.materials().some(slot => /glass|\/light-fixture\//.test(slot))) continue;
        add(stairWallSkinId(recipe.id), kit => {
            const { back, skinScale } = stairWallLayer(recipe), copied = new MeshBuilder();
            const rear = (p: Vec3): Vec3 => [p[0], p[1], back + (p[2] - back) * skinScale];
            for (const material of recipe.mesh.materials()) {
                const group = recipe.mesh.getGroup(material)!;
                const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
                const edges = new Map<string, { count: number; a: Vec3; b: Vec3 }>();
                const key = (p: Vec3) => p.map(n => Math.round(n * 1e8)).join(',');
                for (let i = 0; i < group.indices.length; i += 3) {
                    const vertices = [group.indices[i]!, group.indices[i + 1]!, group.indices[i + 2]!];
                    const points = vertices.map(v => Array.from(group.positions.slice(v * 3, v * 3 + 3)) as Vec3);
                    const [a, b, c] = points as [Vec3, Vec3, Vec3];
                    // Only the outward, room-facing skin. Side caps belong to
                    // its boundary and are generated below, without internal seams.
                    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12) continue;
                    for (const reversed of [false, true]) {
                        const base = positions.length / 3;
                        for (let j = 0; j < 3; j++) {
                            const v = vertices[j]!, p = points[j]!;
                            positions.push(...(reversed ? rear(p) : p));
                            let nx = group.normals[v * 3]!, ny = group.normals[v * 3 + 1]!, nz = group.normals[v * 3 + 2]!;
                            if (reversed) { nx = -nx; ny = -ny; nz = -nz / skinScale; }
                            const length = Math.hypot(nx, ny, nz) || 1;
                            normals.push(nx / length, ny / length, nz / length);
                            uvs.push(group.uvs[v * 2]!, group.uvs[v * 2 + 1]!);
                        }
                        indices.push(base, base + (reversed ? 2 : 1), base + (reversed ? 1 : 2));
                    }
                    for (let j = 0; j < 3; j++) {
                        const a = points[j]!, b = points[(j + 1) % 3]!, id = [key(a), key(b)].sort().join('|');
                        const edge = edges.get(id);
                        if (edge) edge.count++;
                        else edges.set(id, { count: 1, a, b });
                    }
                }
                if (indices.length) copied.addSurface(material, { positions, normals, uvs, indices });
                for (const { count, a, b } of edges.values()) if (count === 1)
                    kit.mesh.addQuad(material, [b, a, rear(a), rear(b)]);
            }
            kit.mesh.merge(copied);
        });
    }
}
