import { InteriorError } from "../core/errors.js";
import type { Point, Rect } from "../core/geom.js";
import type { InteriorRequest, RoofAccess } from "../core/types.js";
import { AGENT_RADIUS, STAIR, WALL } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { uvRectCorners, uvToWorld, worldToUv } from "./uv.js";

export interface RoofAccessPlan {
  access: RoofAccess;
  /** frame-space platform emitted at the roof threshold */
  landingUv: Rect;
}

/** Resolves Exterior's roof enclosure against stair A. Exterior guarantees the threshold,
 *  shared axis and arrival-side door; this pass proves the concrete instance still fits. */
export function planRoofAccess(request: InteriorRequest, core: CorePlan): RoofAccessPlan | null {
  const roof = request.blueprint.roof;
  const bulkhead = roof?.bulkhead;
  if (!bulkhead) return null;
  if (
    roof.elevation === undefined || !roof.outline
    || bulkhead.housingHeight === undefined || !bulkhead.doorNormal
    || bulkhead.doorWidth === undefined || bulkhead.doorHeight === undefined
  ) {
    throw new InteriorError("E_BLUEPRINT_INVALID", "roof bulkhead is missing its threshold, door or roof outline");
  }

  const axisLength = Math.hypot(...bulkhead.axis);
  const normalLength = Math.hypot(...bulkhead.doorNormal);
  const axisDot = (bulkhead.axis[0] * core.frame.cos + bulkhead.axis[1] * core.frame.sin) / (axisLength || 1);
  const frameCross: Point = [-core.frame.sin, core.frame.cos];
  const normalDot = (bulkhead.doorNormal[0] * frameCross[0] + bulkhead.doorNormal[1] * frameCross[1]) / (normalLength || 1);
  if (Math.abs(axisDot) < 0.999 || Math.abs(normalDot) < 0.999) {
    throw new InteriorError("E_BLUEPRINT_INVALID", "roof bulkhead axis or door side does not match the interior core frame");
  }
  if (bulkhead.doorHeight + 1e-6 < STAIR.headroom) {
    throw new InteriorError(
      "E_UNREACHABLE_SPACE",
      `roof door is ${bulkhead.doorHeight.toFixed(2)}m high, below the ${STAIR.headroom.toFixed(2)}m stair headroom`,
    );
  }

  const [centerU, centerV] = worldToUv(bulkhead.center, core.frame);
  const shaft = core.stairA;
  const shaftCenterU = shaft.u + shaft.lu / 2;
  const shaftCenterV = shaft.v + shaft.lv / 2;
  if (
    Math.abs(shaftCenterU - centerU) + shaft.lu / 2 > bulkhead.width / 2 + 1e-6
    || Math.abs(shaftCenterV - centerV) + shaft.lv / 2 > bulkhead.depth / 2 + 1e-6
  ) {
    throw new InteriorError("E_UNREACHABLE_SPACE", "stair-a does not fit inside the roof bulkhead cutout");
  }

  const side = normalDot < 0 ? -1 : 1;
  const doorV = centerV + side * bulkhead.depth / 2;
  const shaftV = side < 0 ? shaft.v : shaft.v + shaft.lv;
  const v0 = Math.min(doorV, shaftV);
  const v1 = Math.max(doorV, shaftV);
  const landingUv: Rect = {
    x: centerU - bulkhead.width / 2 + WALL,
    z: v0,
    w: bulkhead.width - 2 * WALL,
    d: v1 - v0,
  };
  if (landingUv.w + 1e-6 < STAIR.landing || landingUv.d < 0.05) {
    throw new InteriorError("E_UNREACHABLE_SPACE", "roof arrival landing does not fit between stair-a and the enclosure door");
  }

  const normal: Point = [bulkhead.doorNormal[0] / normalLength, bulkhead.doorNormal[1] / normalLength];
  const doorPosition: Point = [
    bulkhead.center[0] + normal[0] * bulkhead.depth / 2,
    bulkhead.center[1] + normal[1] * bulkhead.depth / 2,
  ];
  const entry: Point = [
    doorPosition[0] + normal[0] * (AGENT_RADIUS + 0.3),
    doorPosition[1] + normal[1] * (AGENT_RADIUS + 0.3),
  ];
  const topFloor = Math.max(...request.blueprint.floors.map((floor) => floor.index));
  return {
    landingUv,
    access: {
      floor: topFloor + 1,
      elevation: roof.elevation,
      stair: "stair-a",
      landing: uvRectCorners({ u: landingUv.x, v: landingUv.z, lu: landingUv.w, lv: landingUv.d })
        .map((point) => roundPoint(uvToWorld(point, core.frame))),
      door: {
        position: roundPoint(doorPosition), normal: roundPoint(normal),
        width: bulkhead.doorWidth, height: bulkhead.doorHeight,
        thresholdElevation: roof.elevation,
      },
      entry: roundPoint(entry),
    },
  };
}

function roundPoint([x, z]: Point): Point {
  return [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000];
}
