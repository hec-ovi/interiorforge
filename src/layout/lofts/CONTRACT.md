# Lofts

Fits a furnished mezzanine for Layout authoring tools.

`fitLoft(rooms, blocked, frame, lowerFloor, upperFloor, baseY, upperY, ceilingY, upperOutline?)`
returns `{plan, reserved, solids, room}` or null. [Floor schema](../../../schemas/floor.schema.json)
defines platform, supports, stair and entry output. `loftLights` supplies matching sources.

The platform and stair fit the room and both storeys, preserving doors and circulation.
The stair keeps 1.2 m clear width and 2.1 m headroom. Public placement requests use
single storeys. Depends on [Layout](../CONTRACT.md) and [Core](../../core/CONTRACT.md).
