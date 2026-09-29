# Corpo Plaza vanity

`corpo-bathroom.ts` follows the Corpo Plaza vanity: a frontal three-part mirror,
twin rectangular wall outlets, a projecting picture light and an angular amber line
inside the trough; a thick floating apron, open long basin and dry end lands; the
complete recess with its planting and opposing cabinet; independent light supports
and upper backing; and a separate stepped planter beside the oblique basin edge.

The proposed fixture measures 2.2 × 0.6 m; the working surface is 0.9 m high.
Its supported mirror/light assembly reaches 2.32 m. The size is an authored
architectural choice, not an inferred game measurement. The existing compact
hospitality vanity remains a separate module.

The trough has four real walls, sloping inside faces, a floor almost 20 cm
below the rim and two drain slots. It has no covering countertop polygon.
The floating apron, supporting brackets and wall-connected drain remain
separate parts. The 7 mm light channel includes the source's two angular rises
below the outlets. Three opaque mirror leaves have actual small joints,
retainers and a thin metal surround. The projecting hood has two supports and
an underside diffuser.

`CORPO_VANITY_FIT` publishes the canonical placement size;
`CORPO_VANITY_LIGHTS` publishes both diffuser positions. The companion
`CORPO_BATH_DIVIDER_FIT` publishes a separate 1.8 × 0.45 × 2.65 m reservation.
Two stepped beds carry rooted branching climbers in front of the geometric
lattice. Each curved leaf is a closed, 0.8 mm thick shell connected to a stem
by a petiole. The upper canopy has five modeled ventilation throats and four
downlights, whose positions are in `CORPO_BATH_DIVIDER_LIGHTS`. This companion
belongs to the bathroom's space allocation and is not hidden inside the
vanity's footprint or squeezed over a fixture's operation area.

`corpo-vanity.test.ts` ray-checks the basin cavity, rim, outlets, opaque mirror
leaves and clear underside; it also checks physical bounds, unit normals and
published PBR variants. Missing material keys fail the check rather than render
as white placeholders.

Apartment 1702 is explicitly separate. `loft-bathroom.ts` follows its vanity:
two independent faceted bowls with real cavities,
a horizontally ribbed floating cabinet and one broad mirror. It exports
`LOFT_VANITY_FIT`, `LOFT_VANITY_LIGHTS` and `loftBathroomRecipes`, using the same
2.2 × 0.6 m planning footprint. It has no Corpo trough or amber basin line.
The shared planted lattice suits both bathrooms. `loft-vanity.test.ts` checks both bowl interiors, rims, dry counter,
cabinet, canonical bounds, unit normals and actual PBR materials.
