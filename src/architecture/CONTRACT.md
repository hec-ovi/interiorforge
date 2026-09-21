# Architectural pairing

`recipes.ts` registers the Interior proportions, wall and frame palette, floor finish
and ceiling treatment for every named Exterior architecture. `interiorRecipe(request)`
selects by `blueprint.assembly.architecture`; an unlabelled shell retains the generic
finish. Explicit assignments always win. Otherwise the actual parcel's programme
selects office, apartment or hotel rooms above its lobby. Tier and industrial-use
finishes remain authoritative.

Corporate-sectors and mirror-shutters use the real charcoal
`cyberpunk/corporate-panel/mid#native` field; mirror-frame uses
`cyberpunk/wall/high_rich#panel-graphite`. These architectural dark fields do not use
wood maps. Deliberate timber trim, furniture and garden floors retain their own slots.

The seven reviewed families (`balcony-grid`, `corporate-sectors`, `faceted-bays`,
`white-grid`, `mirror-shutters`, `mirror-frame`, `garden-taper`) publish their own closed
inner facade, frames and returns. With `roomEnvelope` present, `shellOwnsFacade` keeps
those surfaces and leaves the perimeter band open; Interior adds neither duplicate
window returns nor an inner rectangular facade. Stair and other core enclosures remain
structural walls. Geometry and programmes come from the live blueprint, not a sample's
dimensions, seed or floor count.

Depends on [Core](../core/CONTRACT.md) and [Placements](../placements/CONTRACT.md).
