/** Material slots the shared modules wear: `theme/kind/tier#variant`, every one an entry the
 *  Materials theme publishes. The frame, field, floor and ceiling finishes of one look are
 *  grouped so a module names its look, never a raw key. */
export const FINISH = {
  // luxury: walnut frames, ivory travertine and dark ribbed timber fields, stone floors
  timber: "cyberpunk/interior-luxury-timber/rich#field",
  ivory: "cyberpunk/interior-luxury-wall/rich#field",
  dark: "cyberpunk/wood/high_rich#1",
  slate: "cyberpunk/wall/high_rich#plain",
  stone: "cyberpunk/interior-luxury-floor/rich#field",
  obsidian: "cyberpunk/tile/high_rich#slab",
  marble: "cyberpunk/tile/rich#slab",
  plank: "cyberpunk/wood/high_rich#2",
  carpet: "cyberpunk/carpet/high_rich#1",
  fabric: "cyberpunk/fabric/high_rich#flat",
  linen: "cyberpunk/ivory-panel/mid#native",
  ceilingLight: "cyberpunk/interior-luxury-ceiling/rich#field",
  ceilingDark: "cyberpunk/ceiling/rich#plain",
  bronze: "cyberpunk/interior-bronze/rich#plain",
  black: "cyberpunk/paired-cladding-metal/mid#obsidian",
  glass: "cyberpunk/interior-display-glass/rich#clear",
  chrome: "cyberpunk/facade-chrome/mid#native",
  leaf: "cyberpunk/interior-leaf/rich#plain",
  soil: "cyberpunk/garden-soil/mid#surface",
  stem: "cyberpunk/garden-stem/mid#surface",
  fish: "cyberpunk/interior-fish/rich#plain",
  screen: "cyberpunk/ad-screen/rich#noir-amber",
  art: "cyberpunk/corporate-screen/mid#native",
  // lit lenses: the engine builds every light-fixture key as a lit diffuser
  lensWarm: "cyberpunk/light-fixture/rich#strip",
  lensCool: "cyberpunk/light-fixture/mid#strip",
  lensPoor: "cyberpunk/light-fixture/poor#strip",
  ledCyan: "cyberpunk/interior-led-cyan/mid#plain",
  // capsule: fitted technical panels and steel frames
  steel: "cyberpunk/metal/mid#paint",
  zinc: "cyberpunk/metal/mid#zinc",
  capsuleWall: "cyberpunk/interior-capsule-wall/mid#field",
  capsuleCeiling: "cyberpunk/interior-capsule-ceiling/mid#field",
  capsuleFloor: "cyberpunk/interior-capsule-floor/mid#field",
  hatch: "cyberpunk/interior-capsule-hatch/mid#face",
  // damaged and industrial: worn surfaces, exposed services
  damagedWall: "cyberpunk/interior-damaged-wall/poor#field",
  damagedCeiling: "cyberpunk/interior-damaged-ceiling/poor#field",
  damagedFloor: "cyberpunk/interior-damaged-floor/poor#field",
  damagedSteel: "cyberpunk/interior-damaged-steel/poor#field",
  patch: "cyberpunk/interior-damaged-patch/poor#face",
  paper: "cyberpunk/interior-paper/poor#plain",
  leafDry: "cyberpunk/interior-leaf-dry/poor#plain",
  cardboard: "cyberpunk/prop-cardboard/poor#kraft",
  // core
  concrete: "cyberpunk/concrete/mid#plain",
  casing: "cyberpunk/metal/rich#paint",
  liftDoor: "cyberpunk/elevator_door/rich#split",
  liftCar: "cyberpunk/metal/rich#zinc",
  reveal: "cyberpunk/plaster/rich#plain",
} as const;

export type Finish = (typeof FINISH)[keyof typeof FINISH];
