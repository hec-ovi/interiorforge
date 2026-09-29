# Luxury reference kit

Three references informed this set: the Biotechnica apartment (calm joinery,
planted window line), the Peralez residence (curved timber counter, stone top,
bronze edge and open circulation) and the Konpeki guest suite (low timber platform,
upholstered headboard, controlled concealed lighting). These are appearance
references; no image-derived measurement is claimed.

Seven procedural modules use metric UVs and the published materials catalog.
Rounded perimeter prisms, bevelled upholstery, cushion seams, plinth shadow gaps,
bronze edges, a low concierge writing ledge and sink/cooktop components are actual
geometry. The concierge keeps its staff side open. Everything stays within its
reserved XZ footprint. Bed placement height is mattress height; the headboard
extends higher, following the existing furniture contract.

Whole salon, seating, kitchen and suite groups reserve their approach area before
placement. Fitting tries the room perimeter before the middle, includes exact far
edges on non-grid-sized rooms, and accepts no group that intersects the supplied
circulation reservations. Fixed furniture proportions do not stretch to building
size; the count and arrangement fit the available room.

`luxury-style.test.ts` checks module bounds, deterministic rotations and aisle
clearance, complete 40m/64m mirror-frame assemblies and a general 60m floor plate.
The mirror-frame exterior snaps to 8m bays: a 60m lot needs a family-supported
56m/64m shell, not a stretched 60m mirror-frame.

Wall and floor finishes follow the broad stone joints of the Peralez residence.
Public floors use 2 × 1.5 m honed limestone
pieces with real 3 mm joints and continuous support ending 2 mm below Y0;
thresholds and landings retain complete structural slabs at Y0. Both the stone
and mineral wall maps repeat at their published 2 m scale. Walls use broad
panels, 4 mm backed reveals and 90 mm unlit metal skirting. The old 500 mm
picture frames and their luminous upper/lower borders are absent. Office
partition glass keeps 25 mm metal rails; bedroom timber and wet-room finishes
remain room-specific. The balcony-grid architecture preserves this composition.

The value hierarchy keeps a building from reading as a single dark brown room.
The Biotechnica apartment shows calm pale engineered plates against narrow dark
joints, window hardware and darker fittings. Reception, resident lounges,
corridors and inhabited apartment rooms therefore use the fine ivory field;
elevator lobbies and mechanical/stair-core interiors keep graphite mineral.
Wet/service finishes and the honed stone floor retain their existing materials.
The ivory `cyberpunk/ivory-panel/rich#meridian-satin` micrograin repeats at 1 m.
Ceiling main panels share that field, while graphite metal service bands
and the modeled vents remain dark. This changes material bindings and room
selection only, without wider trim, new emission or raised floor geometry.

Wall backing and face skins own disjoint depths: backing 0–88 mm, mineral/ivory
skin 88–95 mm. This keeps exposed doorway and wall-end caps free of coincident
black/white faces at grazing angles. The 95 mm external datum is unchanged.
`luxury-wall-ownership.test.ts` verifies the actual quantized exports through
the Engine loader.

Fixed public/hospitality portals use the Biotechnica portal grammar: 300 mm broad formed surrounds, 240 mm upper corner radii,
170 mm maximum depth per face and real 30 mm recessed rounded service slots.
Straight jamb/header runs stretch independently; corners and slots do not.
The minimum rectangular passage remains clear. A portal is used only where
both adjoining public rooms provide enough opaque wall span and headroom;
stairs, lifts, wet/service doors and main apartment pocket entries keep their
existing ownership. `thresholds.ts` derives the correct clear width from the
new central header. No module spans the passage with a bounding-box collider.

Private living/studio rooms pair quiet walnut wall fields and polished dark
stone slabs (published Corpo reference materials); pale public/bedroom fields
and the ceiling service bands provide contrast. `luxury-portals.test.ts`
checks decoded GLB apertures/closure at three widths, constant radii, recessed
slots, generated routing and rotated threshold support.
