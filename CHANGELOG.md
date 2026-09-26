# Changelog

0.36.1: `findPath` names a malformed nav with `E_NAV_INPUT` instead of throwing, checking each nav object once; routes alternate walks and single rides, so a ride never chains onto another. Routes onto the roof access level and across a stair whose entry moves between floors are tested. The contract states that anchors, roles and role IDs follow the models present, and that a consumer publishing props from another folder passes its own `presentModels`. The preview loads each prop once per session, frees the previous scene's instances on regeneration, shares one placeholder material, and reports props drawn as boxes apart from those not drawn.

0.36.0: `dist/nav.js` is the browser navigation entry. `findPath({nav, from, to})` routes across floors over a building's `npc.nav`, returning floor walks and the stair or lift connectors between them, or a coded error; endpoints snap within 1 m of walkable floor, one search per endpoint serves every connector entry on its floor, and walks between entries are cached per nav. `npm run build` builds both browser entries. Generation places only the furniture models the consumer holds (`presentModels`: the files beside the catalog), so a checkout without the licensed local models furnishes from the redistributable ones, and `missingModels` names the absent models furniture wanted. The preview draws a prop it cannot load as its fitted box and lists the missing models; the asset import keeps the published entry of a source it lacks. Assets keeps catalog lookup, model presence and the browser reader.

0.35.1: replaces the accidental full-wall timber fields in corporate-sectors and mirror-shutters with real charcoal panels, and mirror-frame with graphite panels. Family-specific frames, floors, ceilings and deliberate furniture timber remain intact. Generated wall materials are checked against the actual catalog slots.

0.35.0: pairs all seven reviewed Exterior families with their own proportions, programme and finishes, preserving authored window frames and returns. Distinct intermediate plates and programmes publish additional `floor-<index>` layouts, allowing real tapered interiors. Structural stairs have closed risers, soffits, shaft floors and full-depth enclosures; landing and doorway joins are fitted without layered floors. Variable-height flight sizing supports the white-grid 5 m podium with two 14-riser flights. Unusable stale doorways are closed while valid room access is retained. Bathroom fixtures use authored ceramic toilets and recessed basins facing the room; seated actor yaw and support-height conventions are documented for consumers.

0.33.0: every wall face a room owns is a nine-slice frame, its own face on the shell included, with 12 mm joints cut into the members and a frame band that contrasts its field; a stretched placement publishes `uvRepeat` so a fitted piece wears its map at the size the material publishes, and every module's UVs are tile units; rooms are lit to an illuminance band per kind, measured over their own floor area, with fixtures across the whole plate; halls furnish by area, so a shop floor fills with aisles, shelving, a seated bay and its carpet.

0.32.1: a pocket door connection publishes `clearDepth` 0 and the floor schema admits it; an open front still carries a positive traversable depth.

0.32.0: buildings furnish to the interior references: partitions are nine-slice panel frames with lit joints per room finish, floors are fitted slabs with carpets under seating, ceilings carry a fitted band, inset fields, spots and lit coves, every lit module publishes its emitter, built-in furniture modules (desks, counters, kitchen runs, planted beds, wardrobes, showers, basins, planters, screens, seating) furnish lobby, restaurant, office and residence programs by family, and every venue publishes its staff and guests.

0.31.15: an exterior connection lands on the room whose floor stands behind it across the open band, through the part of its span that meets that floor, so a portal facing a core wall still opens its venue; the kit sweep also generates every shell of the newest assembled city.

0.31.14: a pocket door opens on its published clearance: the frame and threshold stand on that passage behind the cassette back plane, and the cassette beside it stays solid wall, so every Exterior 0.58.12 plan generates.

0.31.13: a stack with basements, or with published indices starting above zero, opens on its lowest above-ground floor.

0.31.12: the pier check reads the walls the floor actually builds, a room whose partition finds no pier leaves the floor, only a stack with no core opens as its ground floor, and core feasibility publishes the stair the furnished building stands on.

0.31.11: a stack whose plates hold no core opens as its ground floor alone.

0.31.10: a building opens on the core its plate holds, recording any exterior reservation that core crosses, and builds one stair where a second cannot keep its headroom.

0.31.9: a room no wall can open into leaves the floor instead of closing the building.

0.31.8: the corridor reaches every stair and lift front, and a room wrapped around it opens a door from whichever arm lost its way in.

0.31.7: the core scans the whole corridor band when it cannot stand under the roof housing, and a stair that cannot reach the housing leaves the roof unreachable instead of closing the building.

0.31.6: two floor buildings open with a ground and a crown layout, and floor nobody can stand in is void instead of a room.

0.31.5: doors alone hold the reusable middle layout, each floor publishes its own window returns, the vertical core stands on the construction plate and a leftover thinner than a body is void, not room space.

0.31.4: rooms, surfaces and walls fit the floor's published room envelope, so notched kit plates furnish and the perimeter band stays open floor.

0.31.3: the reusable middle layout matches floors on geometry and program, so exterior dressing varies per floor.

0.31.2: the ceiling LED strip module names the published cyberpunk/light-fixture key.

0.31.1: layouts fit the published backing inset and record service room reductions per floor.

0.31.0: shared compressed room modules and three reusable placement layouts supply furnished buildings, opening identities and NPC navigation within measured export budgets.
