# interiorforge

Deterministic interior generator for buildings. Give it a GLB shell and its per-floor blueprint; get back a finished furnished textured GLB (rooms, walkable stairs, elevators, doors, furniture), one JSON per floor, and an NPC support file with anchors, roles, routines and nav grids.

Same seed and inputs, byte-identical output. No LLM calls, no wall clock, no ambient randomness.

Every floor is real: stairs are continuous walkable geometry from the ground through a fitted roof enclosure, elevators serve every floor they span, and every room is reachable from the entrance. A secondary stair beside the facade leaves a supported corridor landing with a lateral route around the shaft. Exterior opening reservations keep partitions, the vertical core and furniture out of windows, portals and moving-door space. Permanently open shop fronts use the exterior's exact portal dimensions and stay open through the lining. The geometry is watertight for play, with no gap at a floor edge and no spot where a character gets stuck, and it stays inside the shell: nothing reaches the exterior wall plane, checked on every vertex before the GLB is written.

## Run

```
npm install
npm test                                    # contract tests
npm run typecheck                           # TypeScript surface
npm run generate -- --seed 1 --floors 12 --out out
npm run generate -- --embed --out out       # one self-contained GLB, maps included
npm run generate -- --keys-only --out out   # material keys, resolved by the consumer
npm run generate -- --floor-glbs-only --out out # lower-memory per-floor GLBs, no combined building
npm run preview                             # 3D building view plus a standalone floor editor
```

Without a shell to work from, a fixture shell is fabricated, so the box runs with nothing else installed. The preview shows a finished textured building at first load and can open real generator output (shell GLB, blueprint JSON, request JSON), with walk-path testing in the floor editor.

## Interior styles

The wealth tier selects a fitted material family: `rich` and `high_rich` use luxury stone, walnut and loft brick; `poor` uses worn paint, aggregate and exposed services; `mid` uses worn capsule shells, rubber decks and holograms. Wall, floor and ceiling panels use fixed 0.5 m corner modules and large fields.

Planted dividers, aquariums, sleeping pods and refuse groups reserve real space. Built-in lenses publish light sources. Downloaded furniture retains its source materials and gets small seeded rotations inside its safe bounds. The [asset catalog](src/assets/CONTRACT.md) records source licenses and local model availability.

Fitted double-height rooms have furnished mezzanines, private stairs and guards. Published routes connect the entrance, public core, rooms and loft. NPC placeholders preserve those paths with their standing bodies present. The floor inspector shows each slot and its approach.

## Materials

The shipped theme is `cyberpunk`. Keys below omit `cyberpunk/`; `T` means `poor`, `mid`, `rich` or `high_rich`. A variant is one complete map set. Interior defaults use the first catalog variant unless the table names an explicit selection. Exterior choices come from its style or seeded material selection.

Verified on 2026-09-07: **141 canonical entries, 303 variants and 2,102 map files**. Every listed variant decodes at its declared dimensions and survives an embedded GLB round trip with its bound map bytes intact. All requested named variants resolve. The generation audit covers 215 exterior shells, 40 floors in ten furnished buildings, three interior style exports and gym, apartment and office programs at all four tiers. Exterior's material tests cover all nine styles, all 18 style/palette combinations and all 14 native finishes.

**Interior panels and ornaments**

These keys are interior-specific. Luxury panels use the `rich` entries for both `rich` and `high_rich` buildings. Ornaments use the tiers shown; the general fittings below use the building's tier.

