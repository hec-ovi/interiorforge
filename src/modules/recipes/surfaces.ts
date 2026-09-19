import { FINISH } from "../finishes.js";
import type { RecipeSet } from "../recipes.js";

/** Wall, floor and ceiling pieces. A wall piece stands with its back on the partition line
 *  (z = 0) and faces +z into its room; corners and edges stand 0.08 proud, fields sit in
 *  the recess. Floor slabs hang below y = 0 with a dark underlay showing in the seams.
 *  Ceiling pieces rise from the ceiling plane at y = 0; the band hangs to the plane and
 *  the fields sit 0.04 higher, so the band reads as the fitted outer frame. */
export const surfaceRecipes: RecipeSet = (add) => {
  const frames = { timber: FINISH.timber, steel: FINISH.steel } as const;
  const panelFields = { ivory: FINISH.ivory, dark: FINISH.dark, slate: FINISH.slate, capsule: FINISH.capsuleWall } as const;
  const plainFields = { ...panelFields, damaged: FINISH.damagedWall, steel: FINISH.zinc } as const;
  for (const [name, slot] of Object.entries(frames)) {
    add(`wall-panel-corner-${name}`, (k) => k.cbox(slot, [0, 0, 0.04], [0.5, 0.5, 0.08]));
    add(`wall-panel-edge-${name}`, (k) => k.cbox(slot, [0, 0, 0.04], [0.5, 0.5, 0.08], "unit"));
  }
  for (const [name, slot] of Object.entries(panelFields)) {
    add(`wall-panel-field-${name}`, (k) => k.cbox(slot, [0, 0, -0.0125], [0.5, 0.5, 0.035], "unit", ["north", "south"]));
  }
  add("wall-panel-field-glass", (k) => k.cbox(FINISH.glass, [0, 0, 0], [0.5, 0.5, 0.012], "unit", ["north", "south"]));
  for (const [name, slot] of Object.entries(plainFields)) {
    add(`wall-field-${name}`, (k) => k.cbox(slot, [0, 0, 0.04], [0.5, 0.5, 0.08], "unit"));
  }

  const slabs = {
    stone: FINISH.stone, obsidian: FINISH.obsidian, marble: FINISH.marble, plank: FINISH.plank,
    capsule: FINISH.capsuleFloor, damaged: FINISH.damagedFloor, steel: FINISH.damagedSteel,
  } as const;
  for (const [name, slot] of Object.entries(slabs)) {
    add(`floor-slab-${name}`, (k) => {
      k.cbox(FINISH.black, [0, -0.15, 0], [0.5, 0.13, 0.5], "unit", ["top"]);
      k.cbox(slot, [0, -0.02, 0], [0.488, 0.02, 0.488], "unit", ["top", "north", "south", "east", "west"]);
    });
  }
  add("floor-carpet", (k) => k.cbox(FINISH.carpet, [0, 0, 0], [0.5, 0.012, 0.5], "unit"));

  const ceilings = {
    light: FINISH.ceilingLight, dark: FINISH.ceilingDark, capsule: FINISH.capsuleCeiling,
    damaged: FINISH.damagedCeiling, steel: FINISH.zinc,
  } as const;
  const noTop = ["bottom", "north", "south", "east", "west"] as const;
  for (const [name, slot] of Object.entries(ceilings)) {
    add(`ceiling-field-${name}`, (k) => k.cbox(slot, [0, 0.04, 0], [0.5, 0.06, 0.5], "unit", noTop));
  }
  for (const [name, slot] of Object.entries(frames)) {
    add(`ceiling-band-${name}`, (k) => k.cbox(slot, [0, 0, 0], [0.5, 0.12, 0.5], "unit", noTop));
  }
  // exposed services under a worn soffit: two pipes and a cable tray along the run
  add("ceiling-services", (k) => {
    for (const z of [-0.14, 0.14]) k.rod(FINISH.damagedSteel, [-0.25, 0.14, z], [0.25, 0.14, z], 0.09);
    k.cbox(FINISH.zinc, [0, 0.19, 0], [0.5, 0.05, 0.16], "unit");
    for (const x of [-0.2, 0.2]) k.rod(FINISH.damagedSteel, [x, 0.24, -0.2], [x, 0.24, 0.2], 0.03);
  });
};
