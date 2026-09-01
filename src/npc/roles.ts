import type {
  Anchor, AnchorKind, Animation, FloorInterior, InteriorRequest, NpcRole, RoleSlot, Routine, RoutineStep,
} from "../core/types.js";

interface RoleCtx {
  floors: FloorInterior[];
  anchors: Anchor[];
  roomKind: (floor: number, roomId: string) => string;
}

/** Deterministic staffing and routine loops from the anchors a building actually has. */
export function buildRoles(
  floors: FloorInterior[], anchors: Anchor[], request: InteriorRequest,
): { roles: RoleSlot[]; routines: Routine[] } {
  const roomKinds = new Map<string, string>();
  for (const f of floors) for (const r of f.rooms) roomKinds.set(`${f.floor}:${r.id}`, r.kind);
  const ctx: RoleCtx = {
    floors, anchors,
    roomKind: (floor, roomId) => roomKinds.get(`${floor}:${roomId}`) ?? "",
  };

  const roles: RoleSlot[] = [];
  const routines: Routine[] = [];
  let n = 0;
  const addRole = (role: NpcRole, floor: number, home: Anchor, count: [number, number], steps: RoutineStep[]) => {
    const id = `role-${n++}-${role}`;
    roles.push({ id, role, floor, homeAnchor: home.id, count });
    routines.push({ role: id, steps: steps.length > 0 ? steps : [step(home, [30, 90], "idle_stand")] });
  };

  for (const floor of floors) {
    const f = floor.floor;
    const on = (kind: AnchorKind, roomKind?: string) => findAnchors(ctx, f, kind, roomKind);
    switch (floor.kind) {
      case "lobby": {
        const counter = on("counter_spot", "reception")[0];
        if (counter) {
          addRole("receptionist", f, counter, [1, 1], [
            step(counter, [90, 300], "work_serve"),
            optional(on("toilet")[0], [3, 6], "use_toilet"),
            step(counter, [120, 360], "work_serve"),
            optional(on("idle_spot", "reception")[0], [5, 12], "idle_stand"),
          ].filter(Boolean) as RoutineStep[]);
        }
        const patrol = on("patrol_point")[0];
        if (patrol) {
          const rounds = securityRound(ctx, patrol);
          addRole("security", f, patrol, [1, 2], rounds);
        }
        break;
      }
      case "restaurant": {
        const cookSpot = on("work_spot", "kitchen")[0];
        if (cookSpot) {
          addRole("cook", f, cookSpot, [1, 2], [
            step(cookSpot, [120, 300], "work_cook"),
            optional(on("toilet")[0], [3, 6], "use_toilet"),
            step(cookSpot, [90, 240], "work_cook"),
          ].filter(Boolean) as RoutineStep[]);
        }
        const bar = on("counter_spot", "dining_area")[0];
        const tables = on("seat", "dining_area").slice(0, 3);
        if (bar) {
          addRole("waiter", f, bar, [1, 2], [
            step(bar, [15, 40], "work_serve"),
            ...tables.map((t) => step(t, [3, 8], "work_serve")),
          ]);
        }
        break;
      }
      case "coffee_shop": {
        const bar = on("counter_spot")[0];
        if (bar) {
          addRole("barista", f, bar, [1, 1], [
            step(bar, [120, 300], "work_serve"),
            optional(on("toilet")[0], [3, 6], "use_toilet"),
            step(bar, [90, 240], "work_serve"),
          ].filter(Boolean) as RoutineStep[]);
        }
        break;
      }
      // one shop occupies a commerce floor; a mall floor holds one shop per unit. Either
      // way each sales floor with a checkout is staffed from its own counter.
      case "retail":
      case "mall_floor": {
        for (const shop of floor.rooms.filter((r) => r.kind === "sales_floor")) {
          const counter = inRoom(ctx, f, shop.id, "counter_spot")[0];
          if (!counter) continue;
          const racks = inRoom(ctx, f, shop.id, "work_spot");
          addRole("clerk", f, counter, [1, Math.max(1, Math.min(3, Math.ceil(racks.length / 2)))], [
            step(counter, [60, 180], "work_serve"),
            ...racks.slice(0, 2).map((r) => step(r, [8, 20], "work_stock")),
            optional(on("toilet")[0], [3, 6], "use_toilet"),
            step(counter, [90, 240], "work_serve"),
          ].filter(Boolean) as RoutineStep[]);
        }
        break;
      }
      case "gym": {
        const machines = on("machine_spot").slice(0, 4);
        if (machines.length > 0) {
          addRole("trainer", f, machines[0]!, [1, 1],
            machines.map((m) => step(m, [15, 40], "exercise")));
        }
        break;
      }
      case "office":
      case "corpo_office": {
        const desks = on("work_spot", "office_open");
        if (desks.length > 0) {
          addRole("office_worker", f, desks[0]!, [Math.min(2, desks.length), desks.length], [
            step(desks[0]!, [90, 240], "work_type"),
            optional(on("toilet")[0], [3, 6], "use_toilet"),
            step(desks[0]!, [120, 300], "work_type"),
            optional(on("idle_spot", "office_open")[0], [5, 15], "idle_stand"),
          ].filter(Boolean) as RoutineStep[]);
        }
        const exec = on("work_spot", "executive_office")[0];
        const meeting = on("seat", "meeting")[0];
        if (exec) {
          addRole("executive", f, exec, [1, 1], [
            step(exec, [120, 300], "work_type"),
            optional(meeting, [30, 60], "idle_sit"),
            step(exec, [90, 240], "work_type"),
          ].filter(Boolean) as RoutineStep[]);
        }
        break;
      }
      case "residence_studio":
      case "apartment":
      case "hotel_rooms": {
        const beds = on("bed");
        const units = new Set(floor.rooms.map((r) => r.unit).filter(Boolean)).size;
        if (beds.length > 0 && units > 0) {
          const role: NpcRole = floor.kind === "hotel_rooms" ? "guest" : "resident";
          addRole(role, f, beds[0]!, [Math.min(units, beds.length), Math.min(units * 2, beds.length * 2)], [
            step(beds[0]!, [300, 540], "sleep"),
            optional(on("idle_spot", "living")[0] ?? on("idle_spot", "studio_main")[0], [60, 180], "idle_sit"),
            optional(on("toilet")[0], [3, 8], "use_toilet"),
          ].filter(Boolean) as RoutineStep[]);
        }
        break;
      }
      default:
        break;
    }
  }

  // one cleaner crew for the whole building, sweeping corridors bottom to top
  const sweeps = anchors.filter((a) => a.kind === "cleaning_spot").sort((a, b) => a.floor - b.floor);
  if (sweeps.length > 0) {
    const every = Math.max(1, Math.floor(sweeps.length / 6));
    const stops = sweeps.filter((_, i) => i % every === 0).slice(0, 6);
    const id = `role-${n++}-cleaner`;
    roles.push({
      id, role: "cleaner", floor: stops[0]!.floor, homeAnchor: stops[0]!.id,
      count: [1, Math.max(1, Math.ceil(floors.length / 10))],
    });
    routines.push({ role: id, steps: stops.map((s) => step(s, [10, 20], "sweep")) });
  }
  void request;
  return { roles, routines };
}