| Material key | Selected and available variant | Interior use |
| --- | --- | --- |
| `interior-luxury-wall/rich` | `field` | Luxury limestone wall panels |
| `interior-luxury-floor/rich` | `field` | Luxury marble floor panels and wet-room accents |
| `interior-luxury-ceiling/rich` | `field` | Luxury ceiling panels |
| `interior-luxury-timber/rich` | `field` | Walnut accents and fitted cabinet faces |
| `interior-loft-brick/rich` | `field` | Luxury studio and living-room brick accents |
| `interior-damaged-wall/poor` | `field` | Worn painted wall panels |
| `interior-damaged-floor/poor` | `field` | Damaged aggregate floor panels |
| `interior-damaged-ceiling/poor` | `field` | Damaged ceiling panels |
| `interior-damaged-steel/poor` | `field` | Worn doors, built-ins and service frames |
| `interior-damaged-patch/poor` | `face` | Exact repair insert in a fitted wall panel |
| `interior-capsule-wall/mid` | `field` | Capsule composite walls and pod shells |
| `interior-capsule-floor/mid` | `field` | Capsule deck panels |
| `interior-capsule-ceiling/mid` | `field` | Capsule ceiling panels |
| `interior-capsule-hatch/mid` | `face` | Exact hatch/service insert |
| `interior-bronze/rich` | `plain` | Display-case frame details |
| `interior-display-glass/rich` | `clear` | Aquarium, display and hologram glazing |
| `interior-fish/rich` | `plain` | Aquarium fish |
| `interior-leaf/rich` | `plain` | Live plants and planted dividers |
| `interior-leaf-dry/poor` | `plain` | Dry foliage in damaged interiors |
| `interior-led-cyan/mid` | `plain` | Pod jamb lights, holograms and stair accents |
| `interior-led-warm/rich` | `plain` | Warm display-case light strips |
| `interior-paper/poor` | `plain` | Service-rack papers and labels |

**General interior materials and exterior overlap**

The last column lists every verified catalog variant for each family, including variants that the current interior generator does not select. “Seeded” means Exterior can select the family's available variants from the building seed.

| Material key | Interior selection and use | Exterior selection and use | Available variants |
| --- | --- | --- | --- |
| `ad-screen/T` | `noir-cyan` at poor/mid; `noir-amber` at rich/high_rich. Screens and terminals | Seeded facade advertising | poor/mid: `noir-cyan`; rich: `noir-amber`; high_rich: `noir-amber`, `premium-soda`, `brand:the-grand-meridian-hotel` |
| `concrete/T` | `plain`: structure, service floors, soil and damaged/capsule accents | The nine exterior styles use the concrete families below | `plain`, `panel`, `panel-square`, `panel-graphite`, `panel-cast`, `panel-mineral`, `panel-weathered` |
| `door/T` | `paint`: doors, furniture and panel joints; damaged door assemblies use damaged steel | `paint`, `satin`, `scuffed`: styled doors and service skins | `paint`, `satin`, `scuffed` |
| `elevator_door/T` | `split`: elevator leaves | No | `split`, `graphite` |
| `fabric/T` | `flat`: procedural seats, sofas and bedding | Seeded hanging garments | `1`, `2`, `flat` |
| `glass/T` | `1`: bottles, glasses and fixture glazing | Uses distinct window/door glass keys below | `1`, `2` |
| `light-fixture/T` | `lamp` for spots; `strip` for lines and coves | `strip`: exterior lenses and illuminated entrance surrounds | `lamp`, `strip`, `panel` |
| `metal/T` | `paint`: rails, fixtures, furniture and exposed services | `paint` or `zinc`: facade services and roof hardware | `paint`, `zinc` |
| `plaster/T` | `plain`: procedural desk paper stacks | No | `plain`, `1`, `2`, `hex`, `panel`, `two-tone`, `tint-rose`, `tint-sage` |
| `rubber/T` | `1`: gym walking surfaces | No | `1`, `2` |
| `tile/T` | `1`: wet-room accents, ceramics and furniture details | No | `1`, `2`, `slab`, `mosaic`, `bond` |
| `window-frame/T` | `paint`: interior casings | `paint`: window frames, door hardware and housings | `paint` |
| `wood/T` | `1`: procedural furniture, crates and plant stems | No | `1`, `2` |

**Exterior-only keys**

These are emitted by Exterior and remain in a completed building's shell. Alias keys keep their geometry role while resolving the indicated catalog family. The named concrete families and `exterior-louvre` resolve all tier aliases to their `mid` entry.

