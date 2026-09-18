import { MeshBuilder } from '../glb/mesh-builder.js';
import type { Vector3 } from './types.js';
export interface ModuleRecipe {
    id: string;
    mesh: MeshBuilder;
    size: Vector3;
    origin: Vector3;
}
const key = (kind: string) => `cyberpunk/${kind}/mid`;
/** Origins are authored at the module attachment point, in metres. */
export function moduleRecipes(): ModuleRecipe[] {
    const recipes: ModuleRecipe[] = [];
    const add = (id: string, draw: (mesh: MeshBuilder) => void) => {
        const mesh = new MeshBuilder();
        draw(mesh);
        mesh.seal();
        const min: Vector3 = [Infinity, Infinity, Infinity], max: Vector3 = [-Infinity, -Infinity, -Infinity];
        for (const slot of mesh.materials()) {
            const p = mesh.getGroup(slot)!.positions;
            for (let i = 0; i < p.length; i++) {
                const k = i % 3;
                min[k] = Math.min(min[k]!, p[i]!);
                max[k] = Math.max(max[k]!, p[i]!);
            }
        }
        const clean = (v: number) => Math.round(v * 1e6) / 1e6;
        recipes.push({
            id, mesh, size: max.map((v, i) => clean(v - min[i]!)) as Vector3,
            origin: min.map(v => clean(-v)) as Vector3
        });
    };
    const box = (m: MeshBuilder, kind: string, x: number, y: number, z: number, w: number, h: number, d: number) => m.addBox(key(kind), { x, z, w, d }, y, y + h);
    add('wall-segment', m => box(m, 'plaster', -.25, 0, -.05, .5, .5, .1));
    add('floor-tile', m => box(m, 'tile', -.25, -.15, -.25, .5, .15, .5));
    add('ceiling-tile', m => box(m, 'plaster', -.25, 0, -.25, .5, .1, .5));
    add('door-frame', m => {
        box(m, 'metal', -.58, 0, -.07, .08, 2.5, .14);
        box(m, 'metal', .5, 0, -.07, .08, 2.5, .14);
        box(m, 'metal', -.58, 2.5, -.07, 1.16, .08, .14);
    });
    add('window-return', m => {
        box(m, 'plaster', -.27, -.02, 0, .02, .54, .5);
        box(m, 'plaster', .25, -.02, 0, .02, .54, .5);
        box(m, 'plaster', -.25, -.02, 0, .5, .02, .5);
        box(m, 'plaster', -.25, .5, 0, .5, .02, .5);
    });
    // The flight family retains physical tread depth while accommodating each riser count.
    for (let n = 7; n <= 14; n++)
        add(`stair-flight-${n}`, m => {
            for (let i = 0; i < n; i++) {
                box(m, 'concrete', 0, (i + 1) * .17 - .15, i * .28, 1.45, .15, .28);
                for (const x of [.025, 1.375])
                    box(m, 'metal', x, (i + 1) * .17, i * .28 + .12, .05, 1, .04);
            }
            for (const x of [0, 1.4]) {
                const a = 1 + .17, b = 1 + n * .17;
                m.addQuad(key('metal'), [[x, a, 0], [x, b, n * .28], [x + .05, b, n * .28], [x + .05, a, 0]]);
                m.addQuad(key('metal'), [[x + .05, a - .05, 0], [x + .05, b - .05, n * .28], [x, b - .05, n * .28], [x, a - .05, 0]]);
                m.addQuad(key('metal'), [[x, a - .05, 0], [x, b - .05, n * .28], [x, b, n * .28], [x, a, 0]]);
                m.addQuad(key('metal'), [[x + .05, a, 0], [x + .05, b, n * .28], [x + .05, b - .05, n * .28], [x + .05, a - .05, 0]]);
            }
        });
    add('lift-car', m => {
        box(m, 'metal', -1, -.1, -1, 2, .1, 2);
        box(m, 'metal', -1, 0, -1, .08, 2.5, 2);
        box(m, 'metal', .92, 0, -1, .08, 2.5, 2);
        box(m, 'metal', -.92, 0, .92, 1.84, 2.5, .08);
        box(m, 'metal', -1, 2.5, -1, 2, .1, 2);
    });
    add('lift-doors', m => {
        box(m, 'elevator_door', -.55, 0, -.03, .545, 2.2, .06);
        box(m, 'elevator_door', .005, 0, -.03, .545, 2.2, .06);
    });
    add('ceiling-led-strip', m => {
        box(m, 'metal', -.5, 0, -.04, 1, .06, .08);
        box(m, 'light-fixture', -.48, -.005, -.03, .96, .005, .06);
    });
    add('wall-decoration-frame', m => {
        box(m, 'metal', -.5, 0, -.025, 1, .5, .05);
        box(m, 'plaster', -.46, .04, -.03, .92, .42, .005);
    });
    return recipes;
}
