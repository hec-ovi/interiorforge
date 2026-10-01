import type { FloorKind, InteriorRequest } from "../../core/types.js";
import type { PlanRoom } from "../plan-types.js";
import { TEMPLATE_DATA } from "./data/index.js";
import { defaultStyle, floorPolicy as kindFloorPolicy, referenceKind, type FloorPolicy } from "../../styles/reference/kinds.js";
import type { PublicSlot, SpaceTemplate, TemplateKey } from "./schema.js";

/** Every compiled or hand-authored template, by key. */
export const TEMPLATES: ReadonlyMap<TemplateKey, SpaceTemplate> = new Map(
  (TEMPLATE_DATA as SpaceTemplate[]).map(template => [template.id, template]));

export { templateSwitch } from './switch.js';
import { templateSwitch } from './switch.js';

/** The reference kind of a request (plan §2.2, `styles/reference/kinds.ts`). */
export const templateKind = referenceKind;

/** The kind policy of a floor, narrowed to the templates that have data and accept the
 *  floor kind. */
export function floorPolicy(request: InteriorRequest, kind: FloorKind): FloorPolicy | null {
  const policy = kindFloorPolicy(request, kind);
  if (!policy || !templateSwitch.enabled) return null;
  const allowed = (key: TemplateKey) => TEMPLATES.has(key) && TEMPLATES.get(key)!.use.floorKinds.includes(kind);
  return { ...policy, dwellings: policy.dwellings.filter(allowed),
    public: policy.public.map(slot => ({ ...slot, templates: slot.templates.filter(allowed) })).filter(slot => slot.templates.length) };
}

export function dwellingTemplates(request: InteriorRequest, kind: FloorKind): SpaceTemplate[] {
  return (floorPolicy(request, kind)?.dwellings ?? []).map(key => TEMPLATES.get(key)!);
}

export function publicTemplates(request: InteriorRequest, kind: FloorKind, slot: PublicSlot): SpaceTemplate[] {
  return (floorPolicy(request, kind)?.public.find(item => item.slot === slot)?.templates ?? []).map(key => TEMPLATES.get(key)!);
}

export interface UnitSizing {
  area: [number, number]; width: [number, number]; depth: [number, number]; preferred: [number, number];
  /** each dwelling template's frontage and depth, [min, reference, max], in policy order */
  references: { key: TemplateKey; width: [number, number, number]; depth: [number, number, number] }[];
}

/** Envelope hints for the allocators: min over the templates' mins, max over their maxes,
 *  preferred = the first template's reference. Null when the floor has no dwelling template. */
export function unitSizing(request: InteriorRequest, kind: FloorKind): UnitSizing | null {
  const templates = dwellingTemplates(request, kind);
  if (!templates.length) return null;
  const width: [number, number] = [Math.min(...templates.map(t => t.envelope.min[0])), Math.max(...templates.map(t => t.envelope.max[0]))];
  const depth: [number, number] = [Math.min(...templates.map(t => t.envelope.min[1])), Math.max(...templates.map(t => t.envelope.max[1]))];
  const first = templates[0]!.envelope;
  return { width, depth, area: [Math.min(...templates.map(t => t.envelope.min[0] * t.envelope.min[1])),
    Math.max(...templates.map(t => t.envelope.max[0] * t.envelope.max[1]))], preferred: [first.width, first.depth],
    references: templates.map(t => ({ key: t.id, width: [t.envelope.min[0], t.envelope.width, t.envelope.max[0]],
      depth: [t.envelope.min[1], t.envelope.depth, t.envelope.max[1]] })) };
}

/** Rooms no template covered take the floor's default style: private rooms the dwelling
 *  style, common rooms the public style. */
export function stampStyles(rooms: PlanRoom[], request: InteriorRequest, kind: FloorKind): void {
  if (!referenceKind(request)) return;
  for (const room of rooms) room.style ??= defaultStyle(request, kind, room);
}

/** How many layouts a floor kind's reference homes take in turn: a rich kind composes each
 *  floor's clean strips from one of its dwelling templates at its own frontage, the next
 *  floor from the next (`perimeter-residential.ts`), so a tower shows every apartment style
 *  its reference has. 1 elsewhere. */
export function templateTurns(request: InteriorRequest, kind: FloorKind): number {
  if (!['rich', 'high_rich'].includes(request.building.tier)) return 1;
  return Math.max(1, dwellingTemplates(request, kind).length);
}
