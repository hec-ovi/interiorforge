# Numbered apartment entrances

Unit positions stay fixed across floors, as in a numbered residential block; the
Apartment 1702 entrance supplies the layered entrance/numberplate study. The leaves
slide like the building's main pocket entrance. The reference's 1702 label is not
copied to unrelated apartments.

Fresh apartment and studio floors in every tier publish paired pocket leaves:
wood/bronze for rich tiers, ivory enamel/zinc for mid, and worn enamel/stainless for
poor. Each 64 mm leaf has a 50 mm solid core, two skins, an undercut and genuine recessed
finger cups. It has no projecting lever or hinge barrel. Existing published swing
worlds remain readable; new generation always publishes linear pocket motion.

## Producer contract

`placements/apartment-doors.ts` publishes `building.floors[].apartmentEntrances`.
Numbers belong to manifest floors, never the shared middle layout. Each entry carries
its unit, stable physical bay slot, displayed number, common/private room IDs,
connection, opening pose/dimensions, two leaf parts, two empty pocket volumes,
linear motion and fixed numberplate/digit/runner/end-stop parts.

`apartmentSlots` lets the first residential floor establish sequential positions. Upper
setbacks match those bay bounds by overlap, one home per position; shifted crown corners
never insert numbers into a typical floor. Bedroom/bathroom changes may alter room IDs
without changing the address. Persist the map when editing/combining
units; removed positions stay reserved. Display floor 1 gives 101 etc; a residential
ground floor receives that first display floor, while a lobby has no apartment number.
Only a dwelling unit's one common-circulation entrance is selected. Internal bedroom,
bathroom and kitchen connections, public/service connections, lifts and Exterior
openings are excluded. A second public entrance or missing private entrance fails.

Each part is a shared module plus floor-local position, Three rotationY and scale.
The first closed leaf starts at the opening's low-X edge; +X spans the opening and
+Z points into the apartment. The second is mirrored at the high-X edge. Each moves
outward by half the opening width plus 55 mm. An opening therefore needs an opaque
wall run on both sides of at least half its width plus 90 mm. Dimensions derive from
the actual opening; the 1.6 m luxury entry is not imposed on smaller-tier units.

`placements/apartment-pockets.ts` verifies common/private ownership and actual opaque
wall support, then subtracts 80 mm-deep channels through wall and jamb backing. The
remaining solids are ordinary module placements whose geometry and FloorBoxes bounds
agree. Thin capsule infill is moved onto opaque cassette skins inside its existing
frame depth. An overhead runner and full-height end stops close the cassette. The
leaf never slides along a visible wall face or through a full solid backing.

Numberplates fit after cavity construction. Their entire width/height must sit on
an actual opaque partition face outside the jamb; an obstructed preferred side uses
the other jamb. The back sits 0.5 mm clear of that measured face. Moving leaves and fixed
hardware stay outside ordinary static placements; only the dedicated runtime mounts
them. Static pocket skins remain normal colliding wall placements.

## Consumer and validation

Engine `ApartmentDoors` is a separate registry owned by InteriorStream. Interactor
includes active apartment doors in E targeting and authored movement. It reuses
DoorMotion and exact pivot-local DoorColliders triangles without adding private doors
to `city.doors`, Exterior openings or street goals. Each moving group has unit scale;
geometry dimensions and metric UV adjustments are baked before translation. No leaf
rotation occurs. Dropping a floor removes its bodies and geometry; rebuilding restores
its saved open fraction/target. Numberplates remain stationary.

`tests/apartment-entrances.test.ts` covers stable numbers, changed crown IDs, reserved
slots, private boundaries, model envelopes, opaque plate mounting, both physically
empty channels at five motion poses, all-tier publication and schema-valid actual
six-storey balcony-grid generation. The established 40 m mid/poor fixtures pass. The
saved 60 m poor courtyard request publishes 11 entrances on each floor 1–7:77 total.

Engine `ApartmentDoors.integration.test.js` loads exported luxury/capsule/damaged GLBs
and checks E prompts, closed collision, constant rotation, half/full visual/collider
translation, open passage, reclosure and streaming state at 0°, 37°, 180°. It also walks
every apartment entrance on all five occupied upper floors of the actual luxury review
request using its real wall/floor/furniture colliders.
