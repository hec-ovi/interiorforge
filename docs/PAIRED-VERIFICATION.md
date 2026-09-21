# Paired interiors verified on 2026-09-21

Interior 0.35.0 pairs each reviewed Exterior family with its own material recipe and
the parcel's real programme. These public `Exterior.generate` → `Interior.generate`
cases produced every requested floor, valid module references, floor navigation and a
connected roof exit. The second set is rotated 37° and translated to `[1000, 450]`.

| Architecture | Canonical parcel / floors | Alternate parcel / floors | Upper programme |
| --- | --- | --- | --- |
| balcony-grid | 20.5 × 37.5 m / 7 | 37.5 × 20.5 m / 9 | corporate office |
| corporate-sectors | 51 × 39 m / 12 | 44 × 36 m / 12 | corporate office |
| faceted-bays | 42 × 30 m / 10 | 46 × 34 m / 6 | apartments |
| white-grid | 32.5 × 17.5 m / 7 | 40.5 × 25.5 m / 5 | apartments |
| mirror-shutters | 54 × 34 m / 10 | 42 × 30 m / 5 | offices |
| mirror-frame | 35 × 27 m / 8 | 43 × 35 m / 3 | hotel rooms |
| garden-taper | 52 × 42 m / 4 | 60 × 46 m / 5 | apartments |

Garden's changing plates receive separate intermediate `floor-<index>` layouts.
Equal plates still share `middle`; explicit differing programmes also keep their own
layout and their floor-specific NPC identity and connector entries.

`npm test -- --reporter=dot`: **65 tests passed in 12 files**, 81.19 s, two workers.
`npm run typecheck` and `git diff --check` passed. The meaningful geometry checks include:

- Actual transformed triangle rays across the full door passage, tread and landing
  corners, shaft-floor perimeter, rear enclosure and roof arrival. Balcony-grid checks
  20.5 × 37.5 / 7, 37.5 × 20.5 / 2 and 20.5 × 20.5 / 9, including mid-tier wall trim.
- Closed risers, stair soffits and slab undersides, fixed-width casing members, no
  duplicate door-head underside, continuous threshold support and roof slab unions.
- Real white-grid 5 m podium with two 14-riser flights; varied climb generation from
  2.5 through 12 m and physical stacked-flight headroom probes.
- Garden crown's unusable old doorway is closed by real wall triangles, both studios
  and bathrooms remain, and the replacement doorway carries the exported NPC route.
- All bathroom families use correctly oriented authored toilets and recessed basins;
  GLB bowl rays remain open and glaze/mirror material slots resolve.

The export budget test includes each building's layouts and the complete shared
module kit: mirror-frame **1,680,012 bytes / 2.883 s**; corporate-sectors
**1,675,266 bytes / 2.493 s**. Rendered Engine walkthroughs, runtime collision and
seated NPC/quest acceptance are recorded by their consumer, not inferred from these
producer tests.

## Rendered finish correction, 0.35.1

The Engine's first upper-floor renders exposed an incorrect wood slot covering the
corporate-sectors, mirror-frame and mirror-shutters corridor fields. The corrected
recipes use actual charcoal corporate panels or graphite wall panels; deliberate
furniture timber and family frame/floor distinctions remain. Nine targeted architecture
and real-family tests pass, including the actual generated wall material slots, and
typecheck passes.

Regenerated Engine screenshots were inspected in
`engine/out/diagnostics/family-panel-final/review-{corporate-sectors,mirror-frame,mirror-shutters}-upper.png`.
All three show neutral panel fields without wood grain. Their render report records
zero browser errors, unresolved materials or unknown variants.
