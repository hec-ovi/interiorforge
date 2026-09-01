import type { FurnitureKind } from "../../core/types.js";
import { MeshBuilder } from "../../glb/mesh-builder.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import type { Frame } from "../../layout/uv.js";
import type { MaterialKeys } from "../materials.js";
import { crate } from "./clutter.js";
import { barCounter, counter, kitchenBlock, receptionDesk } from "./counters.js";
import { gymMachine, plant, shower, sink, toilet } from "./fixtures.js";
import { Placer } from "./placer.js";
import { bed, bench, chair, officeChair, sofa, stool } from "./seating.js";
import { displayRack, fridge, shelf, wallShelf, wardrobe } from "./storage.js";
import { desk, diningTable, lowTable, meetingTable } from "./tables.js";
import { displayScreen, wallArt } from "./wall.js";

type Builder = (p: Placer) => void;

const BUILDERS: Record<FurnitureKind, Builder> = {
  dining_table: diningTable, low_table: lowTable, meeting_table: meetingTable, desk,
  chair, stool, office_chair: officeChair, sofa, bench,
  bed_single: bed, bed_double: bed,
  counter, bar_counter: barCounter, reception_desk: receptionDesk, kitchen_block: kitchenBlock,
  shelf, display_rack: displayRack, wardrobe, fridge, wall_shelf: wallShelf,
  toilet, sink, shower, gym_machine: gymMachine, plant,
  display_screen: displayScreen, wall_art: wallArt, crate,
};

/** Shaped furniture at each planned pose: legs under tables, backs on chairs, panels on
 *  counters, goods on shelves. Wall pieces hang at their own elevation. */
export function emitFurniture(
  mb: MeshBuilder, keys: MaterialKeys, furniture: PlanFurniture[], frame: Frame, elevation: number,
): void {
  for (const item of furniture) {
    const placer = new Placer(mb, keys, frame, item, elevation + (item.elevation ?? 0));
    BUILDERS[item.kind](placer);
  }
}
