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
