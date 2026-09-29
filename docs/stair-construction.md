# Stair construction and reference profiles

The stair is a complete construction assembly, shared by every footprint and storey
height the core planner accepts. The canonical `stair-flight-N` retains the existing
consumer's tread and guard collision contract. Its structural walking surfaces sit
12 mm below the finish; separate tread/riser caps finish them at exactly the nominal
walking height. The closed sloping soffit and side profiles replace exposed sawtooth
blocks. Round handrails remain in the canonical module so its published bounds still
contain the consumer's implicit guard parts.

Profiles differ in construction, rather than only in color:

| Family | Treads and landing | Guard and lighting |
| --- | --- | --- |
| Luxury | Continuous walnut veneer caps and matching landing | Clear glass with end clamps, slim rounded gunmetal rail, warm wall sconces |
| Corporate | Stone caps | Glass, gunmetal and cool wall sconces |
| Capsule | Painted metal caps | Panel infill with spaced stiles and rounded rails |
| Damaged | Worn mineral caps | Solid painted parapet, rail brackets, round rails, cyan wall lights and service risers |
| Industrial | Gunmetal caps | Pipe infill, rounded rails, service lighting and risers |

The side infill is divided into tread-length collision pieces. Its visible panel
surfaces use continuous meter UVs; only the first and last pieces have end caps.
Consequently the glass reads as one pane and the parapet has no repeated paint seams,
while a generic box collider never becomes a tall invisible wall beneath a sloping
flight. The geometry stays in the reserved edges, outside the walking lane.

Each incoming climb owns its arrival landing, including its soffit and a recessed
bearing under the following flight's first tread. The next floor does not repeat that
landing; threshold generation knows the linked support. This closes a streaming hole:
with only the two lowest bands live, a return-flight camera's off-axis rays would
otherwise pass through the absent next landing and reach exterior glazing far away;
the incoming flight's own construction closes them. Each upper flight's separate soffit faces and wall-pocket returns belong
to the preceding floor's existing per-floor `treatments` packet. Walking tops,
risers and guards stay on their own floor, with no repeated soffit faces.

The opaque wall fronts visible beyond those soffits also belong to the preceding
floor. A closed finish skin preserves the exact authored front relief and UVs;
its own floor retains a matching opaque backing recessed 2 mm. A 1 mm cavity
separates them, avoiding coincident faces. Both collision volumes remain wholly
inside the original wall thickness. Thus upward views have the next enclosure
finish, and downward views retain a closed wall when the lower packet unloads.
This handoff applies only to shared `stair-a` / `stair-b` connectors; private duplex
stairs remain local. No Engine visibility or weather code is changed.

`tests/stair-construction.test.ts` checks the smooth closed surfaces, both reproduced
slot rays with only two bands, exact consumer bounds, ascent/descent for all five
profiles at 0 and 37 degrees, and passage below the flights.
`tests/stair-wall-skins.test.ts` checks exact front preservation, closed local backing,
rotated containment inside existing collider bounds, and private-core exclusion. Broad clear width,
variable rise, roof alignment, enclosure classification and the continuous walk are
covered by the other stair tests.