| Material key | Exterior selection and use | Available variants |
| --- | --- | --- |
| `concrete-monolith/T` | Styled facade, piers, ground and parapets | `cast`, `weathered`, `mineral`, `graphite` |
| `concrete-large-panel/T` | `mineral`: large facade fields | `cast`, `mineral` |
| `window-glass/T` | `1` or `2`: ordinary glazing | `1`, `2` |
| `window-glass-office/T` | `clear`: office glazing | `clear` |
| `window-glass-opaque/T` | `dark`: opaque glazing | `dark` |
| `door-glass/T` | `1`: transparent door glazing; alias of window-glass | `1`, `2` |
| `curtain/T` | `blind`, `shade`, `slat`: fitted coverings; ground privacy uses `slat` | `blind`, `shade`, `slat` |
| `exterior-louvre/T` | `metal`: permanent external slats | `metal` |
| `ac-unit/T` | `grille`: condenser faces | `grille` |
| `wall-trim/T` | `paint`: facade trim | `paint` |
| `aperture-frame/T` | `paint`: connection opening surrounds; alias of window-frame | `paint` |
| `balcony-rail/T` | `paint`: balcony guards; alias of window-frame | `paint` |
| `floor-slab/T` | `plain`: floor plates | `plain`, `panel`, `large-slab` |
| `balcony-slab/T` | `plain`: balcony plates; alias of floor-slab | `plain`, `panel`, `large-slab` |
| `roof/T` | `plain`: roof surfaces | `plain`, `panel`, `panel-square` |
| `fire-escape/T` | Seeded escape stairs and landings | `paint`, `zinc` |
| `roof-artifact/T` | Seeded equipment and antenna assemblies | `paint`, `zinc` |
| `signage/T` | Seeded sign housings and backplates | `casing`, `backplate` |
| `letter-atlas/T` | Seeded sign lettering | `neon`, `panel` |
| `window-grime-sill/T` | `runoff`: fitted sill stains | `runoff` |
| `window-grime-jamb/T` | `stain`: fitted jamb stains | `stain` |

**Exterior native image finishes**

Exterior's textured generation replaces selected logical surfaces with these bundled PBR entries. All use variant `native`; all are generated and map-verified. A key-only export publishes the logical material and authored variant for its consuming renderer. Native replacements keep those logical names and record their backing entry in `extras.nativeMaterial`.

| Backing material key | Surface | Repeat |
| --- | --- | --- |
| `exterior-cast-concrete/mid` | Cast concrete | 2 m |
| `exterior-weathered-concrete/mid` | Weathered concrete | 2 m |
| `exterior-mineral-concrete/mid` | Mineral concrete | 2 m |
| `exterior-graphite-concrete/mid` | Graphite concrete | 2 m |
| `exterior-board-concrete/mid` | Board-formed concrete | 2 m |
| `exterior-aggregate-concrete/mid` | Exposed aggregate | 2 m |
| `exterior-basalt-concrete/mid` | Basalt concrete | 2 m |
| `exterior-galvanized-steel/mid` | Galvanized service steel | 0.75 m |
| `exterior-graphite-coating/mid` | Graphite painted frames and doors | 0.75 m |
| `exterior-brushed-bronze/mid` | Bronze frames and trim | 0.75 m |
| `exterior-brushed-steel/mid` | Brushed steel frames and services | 0.75 m |
| `exterior-chalk-coating/mid` | Pale painted frames and doors | 0.75 m |
| `exterior-ac-enamel/mid` | Condenser enamel housing | 1 m |
| `exterior-ac-coil/mid` | Condenser coil front | Exact, clamped |

| Exterior style | Facade variant | Glass / covering | Verified native palettes |
| --- | --- | --- | --- |
| `residential-salvaged` | `concrete-monolith#cast` | `window-glass#1` / `blind` | `slate`, `formed` |
| `residential-weathered` | `concrete-monolith#weathered` | `window-glass#2` / `shade` | `slate`, `aggregate` |
| `residential-modest` | `concrete-monolith#mineral` | `window-glass#1` / `slat` | `slate`, `chalk` |
| `premium-obsidian` | `concrete-monolith#graphite` | `window-glass-opaque#dark` / `shade` | `slate`, `bronze` |
| `premium-office` | `concrete-large-panel#mineral` | `window-glass-office#clear` / `slat` | `slate`, `steel` |
| `premium-mineral` | `concrete-monolith#mineral` | `window-glass-office#clear` / `slat` | `slate`, `bronze` |
| `civic-utility` | `concrete-monolith#weathered` | `window-glass#2` / `slat` | `slate`, `formed` |
| `civic-institutional` | `concrete-large-panel#mineral` | `window-glass-office#clear` / `slat` | `slate`, `chalk` |
| `civic-industrial` | `concrete-monolith#graphite` | `window-glass-opaque#dark` / `slat` | `slate`, `steel` |

The map sets contain basecolor, normal, roughness, metallic, height and AO, plus packed metallic-roughness and emission where supplied. GLBs bind basecolor, normal, AO, packed metallic-roughness and emission. Packed roughness occupies G and metalness B, with both material factors set to 1. Height maps remain source assets; the generator builds panel relief in geometry. Interior tiled UVs retain metre scale; hatch and repair artwork maps once onto its fitted face.