function securityRound(ctx: RoleCtx, home: Anchor): RoutineStep[] {
  const patrols = ctx.anchors
    .filter((a) => a.kind === "patrol_point" && a.id !== home.id)
    .sort((a, b) => a.floor - b.floor);
  const every = Math.max(1, Math.floor(patrols.length / 4));
  const stops = patrols.filter((_, i) => i % every === 0).slice(0, 4);
  return [
    step(home, [10, 25], "patrol_stand"),
    ...stops.map((s) => step(s, [5, 15], "patrol_stand")),
  ];
}

function findAnchors(ctx: RoleCtx, floor: number, kind: AnchorKind, roomKind?: string): Anchor[] {
  return ctx.anchors.filter(
    (a) => a.floor === floor && a.kind === kind && (!roomKind || ctx.roomKind(floor, a.room) === roomKind),
  );
}

/** Anchors of one room: shop units are staffed per unit, not per floor. */
function inRoom(ctx: RoleCtx, floor: number, roomId: string, kind: AnchorKind): Anchor[] {
  return ctx.anchors.filter((a) => a.floor === floor && a.room === roomId && a.kind === kind);
}

function step(anchor: Anchor, minutes: [number, number], animation: Animation): RoutineStep {
  return { anchor: anchor.id, minutes, animation };
}

function optional(anchor: Anchor | undefined, minutes: [number, number], animation: Animation): RoutineStep | null {
  return anchor ? step(anchor, minutes, animation) : null;
}
