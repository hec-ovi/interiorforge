import { FINISH } from "../finishes.js";
import type { Kit } from "../kit.js";
import type { RecipeSet } from "../recipes.js";

/** Panel system, metres. Every frame cell is the same box in the same material; what makes
 *  the nine slices read is the shadow gap between them, cut into each piece so no placement
 *  scale can stretch it: a corner is short in both axes, a rail in its height, a stile in
 *  its width, and the piece that runs the length keeps the full cell there. The field is
 *  the backing all of them stand on, so a gap shows field and never a hole. */
const REVEAL = 0.012;
const CELL = 0.5;
const FIELD = 0.02;
const FRAME = 0.095;

/** Wall, floor and ceiling pieces. A wall piece stands with its back on the partition line
 *  (z = 0) and faces +z into its room. Floor slabs hang below y = 0. Ceiling pieces rise
 *  from the ceiling plane at y = 0; the band hangs to the plane and the fields sit 0.04
 *  higher, so the band reads as the fitted outer frame. */
export const surfaceRecipes: RecipeSet = (add) => {
  const frames = { timber: FINISH.timber, steel: FINISH.steel, ivory: FINISH.ivory, graphite: FINISH.black } as const;
  const panelFields = { ivory: FINISH.ivory, dark: FINISH.dark, slate: FINISH.slate, capsule: FINISH.capsuleWall,
    mineral: FINISH.mineral, charcoal: FINISH.charcoal, graphite: FINISH.graphite } as const;
  const plainFields = { ...panelFields, damaged: FINISH.damagedWall, steel: FINISH.zinc } as const;
  const member = (slot: string, width: number, height: number) => (k: Kit) =>
    k.cbox(slot, [0, (CELL - height) / 2, FRAME / 2], [width, height, FRAME]);
  for (const [name, slot] of Object.entries(frames)) {
    add(`wall-panel-corner-${name}`, member(slot, CELL - 2 * REVEAL, CELL - 2 * REVEAL));
    add(`wall-panel-rail-${name}`, member(slot, CELL, CELL - 2 * REVEAL));
    add(`wall-panel-stile-${name}`, member(slot, CELL - 2 * REVEAL, CELL));
  }
  for (const [name, slot] of Object.entries(panelFields)) {
    add(`wall-panel-field-${name}`, (k) => k.cbox(slot, [0, 0, FIELD / 2], [CELL, CELL, FIELD]));
  }
  add("wall-panel-field-glass", (k) => k.cbox(FINISH.glass, [0, 0, 0.006], [CELL, CELL, 0.012], undefined, ["north", "south"]));
  for (const [name, slot] of Object.entries(plainFields)) {
    add(`wall-field-${name}`, (k) => k.cbox(slot, [0, 0, FRAME / 2], [CELL, CELL, FRAME]));
  }

  const slabs = {
    stone: FINISH.stone, obsidian: FINISH.obsidian, marble: FINISH.marble, plank: FINISH.plank,
    capsule: FINISH.capsuleFloor, damaged: FINISH.damagedFloor, steel: FINISH.damagedSteel,
  } as const;
  for (const [name, slot] of Object.entries(slabs)) {
    // the finish wears the walking surface and the screed below carries the edges; the tile
    // pattern comes from the map at its own metre size, never from a scaled geometric joint
    add(`floor-slab-${name}`, (k) => {
      k.cbox(FINISH.black, [0, -0.15, 0], [CELL, 0.15, CELL], undefined, ["north", "south", "east", "west"]);
      k.cbox(FINISH.concrete, [0, -0.15, 0], [CELL, 0.15, CELL], undefined, ["bottom"]);
      k.cbox(slot, [0, -0.02, 0], [CELL, 0.02, CELL], undefined, ["top"]);
    });
  }
  add("floor-carpet", (k) => k.cbox(FINISH.carpet, [0, 0, 0], [CELL, 0.012, CELL]));

  const ceilings = {
    light: FINISH.ceilingLight, dark: FINISH.ceilingDark, capsule: FINISH.capsuleCeiling,
    damaged: FINISH.damagedCeiling, steel: FINISH.zinc,
  } as const;
  const noTop = ["bottom", "north", "south", "east", "west"] as const;
  for (const [name, slot] of Object.entries(ceilings)) {
    add(`ceiling-field-${name}`, (k) => k.cbox(slot, [0, 0.04, 0], [CELL, 0.06, CELL], undefined, noTop));
  }
  for (const [name, slot] of Object.entries(frames)) {
    add(`ceiling-band-${name}`, (k) => k.cbox(slot, [0, 0, 0], [CELL, 0.12, CELL], undefined, noTop));
  }
  // exposed services under a worn soffit: two pipes and a cable tray along the run
  add("ceiling-services", (k) => {
    for (const z of [-0.14, 0.14]) k.rod(FINISH.damagedSteel, [-0.25, 0.14, z], [0.25, 0.14, z], 0.09);
    k.cbox(FINISH.zinc, [0, 0.19, 0], [CELL, 0.05, 0.16]);
    for (const x of [-0.2, 0.2]) k.rod(FINISH.damagedSteel, [x, 0.24, -0.2], [x, 0.24, 0.2], 0.03);
  });
};
