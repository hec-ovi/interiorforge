# CONTRACT: architectural details

Builds mezzanine platforms, open stairs, guards and fitted overhead services.

Takes [floor data](../../../schemas/floor.schema.json), its frame and material palette; appends single-sided physical meshes. Loft stairs retain 1.2 m between rail faces and 2.1 m headroom. Platform guards leave the upper stair entrance open. Pipe and cable assemblies stay within authored service bounds above circulation.

`emitServices(mesh, keys, rooms, frame, base, ceiling, usableOutline)` takes the ceiling storey's usable UV outline, inset by its actual shell wall depth from the [blueprint](../../../schemas/blueprint.schema.json). A whole service band must fit both the room and that upper outline, including concave setbacks. Every pipe, sleeve, support and cable stays inside the accepted band with at least 2.1 m overhead clearance. Luxury rooms and ceiling heights below 2.9 m emit no exposed services.

Depends on [core](../../core/CONTRACT.md), [glb](../../glb/CONTRACT.md), [layout lofts](../../layout/lofts/CONTRACT.md) and [panels](../panels/CONTRACT.md).

Explicitly oriented light lines have a 0.04 m closed housing and a separate lens at the published source plane. They fit beneath stair handrails without entering the clear walking lane.

`ElevationSplitMesh(lower, upper, elevation, frame, grid)` routes primitive faces across a horizontal slab plane. It preserves complete surface area, winding and interpolated UVs, with no cap or duplicate face at the cut. Global and loft stair rails above arrival belong to the receiving floor; platform guards remain on that upper floor. Roof-access rails stay with the top band when no upper blueprint floor exists.
