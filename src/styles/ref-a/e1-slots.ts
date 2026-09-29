import { FINISH as F } from '../../modules/finishes.js';
import { LOOK } from '../systems/reference-looks.js';
import type { SlotRule } from './remap.js';

/** The suite's published finishes (materials 0.20.0) and the slots the shared built-ins
 *  and portals wear in their place. */
export const E1_SLOT = {
    cream: 'cyberpunk/e1-panel/high_rich#cream',
    gloss: 'cyberpunk/e1-ceiling/high_rich#gloss-black',
    stone: 'cyberpunk/e1-floor/high_rich#dark-stone',
    housing: 'cyberpunk/e1-housing/high_rich#cool-grey',
    splash: 'cyberpunk/e1-splash/high_rich#tan',
    worktop: 'cyberpunk/e1-worktop/high_rich#steel',
    caustic: 'cyberpunk/e1-glass/high_rich#caustic',
    vending: 'cyberpunk/e1-screen/high_rich#vending',
    grille: 'cyberpunk/e1-grille/high_rich#diamond',
    cyan: 'cyberpunk/light-fixture/high_rich#e1-cyan',
    /** the island top and the dark trims: graphite gloss */
    graphite: 'cyberpunk/gutierrez-lacquer/rich#ink',
    /** the terrarium's tiled back and the pit's rocks: the suite's dark teal stone */
    tile: 'cyberpunk/e1-floor/high_rich#dark-stone',
    upholstery: 'cyberpunk/biotechnica-upholstery/rich#ivory',
    linen: 'cyberpunk/biotechnica-upholstery/rich#ivory',
    duvet: 'cyberpunk/ivory-panel/mid#native',
} as const;

/** The rock the shared pit recipe draws its boulders in. */
const PIT_ROCK = 'cyberpunk/exterior-basalt-concrete/mid#native';

/** Built-in placeholder slot → the suite's own finish. The cool lens turns cyan only where
 *  the reference lights cyan: the kitchen's under-cabinet line and the rock pit. */
const BUILT_IN: Record<string, string> = {
    [LOOK.e1Cream]: E1_SLOT.cream,
    [LOOK.e1Housing]: E1_SLOT.housing,
    [LOOK.e1Splash]: E1_SLOT.splash,
    [LOOK.e1Steel]: E1_SLOT.worktop,
    [LOOK.e1IslandTop]: E1_SLOT.graphite,
    [LOOK.e1Caustic]: E1_SLOT.caustic,
    [LOOK.e1Screen]: E1_SLOT.vending,
};

export const e1SlotRule: SlotRule = (module, slot) => {
    if (!module.startsWith('fit-e1-') && !module.startsWith('housing-e1-') && !module.includes('-e1-lounge-pit') && !module.startsWith('ceiling-cove-e1-lounge'))
        return slot;
    if (slot === F.lensCool && (module.startsWith('fit-e1-kitchen') || module.includes('pit'))) return E1_SLOT.cyan;
    if (module.includes('-e1-lounge-pit') && slot === PIT_ROCK) return E1_SLOT.tile;
    return BUILT_IN[slot] ?? slot;
};
