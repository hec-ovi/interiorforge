import { FINISH } from '../../modules/finishes.js';

/** Explicit published slots; architectural identity comes from joinery and depth. */
export const SANDRA_MATERIALS = {
  timber: FINISH.timber,
  cream: 'cyberpunk/fabric/mid#linen',
  panel: 'cyberpunk/interior-capsule-enamel/mid#ivory',
  red: 'cyberpunk/district-panel-red/rich#clean',
  mat: 'cyberpunk/sandra-tatami/mid#bordered',
  frost: 'cyberpunk/sandra-frosted-glass/mid#infill',
  plaster: FINISH.mineral,
  dark: FINISH.black,
  trim: FINISH.bronze,
} as const;
