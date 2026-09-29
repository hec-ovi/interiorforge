# Luxury reference furniture

Private rooms follow **V's Corpo Plaza apartment**. Public seating and
large botanical cases follow **Biotechnica hotel**. These are separate authored
families; room-specific producer selection prevents public lounge seating from
silently substituting for the apartment reference.

## Reference evidence

The Corpo Plaza apartment supplies the low bed deck, pale split headboard, exposed
sheet, diagonally folded botanical cover and bedside drawers; cream leather
channels, separate pad rows, exposed arm frame and gold accent pillow; dark paneled
cabinetry and polished counter; low media casework; and open wardrobe storage with
a clothing rail and folded textiles. The Biotechnica hotel supplies continuous raked
upholstered seat shells with two short neck pads, a black perimeter and a lower end
bay, and tall glazed botanical displays with a separately lit canopy and base.
Private bamboo follows the Corpo Plaza apartment.

Reference dimensions are unmeasured. Authored dimensions preserve practical use and
the generator's reservations; these are reference-driven adaptations, not claimed
measured asset replicas.

## Authored models

- **Public sofa/chair:** profiled continuous seat/back shells and pale woven
  contact surfaces, black structural casing, distinct neck pads and side arms.
- **Private sofa/chair:** narrow cream leather channels in two back/seat rows,
  exposed crossed supports, angled separate arm plates and filled gold cushion.
- **Bed ensemble:** thin dark deck and luminous front rim, pale split headboard,
  fitted sheet, closed diagonally folded cover with nonuniform raised folds,
  inflated pinched pillows and separate bedside drawers on slender supports.
- **Casework:** continuous photographed veneer, fine joint reveals, real pulls,
  open recessed kitchen basin, curved mixer, integrated refrigerator, low media
  credenza, pantry with shaped hollow glassware and necked bottles. Wardrobe
  includes a real rail/hangers, curved subdivided garment surfaces and folded cloth.
- **Botanical pieces:** segmented bamboo culms, branchlets and individually bent
  closed leaf blades. Public cases are 3 × 0.75 × 2.7 m with clear glazing and
  separate frame/base/canopy; private dividers remain compact, open bamboo.
- **Concierge:** a 3.8 × 1.0 × 1.1 m two-height counter with a staff desktop and
  accessible low return. This enlarged case fits the composition reservation.

## Materials

Dedicated keys use the `cyberpunk/` prefix:

- `corpo-plaza-leather/rich#cream`, 0.2 m grain.
- `biotechnica-upholstery/rich#ivory`, 0.2 m weave.
- `corpo-plaza-bedding/rich#botanical`, 2 m printed cloth field.
- `meridian-bedding/rich#ivory`, fine white sheet/garment cloth.
- `corpo-plaza-veneer/rich#smoked`, continuous 1 m veneer, no floor-plank joints.
- `corpo-plaza-stone/rich#polished`, separate from honed lobby flooring.
- `interior-alloy/rich#satin-fine`, 0.10 m stainless grain.

Textile surfaces use metric sewing coordinates; wardrobe garments have planar
cloth UVs. Sink walls use developed perimeter/depth coordinates, avoiding the
stretched wall texture produced by a flat top projection. Pillow print offsets
vary, rather than repeating the same botanical fragment on both pillows.

## Producer contracts

`model-geometry.ts` supplies smooth indexed surfaces, closed cloth, inflated
pillows, profiled seating and rotational hollow vessels. `MeshBuilder.addSurface`
retains these normals and metric UVs. Placement clearance copies the actual
triangles, including their inverse-transpose normal transforms.

`catalog-fits.ts` selects private seating for living/studio rooms, small bedroom
low tables as bedside drawers, living counters as media storage and kitchen
shelves as pantry fittings. Public botanical selection follows requested height.
Furniture identities and footprint reservations remain intact. Standalone
potted plants and office desk/chair still use their reviewed present catalog
models, with existing availability/licence handling.

The actual Engine GLB loader is used for watertightness, outward-facing cloth and
seat/basin tests. `reference-furniture.test.ts` checks every new reserved bound
and room-specific selection. These checks establish technical correctness,
**not visual fidelity**.
