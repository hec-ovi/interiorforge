# Consumer decisions

| Decision needed | Reason | Consumers |
| --- | --- | --- |
| Runtime actor dimensions and moving door envelopes | Layout proves a 0.6 m body; stairs keep 1.2 m clear width and 2.1 m headroom | Engine, Simulation |
| Exclusive staffing and standing slot occupancy | Generated anchors and opportunities need ownership across shifts | Simulation, Quests |
| Door and lift motion with route invalidation | Static navigation does not model moving obstructions | Engine, Simulation |
| City resource packaging for local catalog models | Furniture IDs can resolve licensed models that are local resources | Engine, Assets |
| Reusable layouts for irregular landmark shells | Placement generation accepts rectangular construction axes and compatible middle floors | Exterior, Engine |
| Rendered character and lighting acceptance | Consumer collision and complete visual review remain joint work | Engine, Simulation |

The [contract](../CONTRACT.md) defines room module and prop resource ownership,
three layout reuse, identity mapping, and the measured 2 MB and 30 second export budgets.
Exterior supplies measured opening records. Furniture and modules are shared city resources.

## Exterior: roof bulkhead cutout

The mirror-frame 4x3 plans publish a roof housing whose cutout is turned across the stair
it must cover. Stair A is 3.0 m wide by 6.2 m long (two flights plus their landings, the
published minimum for 1.2 m clear width, 0.16 to 0.18 m risers and 0.28 m treads); the
cutout is 7.2 m across by 4.0 m deep, so it is 2.2 m short along the flight direction.
Same numbers on mirror-frame-4x3x8f, -4x3x9f, -4x3x16f and -4x3x29f (kit index
374dc6b2dfdb9187).

Needed: the cutout's deep side runs along the core frame's v axis, at least 6.2 m by 3.0 m,
centred on the stair shaft, or the housing footprint turned a quarter turn. Until then
those buildings generate with no roof access: the stair stops at the top floor and the
roof stays unreachable.

## Exterior: opening reservations

The faceted-bays plans leave no core position that keeps the published circulation depth
beside a facade opening, on any mode or frame:

| Plan | Floor | Opening | Core solid | Circulation depth required | Available |
| --- | --- | --- | --- | --- | --- |
| faceted-bays-4x3x3f | 1 | `w:1:fb:2:0:19:0:slit:0:0` | stair-a | 1.20 m | 1.14 m |
| faceted-bays-4x3x36f | 2 | `w:2:fb:2:1:22:0:cheek:0:0` | stair-a | 1.20 m | 0.83 m |

Needed: 0.06 m on the slit window and 0.37 m on the cheek window, as reservation depth or
as a moved opening. Until then both buildings open on the core that crosses the
reservation, and the crossing is recorded in the building manifest.

## Exterior and Engine: connection floors of generated shells

In small-city-abd7455d the generated shells p11 (floor 3), p42 (floor 16), p51 (floor 2)
and p7 (floor 14, also 5.14 m against 4.5 m) carry a bridge `aperture` on one middle floor.
Three reusable layouts cannot hold a floor whose openings differ, so those four buildings
refuse with `E_BLUEPRINT_INVALID: floor N differs from the reusable middle layout`; every
other shell of that city opens. Needed: a fourth layout kind for connection floors, or the
aperture published as a per-floor treatment the way windows are. Until then the sweep
lists this refusal as the contract's own.

## Materials: interior finishes

The 0.32.0 module set wears existing theme keys; these looks have no key yet, so the modules
take the closest published finish named beside each ask. All tile keys at 2 m unless noted.

| Key wanted | Intended look | Standing in today |
| --- | --- | --- |
| `cyberpunk/interior-travertine/rich` | warm ivory vein-cut travertine, honed, fine horizontal sediment layers (the user's own prompt) | `interior-luxury-wall/rich` |
| `cyberpunk/interior-walnut/rich` | smoked walnut veneer, quarter-sawn, fine vertical grain, no plank joints | `interior-luxury-timber/rich` |
| `cyberpunk/interior-ribbed-timber/rich` (0.5 x 2 m) | vertical fluted walnut slats at 0.04 m pitch for feature fields, bar fronts and screens | `wood/high_rich#1` |
| `cyberpunk/interior-marble-dark/rich` (tile 2 m and an exact 1:1 plate) | honed obsidian marble with fine pale veins for lobby floors, counter tops and feature fields | `tile/high_rich#slab` |
| `cyberpunk/interior-marble-light/high_rich` (exact 1:1) | white Calacatta marble for bathroom floors, showers and basins | `tile/rich#slab` |
| `cyberpunk/interior-velvet/high_rich` (1 m) | olive graphite velvet with sheen for stools, chairs and sofa cushions | `fabric/high_rich#flat` |
| `cyberpunk/interior-linen/high_rich` (1 m) | ivory linen bedding | `ivory-panel/mid#native` |
| `cyberpunk/interior-artwork/rich` (exact 2:3, several variants) | abstract framed artworks, dark grounds with one saturated hue | `corporate-screen/mid#native` |
| `cyberpunk/interior-mesh-grating/mid` (0.5 m, opacity mask) | expanded steel mesh for lift gates and guard screens | plain `metal/mid#zinc` bars |
| `cyberpunk/interior-grating-floor/mid` (0.5 m) | open bar grating for industrial platforms and walkways | `interior-damaged-steel/poor` |
| `cyberpunk/interior-pipe/poor` (1 m) | rusted galvanised pipe and cable tray for exposed services | `interior-damaged-steel/poor` |

## Engine: drawing the 0.32.0 module set

- Module GLB UVs are tile units, one UV unit per `tiling.worldSize` repeat (the Materials
  binding rule); draw them with no further tiling transform. Fitted pieces (edges, fields,
  slabs, ceilings, screens) wear their map once, fixed pieces (corners) wear it at metre scale.
- Every slot is `key#variant`: the GLB material is named by the key and carries
  `userData.materialVariant`, as before.
- Collider intent by id prefix: `wall-panel-*`, `wall-field-*`, `wall-light-line*`, `floor-*`,
  `ceiling-band-*`, `ceiling-field-*` and `fit-*` are their bounds; `ceiling-spot*`,
  `ceiling-cove-*`, `ceiling-led-strip`, `ceiling-services`, `wall-screen`, `wall-art` and
  `wall-shelf` carry none. `door-frame`, `window-return`, `stair-flight-*`, `lift-car` and
  `lift-doors` keep their existing rules.
- Light records: `cove` records now also stand at wall height (the panel frames' lit joints,
  facing up at the top and down at the bottom) and furniture-owned records are published
  with their `furniture` id; the module at that id carries the lens.
