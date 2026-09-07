# CONTRACT: lofts

Fits one furnished mezzanine into a double-height room.

`fitLoft(rooms, blocked, frame, lowerFloor, upperFloor, baseY, upperY, ceilingY, upperOutline?)` takes room polygons and reserved ground rectangles; returns `{ plan, reserved, solids, room }` or null. [Loft schema](../../../schemas/floor.schema.json#/$defs/loft) describes the published platform, straight stair, supports and entries.

The platform and stair fit inside one room and the optional inset upper-storey outline. Stair width is 1.2 m clear between rails; tread depth is 0.28 m and rise is at most 0.18 m. Headroom is at least 2.1 m above and below the platform. Ground supports and the complete stair footprint avoid existing routes and door reservations. Closing dimensions follow the 0.5 m building grid.

Depends on [core](../../core/CONTRACT.md) and [layout](../CONTRACT.md).

`loftLights(loft, base, ceiling, tier)` returns fitted sources: a cool rear wall wash for luxury, or cyan lines beneath damaged and capsule stair handrails. Lens axes and emitting normals are world vectors.
