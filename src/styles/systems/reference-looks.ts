/** Material slots of the reference built-ins, grouped per look so a module names its look
 *  and never a raw key. Every key resolves in the Materials theme today; where a reference
 *  wants a dedicated surface, the look names the closest published one until Materials
 *  publishes it (then only this table changes). */
export const LOOK = {
  black: 'cyberpunk/paired-cladding-metal/mid#obsidian',
  bronze: 'cyberpunk/interior-bronze/rich#plain',
  gold: 'cyberpunk/exterior-accent-gold/mid#coat',
  glass: 'cyberpunk/interior-display-glass/rich#clear',
  soil: 'cyberpunk/garden-soil/mid#surface',
  leaf: 'cyberpunk/interior-leaf/rich#plain',
  stem: 'cyberpunk/garden-stem/mid#surface',
  lensCool: 'cyberpunk/light-fixture/mid#strip',
  lensWarm: 'cyberpunk/light-fixture/rich#strip',
  lensPoor: 'cyberpunk/light-fixture/poor#strip',
  lensRed: 'cyberpunk/light-fixture/rich#loft-red',
  /** emissive, unlit: glows without a light record */
  glowCyan: 'cyberpunk/interior-led-cyan/mid#plain',
  // kind A, E1 suite: warm cream moulded panels, cool grey service housings, tan splash
  e1Cream: 'cyberpunk/ivory-panel/rich#meridian-satin',
  e1Housing: 'cyberpunk/ivory-panel/mid#cool-grey',
  e1Splash: 'cyberpunk/interior-luxury-wall/rich#field',
  e1Steel: 'cyberpunk/interior-alloy/rich#brushed',
  /** the dark diamond mesh of the E1 housings: baked lattice bars over a black void */
  e1Mesh: 'cyberpunk/metal/mid#paint',
  e1IslandTop: 'cyberpunk/corpo-plaza-veneer/rich#smoked',
  e1Caustic: 'cyberpunk/interior-led-cyan/mid#plain',
  e1Screen: 'cyberpunk/ad-screen/rich#noir-amber',
  e1Panel: 'cyberpunk/corporate-screen/mid#native',
  e1Shelf: 'cyberpunk/wood/high_rich#1',
  // kind A, E2 public floor: dark lacquer and bronze
  e2Lacquer: 'cyberpunk/interior-composite/rich#satin',
  // kind B, B3 apartment: smoked walnut, gold trims, polished stone
  b3Walnut: 'cyberpunk/corpo-plaza-veneer/rich#smoked',
  b3Stone: 'cyberpunk/corpo-plaza-stone/rich#polished',
  b3Screen: 'cyberpunk/ad-screen/high_rich#premium-soda',
  b2Timber: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
  // kind C, capsule homes and the poor building
  cEnamel: 'cyberpunk/interior-capsule-enamel/mid#ivory',
  cPetrol: 'cyberpunk/interior-capsule-enamel/mid#petrol',
  cGunmetal: 'cyberpunk/interior-service-gunmetal/poor#aged',
  cGrille: 'cyberpunk/ac-unit/poor#grille',
  cLaminate: 'cyberpunk/interior-service-vinyl/poor#ochre',
  cScreen: 'cyberpunk/ad-screen/poor#noir-cyan',
  // kind R, R1 office: ink lacquer, walnut shelving, bronze
  r1Ink: 'cyberpunk/gutierrez-lacquer/rich#ink',
  r1Walnut: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
} as const;
