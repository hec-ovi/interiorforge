import type { AssetFamily } from "./types.js";

export interface SourcePlan {
  id: string;
  sourceFile: string;
  family: AssetFamily;
  styles: string[];
  targetHeight?: number;
  provider: "Sketchfab" | "Poly Haven";
  title?: string;
  author?: string;
}

const sketchfab = (sourceFile: string, family: AssetFamily, styles: string[], targetHeight?: number): SourcePlan => ({
  id: `sketchfab-${sourceFile.replace(/\.glb$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  sourceFile: `sketchfab/${sourceFile}`,
  family,
  styles,
  targetHeight,
  provider: "Sketchfab",
});

export const SOURCE_PLAN: SourcePlan[] = [
  sketchfab("animal_crossing_new_horizons_trash_bags.glb", "prop", ["damaged", "game", "poor", "residential", "trash"], 0.55),
  sketchfab("bed_1.glb", "bed", ["contemporary", "residential"]),
  sketchfab("container_low.glb", "storage", ["industrial"]),
  sketchfab("dirty_toilet.glb", "toilet", ["damaged", "industrial", "poor"], 0.9),
  sketchfab("elegant_black_office_desk.glb", "desk", ["contemporary", "high_rich", "luxury", "office", "rich"], 0.76),
  sketchfab("file_shelf.glb", "shelf", ["mid", "office", "retro"], 1.9),
  sketchfab("flexispot_office_chair.glb", "chair", ["contemporary", "office"]),
  sketchfab("free_ac_unit.glb", "appliance", ["industrial"]),
  sketchfab("fridgemodern.glb", "appliance", ["contemporary", "residential"], 1.8),
  sketchfab("furniture__no-29.glb", "chair", ["contemporary", "high_rich", "luxury", "rich"], 1.05),
  sketchfab("futuristic_bluish_sofa.glb", "sofa", ["capsule", "sci-fi"], 0.85),
  sketchfab("futuristic_glossy_white_chair.glb", "chair", ["capsule", "sci-fi"], 0.95),
  sketchfab("heavy_duty_dumpster.glb", "storage", ["industrial"]),
  sketchfab("ikea_cabinet.glb", "storage", ["contemporary", "residential"], 1.2),
  sketchfab("jack_daniels.glb", "prop", ["restaurant", "retro"]),
  sketchfab("laptop.glb", "prop", ["contemporary", "office"], 0.22),
  sketchfab("maple_tree.glb", "planter", ["contemporary", "natural"], 1.5),
  sketchfab("mattress.glb", "bed", ["poor", "residential"], 0.25),
  sketchfab("modern_entertainment_center_free.glb", "storage", ["contemporary", "residential"], 1.8),
  sketchfab("modern_gray_sofa__3d_model.glb", "sofa", ["contemporary", "mid", "residential"], 0.85),
  sketchfab("modern_toilet.glb", "toilet", ["contemporary", "residential"], 0.8),
  sketchfab("office_chair.glb", "chair", ["mid", "office"], 1.05),
  sketchfab("old_leather_office_chair.glb", "chair", ["damaged", "luxury", "office", "retro", "rich"], 1.1),
  sketchfab("realistic_bed_3d_model.glb", "bed", ["contemporary", "residential", "rich"]),
  sketchfab("reception_table_scifi.glb", "desk", ["sci-fi"]),
  sketchfab("red_oil_barrel_-_cc0.glb", "prop", ["industrial"]),
  sketchfab("retro_lowpoly_bed.glb", "bed", ["damaged", "poor", "residential", "retro"], 0.8),
  sketchfab("sci-_fi_bed.glb", "bed", ["capsule", "sci-fi"], 0.8),
  sketchfab("sci-fi_furniture_pack_aaa_shelving_unit_c.glb", "shelf", ["capsule", "industrial", "sci-fi"], 2),
  sketchfab("sci_fi_3_chair.glb", "bench", ["capsule", "sci-fi"], 0.95),
  sketchfab("scifi_desk.glb", "desk", ["capsule", "sci-fi"], 0.75),
  sketchfab("sinkbathroom.glb", "sink", ["contemporary", "residential"], 0.9),
  sketchfab("sinkbathroom2.glb", "sink", ["contemporary", "rich"]),
  sketchfab("soda_dispenser.glb", "appliance", ["restaurant"], 0.55),
  sketchfab("table.glb", "table", ["office", "residential"], 0.75),
  sketchfab("tandem_seating_-_hospital.glb", "bench", ["hospital", "office"], 0.9),
  sketchfab("tree_3d_model_fir_spruce_pine.glb", "planter", ["natural"]),
  sketchfab("unbranded_conventional_fridge.glb", "appliance", ["poor", "residential"], 1.8),
  sketchfab("whiskey_glass.glb", "prop", ["restaurant"], 0.12),
  {
    id: "polyhaven-school-chair-01", sourceFile: "polyhaven/SchoolChair_01/SchoolChair_01_1k.gltf",
    family: "chair", styles: ["institutional", "mid", "office", "poor"], provider: "Poly Haven",
    title: "School Chair 01", author: "Ethan Place",
  },
  {
    id: "polyhaven-metal-office-desk", sourceFile: "polyhaven/metal_office_desk/metal_office_desk_1k.gltf",
    family: "desk", styles: ["industrial", "mid", "office"], provider: "Poly Haven",
    title: "Metal Office Desk", author: "Ulan Cabanilla",
  },
  {
    id: "polyhaven-sofa-01", sourceFile: "polyhaven/Sofa_01/Sofa_01_1k.gltf",
    family: "sofa", styles: ["mid", "residential", "retro"], provider: "Poly Haven",
    title: "Sofa 01", author: "Kirill Sannikov",
  },
  {
    id: "polyhaven-potted-plant-02", sourceFile: "polyhaven/potted_plant_02/potted_plant_02_1k.gltf",
    family: "planter", styles: ["contemporary", "high_rich", "luxury", "mid", "natural", "office", "residential", "rich"], provider: "Poly Haven",
    title: "Potted Plant 02", author: "Rico Cilliers",
  },
];
