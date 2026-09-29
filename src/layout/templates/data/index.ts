/** Compiled or hand-authored template data, dimensions only. One import per key; a key
 *  without data is simply not offered by the registry. */
import b1_floor from "./b1-floor.json" with { type: "json" };
import b2_suite from "./b2-suite.json" with { type: "json" };
import b3_apartment from "./b3-apartment.json" with { type: "json" };
import b4_loft from "./b4-loft.json" with { type: "json" };
import c1_capsule from "./c1-capsule.json" with { type: "json" };
import c2_corridors from "./c2-corridors.json" with { type: "json" };
import c3_poor from "./c3-poor.json" with { type: "json" };
import c4_bathroom from "./c4-bathroom.json" with { type: "json" };
import c5_machine from "./c5-machine.json" with { type: "json" };
import c6_studio from "./c6-studio.json" with { type: "json" };
import c7_room from "./c7-room.json" with { type: "json" };
import e1_apartment from "./e1-apartment.json" with { type: "json" };
import e2_floor from "./e2-floor.json" with { type: "json" };
import e5_lobby2 from "./e5-lobby2.json" with { type: "json" };
import e6_apartment2 from "./e6-apartment2.json" with { type: "json" };
import r1_office from "./r1-office.json" with { type: "json" };

export const TEMPLATE_DATA: unknown[] = [
  b1_floor,
  b2_suite,
  b3_apartment,
  b4_loft,
  c1_capsule,
  c2_corridors,
  c3_poor,
  c4_bathroom,
  c5_machine,
  c6_studio,
  c7_room,
  e1_apartment,
  e2_floor,
  e5_lobby2,
  e6_apartment2,
  r1_office,
];