**Imported furniture materials**

Imported GLBs retain their own material names, textures and physical properties. They are independent of `cyberpunk/*` and are shared between instances of the same model. The local/bundled catalog currently contains 32 readable models with 76 distinct source material names; every embedded source image decoded successfully. Model availability, style and physical fit determine which appear in a generated room. [Asset catalog and licensing](src/assets/CONTRACT.md).

<details>
<summary>Source material names by available model</summary>

| Asset ID | Source material names |
| --- | --- |
| `sketchfab-animal-crossing-new-horizons-trash-bags` | `material_0` |
| `sketchfab-dirty-toilet` | `Toilet`, `toilet_seat`, `water_collecter` |
| `sketchfab-elegant-black-office-desk` | `Black_Pebbled_Leather`, `Dark_Steel`, `Grey_Marble`, `Old_Red_Plastic` |
| `sketchfab-file-shelf` | `Cubo.003_baked` |
| `sketchfab-fridgemodern` | `material` |
| `sketchfab-furniture-no-29` | `furniutre_amterial` |
| `sketchfab-futuristic-bluish-sofa` | `Material_0.002` |
| `sketchfab-futuristic-glossy-white-chair` | `Material_0.001` |
| `sketchfab-ikea-cabinet` | `ikeacabinettex` |
| `sketchfab-laptop` | `Black`, `Material`, `Material.003`, `Material.005`, `Material.010`, `Material.011`, `Material.012`, `Material.014`, `Material.016`, `Material.017`, `Material.019`, `Material.021`, `Material.022`, `Material.023`, `Material.024` |
| `sketchfab-maple-tree` | `branch05.001`, `mossybark02.001`, `mossybark03.001` |
| `sketchfab-mattress` | `DefaultMaterial` |
| `sketchfab-modern-entertainment-center-free` | `Player__Decor`, `Screen`, `Stand`, `TV__Cables` |
| `sketchfab-modern-gray-sofa-3d-model` | `material_0` |
| `sketchfab-modern-toilet` | `Color_H06`, `Color_M00`, `Color_M04`, `Color_M09` |
| `sketchfab-office-chair` | `Material`, `Material.001`, `Material.002`, `Material.003`, `Material.004` |
| `sketchfab-old-leather-office-chair` | `Armests_and_legs_material`, `Backrest_material`, `Seat_cushion_material`, `Under_seat_attachments_material` |
| `sketchfab-retro-lowpoly-bed` | `Material` |
| `sketchfab-sci-fi-bed` | `krevetnina.001`, `naslon_kreveta`, `sletlost_iz_naslona`, `unutrasnjost_naslona_kreveta` |
| `sketchfab-sci-fi-furniture-pack-aaa-shelving-unit-c` | `11_-_Default`, `13_-_Brushed_Metal`, `Ceramic`, `Solid_Glass` |
| `sketchfab-sci-fi-3-chair` | `Chair2` |
| `sketchfab-scifi-desk` | `T_desk` |
| `sketchfab-sinkbathroom` | `browns`, `ceramic`, `chrome`, `idk_what_2_call_this_1_a`, `idk_what_2_call_this_1_b`, `idk_what_2_call_this_1_c`, `plastic` |
| `sketchfab-soda-dispenser` | `Soda_Dispenser` |
| `sketchfab-table` | `Scene_-_Root` |
| `sketchfab-tandem-seating-hospital` | `Chair_cloth`, `Metal` |
| `sketchfab-unbranded-conventional-fridge` | `BlackPlastic`, `Metal` |
| `sketchfab-whiskey-glass` | `standardSurface1` |
| `polyhaven-school-chair-01` | `SchoolChair_01` |
| `polyhaven-metal-office-desk` | `metal_office_desk` |
| `polyhaven-sofa-01` | `Sofa_01` |
| `polyhaven-potted-plant-02` | `potted_plant_02_leaves`, `potted_plant_02_pot` |

</details>

