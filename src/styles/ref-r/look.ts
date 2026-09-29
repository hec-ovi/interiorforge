/** Material slots of the rich office (r1). Every key resolves in the published theme; where
 *  the office wants a dedicated surface the slot names the closest published one until
 *  Materials publishes it, and then only this table changes. */
export const R1 = {
    /** dark graphite veneer of the broad wall panels, vertical grain */
    graphite: 'cyberpunk/wall-band/rich#graphite',
    /** smooth ink lacquer: casings, desk and drawer carcass faces */
    ink: 'cyberpunk/gutierrez-lacquer/rich#ink',
    /** warm metal of the inlaid wall joints, trims and handles */
    bronze: 'cyberpunk/interior-bronze/rich#plain',
    /** polished brass lining of the layered doorway */
    brass: 'cyberpunk/exterior-accent-gold/mid#coat',
    black: 'cyberpunk/paired-cladding-metal/mid#obsidian',
    /** walnut boards of the floor, shelves and bench frame */
    walnut: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
    /** warm timber of the continuous ceiling */
    ceiling: 'cyberpunk/interior-luxury-timber/rich#field',
    /** figured burl carcass of the drawer chests */
    burl: 'cyberpunk/wood/high_rich#1',
    /** white inset drawer fronts, binders and boxes */
    white: 'cyberpunk/ivory-panel/rich#meridian-satin',
    /** pale blue-grey timber of the pier beside the door */
    pier: 'cyberpunk/district-panel-blue/rich#clean',
    /** navy upholstery of the fixed corner bench */
    navy: 'cyberpunk/meridian-upholstery/rich#navy',
    /** ivory rug under the desk, bronze bound */
    rug: 'cyberpunk/biotechnica-rug/rich#ivory',
    stone: 'cyberpunk/corpo-plaza-stone/rich#polished',
    alloy: 'cyberpunk/interior-alloy/rich#satin-fine',
    glass: 'cyberpunk/interior-display-glass/rich#clear',
    red: 'cyberpunk/light-fixture/rich#loft-red',
    lens: 'cyberpunk/light-fixture/rich#strip',
    paper: 'cyberpunk/interior-paper/poor#plain',
} as const;
