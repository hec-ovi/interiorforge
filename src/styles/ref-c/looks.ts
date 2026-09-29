/** Material slots of kind C, the poor building of capsule homes, grouped by look so a module
 *  names its look and never a raw key. Every key resolves in the Materials theme today;
 *  where a reference wants a worn or dedicated surface, the closest published key stands in
 *  until Materials publishes it (then only this table changes). */
export const C = {
  // capsule plates: H10 ivory enamel, Japantown warm cream, service returns and liners
  ivory: 'cyberpunk/interior-capsule-enamel/mid#ivory',
  cream: 'cyberpunk/ivory-panel/mid#native',
  amber: 'cyberpunk/interior-capsule-enamel/mid#amber',
  petrol: 'cyberpunk/interior-capsule-enamel/mid#petrol',
  hex: 'cyberpunk/interior-capsule-hex/mid#field',
  // dark ceilings, joints and liners
  black: 'cyberpunk/paired-cladding-metal/mid#obsidian',
  charcoal: 'cyberpunk/corporate-panel/mid#native',
  graphite: 'cyberpunk/metal/mid#paint',
  teal: 'cyberpunk/residential-service-coating/mid#teal',
  // worn public paint, dado, concrete and service metal
  worn: 'cyberpunk/interior-damaged-wall/poor#field',
  wornFloor: 'cyberpunk/interior-damaged-floor/poor#field',
  wornCeiling: 'cyberpunk/interior-damaged-ceiling/poor#field',
  dado: 'cyberpunk/interior-service-enamel/poor#petrol',
  gunmetal: 'cyberpunk/interior-service-gunmetal/poor#aged',
  steel: 'cyberpunk/interior-damaged-steel/poor#field',
  zinc: 'cyberpunk/metal/poor#zinc',
  ochre: 'cyberpunk/interior-service-vinyl/poor#ochre',
  umber: 'cyberpunk/interior-service-vinyl/poor#umber',
  concrete: 'cyberpunk/concrete/mid#plain',
  // wet rooms
  whiteTile: 'cyberpunk/tile/poor#1',
  slabTile: 'cyberpunk/tile/mid#slab',
  mosaic: 'cyberpunk/tile/mid#mosaic',
  ceramic: 'cyberpunk/interior-ceramic/mid#glaze',
  mirror: 'cyberpunk/interior-mirror/mid#silver',
  // lenses, screens, signage
  lamp: 'cyberpunk/light-fixture/poor#lamp',
  strip: 'cyberpunk/light-fixture/poor#strip',
  cool: 'cyberpunk/light-fixture/mid#strip',
  cyan: 'cyberpunk/interior-led-cyan/mid#plain',
  screen: 'cyberpunk/ad-screen/poor#noir-cyan',
  art: 'cyberpunk/corporate-screen/mid#native',
  grille: 'cyberpunk/ac-unit/poor#grille',
  paper: 'cyberpunk/interior-paper/poor#plain',
  cardboard: 'cyberpunk/prop-cardboard/poor#kraft',
  fabric: 'cyberpunk/fabric/mid#flat',
  glass: 'cyberpunk/interior-display-glass/rich#clear',
} as const;