Catalog lookups use [pbrforge](https://github.com/hec-ovi/pbrforge): `npm run pbrforge -- resolve cyberpunk/<kind>/<tier>`. Exterior's bundled finishes use the same command with `--themes ../exterior/public/native-materials/themes` from the Materials checkout.

## In

One [`InteriorRequest`](schemas/request.schema.json):

- **seed**, **building** (id, type, wealth tier), **shellGlb** path, **materialTheme**
- **blueprint**: the shell's per-floor description (outlines, elevations, heights, doors, windows, open shop fronts, basements as negative indexes) and its facade: a measured `wallDepth`, or a style that picks how deep the shell wall reaches inside the outline
- **assignments** (optional): one floor kind per floor from lobby, office, corpo office, restaurant, coffee shop, retail, mall floor, gym, studio, apartment, hotel rooms, mechanical, parking, terrace, with `spans: 2` for double-height floors. Omitted, they are derived from the blueprint's own floor labels and the building type, so a mixed-use tower gets a shop floor, a restaurant floor and apartments each with their own program.

Units are meters, building-local, +Y up.

## Out

- **`building.glb`**: the shell completed and furnished. Interior material keys resolve through [pbrforge](https://github.com/hec-ovi/pbrforge) into basecolor, normal, occlusion and optional emission maps, plus metallic, roughness, transmission and IOR properties. Shell materials that already carry a base-color texture remain intact. Upholstery pins the flat fabric weave so chair and sofa scale does not turn a photographed pattern into moire. Tiled maps carry a `KHR_texture_transform` over world-meter UVs so nothing stretches. Three texture modes: `external` writes map URIs against a configurable base path, `--embed` packs everything into one self-contained GLB, `--keys-only` leaves the material keys for a runtime that resolves them itself. With no material database on disk the output falls back to keys, so the tool still runs standalone.
- **`floors/NNN.json`**: the vertical core (elevators, stairs with real tread geometry, shafts), rooms as polygons with door or open-front connections, and furniture placements. Doors carry one to four leaves; an open front carries clear dimensions and no leaves. Irregular footprints rotate the layout frame and publish the angle, so a triangular or decagonal plate lays out along its own axes.
- **`floors/NNN.glb`** (with `--floor-glbs` or `--floor-glbs-only`): each floor band's interior as its own GLB next to its JSON, same materials and node scheme as the whole building, so a runtime can stream the floors near the player. `--floor-glbs-only` seals completed floor buffers, writes one floor document at a time, and omits the combined building allocation.
- **`npc.json`**: usable anchor positions, supported roles with min and max counts, routine loops (anchor, dwell range, animation), and nav data: a per-floor walkable grid plus stair and elevator connectors. Stable vendor/staff and future story slots include body radius, facing and a reachable approach.

Library surface: `generateInterior(request: unknown, options?: GenerateOptions)` returns the combined building and can add floor GLBs. `generateFloorInteriors(request: unknown, options?: FloorGenerateOptions)` returns floor GLBs, floor data, NPC data and a texture report. `findPath(npc: NpcSupport, from: PathQuery, to: PathQuery)` returns walk legs and connected stair or elevator rides, or `null`. `makeFixture(options?: FixtureOptions)` creates a stand-in shell. `coreFeasibility(blueprint: InteriorRequest["blueprint"])` reports the fitting core mode or blocker. The gate and generator share one placement function, so `fits: true` means the building generates.

## How it works

Layout runs in a principal-axis frame taken from the longest street-facing edge, so rotated plates keep square rooms. The core places first, then the corridor band scans for a position the plate actually holds; shallow plates use a single-loaded layout so units keep real room depth. Rooms come from per-kind templates with seeded variance, furniture prefers doorless walls, and electronic wall displays use a fitted stepped metal housing with a separate narrow central rear mount. A wall-aware nav grid is flood-validated for reachability before anything is written. Dimensions are recorded in [docs/RESEARCH.md](docs/RESEARCH.md).

## Using it from an agent or a pipeline

JSON request in, GLB and JSON files out, offline and deterministic, so it fits a batch script, build step or agent tool loop with no server. `coreFeasibility` checks footprints before generation. [CONTRACT.md](CONTRACT.md) and [`schemas/`](schemas) define the request, outputs and closed domain error set.

## Consumers

[urbe](https://github.com/hec-ovi/urbe) is a deterministic city sandbox that furnishes a whole city with it: [buildingforge](https://github.com/hec-ovi/buildingforge) produces the shells, this fills them, [pbrforge](https://github.com/hec-ovi/pbrforge) supplies the textures, and the NPC support files become the routines its population actually walks.
