# Changelog

0.28.0: exterior opening reservations govern facade-side walls, the complete vertical core and furniture footprints, including moving-door depth. Stair A connects the top floor to a fitted roof enclosure and roof nav surface. Interior wall bands and doorway casings are closed fitted solids. Wardrobes use a painted-steel carcass and separate leaves; wall screens use a dark metal stepped housing.

0.27.1: public generators report shell and material I/O through the closed `InteriorError` codes. The preview contains generation and import failures and restores its controls. Single-floor NPC data publishes no inter-floor connectors.

0.27.0: floor-only generation returns per-floor GLBs, floor data and NPC support with one floor document in memory at a time.

0.26.1: upholstered furniture requests the materials library's flat fabric variant while preserving its canonical material key.

0.26.0: open shop fronts use the Exterior portal's clear width, height and depth for layout, navigation, lining and geometry validation.

0.25.1: light fixtures use a plain metal housing and a separately mapped emissive lens. Cove lenses face upward; ceiling strips and spots face downward.

0.25.0: stairs share one dimension model across feasibility and geometry: 1.2 m clear flights and landings, 0.16 to 0.18 m risers, 0.28 m treads and 2.1 m finished headroom. Arrival lights sit flush in the landing.

0.24.1: walls and ceilings request joint-free material variants. Visible grids come from bands, casings and light housings.

0.24.0: every floor publishes `ceilingElevation`. The ceiling clears facade glazing and stops one slab soffit below the floor above.

0.23.1: a `shop` floor uses the venue program selected by its parcel type.

0.23.0: interior doors use 0.9 m clear leaves where their shared wall permits, with a 0.7 m minimum on short walls. Heads stand at 2.5 m, 3 m for three or more leaves, or one casing band below a lower ceiling. Cove lines stop at openings.

0.22.0: accent tone is part of a complete wall run. Door refitting and emitted-geometry checks keep every interior opening traversable.

0.21.4: the core scans along its band from the published roof housing so the stair head meets the roof cutout.

0.21.3: every room doorway and room-side window has a casing.

0.21.2: doors fit the wall stretch their rooms share and use the published head-height rules.

0.21.1: curtain-wall ceilings meet the spandrel line and partitions may land on pane mullions.

0.21.0: partitions use a 0.5 m grid based on the outline corner. Floor and ceiling UVs share the same origin.

0.20.6: unit-mapped wall screens, lift panels and framed wall art use upright glTF UV orientation.

0.20.5: unit-mapped side faces read left to right from their front.

0.20.4: a partition on an opening boundary occupies its frame member.

0.20.3: stair-shaft downlights sit under the mid landing away from the entry.

0.20.2: spot fixtures request the recessed `lamp` material variant.

0.20.1: wall fields use plain plaster; accent bands and ceilings carry their own material keys.

0.20: facade reveal lining closes before a neighboring edge's wall and shell-fit validation applies the same corner rule.

0.19: exported anchor coordinates drive keep-clear checks. `coreFeasibility` reports depth and blocker details. Optional floor GLBs share the building output's materials, node scheme and texture mode. Shell depth reads `facade.wallDepth` before the style table.

0.18: the facade lining, partitions, slabs, ceilings, core, furniture, lights and nav grid stay behind the shell wall depth. `E_SHELL_BREACH` guards the emitted vertices and the feasibility recipe uses the same inset plates.

0.17: fixtures publish direction, spread, temperature, range and flux. The floor preview instantiates these values for strips, spots and coves.

0.16: the floor inspector renders its own lights and places eye view at room height. Browser material themes use a preloaded index.

0.15: walls carry baseboard, dado, field and top-trim bands. One eligible wall per room uses the accent tone; visible band ends are capped.

0.14: material keys may carry a variant preference in `extras.materialVariant` while the glTF material name remains the canonical key.

0.13: NPC anchors use the same doorway and entrance keep-clear zones as furniture. Entrance anchors stand 1.7 m inside the opening.

0.12: each furniture kind uses its own shaped assembly and seeded small objects. Wall pieces carry optional elevation; light fixtures publish `beamDeg` and `diffuse`.

0.11: furnishing and nav validation share doorway keep-clear zones, including leaf swing and approach depth.

0.10: stairs provide continuous tread and landing geometry from basement through the top floor, using shared feasibility and clearance validation.

0.9: skewed footprints can use a rotated layout frame selected in 5 degree steps. Feasibility and generation share the frame and placement decision.

0.8: partitions align to facade piers within room-span constraints and report unmovable lines consistently.

0.7: floor data publishes light fixtures for rooms, corridors and stair shafts. Low storeys preserve 2.1 m clear height below the ceiling.

0.6: default generation resolves material keys through the sibling Materials box. External, embedded and key-only texture modes share the same surface. Commerce and mall programs publish sales rooms, concourses, stock areas, clerks and their routines. Core scans and compact-depth checks share their placement predicates.

0.5: the corridor scans for a covered band. Standard, compact and walkup core modes publish their thresholds and use the same stair flight orientation.

0.4: tight footprints use the published walkup and single-loaded layouts. Furniture, anchors and door repair use reachable positions on constrained plates.

0.3: `coreFeasibility(blueprint)` publishes the core fit mode and arithmetic. Elevator demand clamps to available band space; inaccessible strip remnants become sealed service shafts.

0.2: rotated parcels use a principal-axis layout frame while NPC nav grids remain in world space. Public types use the Atlas building and tier vocabulary and accept number or string seeds. The preview loads Exterior output.

0.1: validated Exterior blueprint and shell input produces a completed GLB, per-floor JSON and NPC support. The pipeline includes vertical core geometry, floor programs, shaped furniture, reachability validation, pathfinding and the browser floor inspector.
