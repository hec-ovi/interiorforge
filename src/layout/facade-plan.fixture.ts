import { makeFixture } from "../blueprint/fixture.js";
import { validateRequest } from "../blueprint/validate.js";
import { edgeLength, type Point } from "../core/geom.js";
import type { Blueprint, FacadeGrid, Opening } from "../core/types.js";

/** Broad glazing bays with no structural permission at the pane divisions. */
export function broadFacadeFixture(seed = 31, angleDeg = 0) {
  const radians = angleDeg * Math.PI / 180;
  const outline: Point[] = ([[0, 0], [64, 0], [64, 26], [0, 26]] as Point[])
    .map(([x, z]) => [x * Math.cos(radians) - z * Math.sin(radians), x * Math.sin(radians) + z * Math.cos(radians)]);
  const grids: FacadeGrid[] = [];
  const blueprint: Blueprint = { buildingId: "wide-facade", facade: { wallDepth: 0.15, grids },
    floors: [0, 1, 2].map(index => {
      const openings: Opening[] = [];
      for (let edge = 0; edge < 4; edge++) {
        const length = edgeLength(outline, edge);
        const anchors = edge % 2 === 0
          ? [{ offset: 0.5, width: 1 }, ...[16, 32, 48].map(offset => ({ offset, width: 4 })), { offset: length - 0.5, width: 1 }]
          : [{ offset: 0.5, width: 1 }, { offset: length - 0.5, width: 1 }];
        grids.push({ floor: index, edge, partitionAnchors: anchors });
        if (index === 0 && edge === 0) {
          openings.push({ id: "street", kind: "door", edge, offset: 30, width: 2, sill: 0, height: 2.6, leaves: 2 });
          continue;
        }
        for (let i = 1; i < anchors.length; i++) {
          const offset = anchors[i - 1]!.offset + anchors[i - 1]!.width / 2;
          const end = anchors[i]!.offset - anchors[i]!.width / 2;
          openings.push({ id: `w:${index}:${edge}:${i}`, kind: "window", edge, offset,
            width: end - offset, sill: 0.4, height: 2.7 });
        }
      }
      return { index, kind: index === 0 ? "lobby" : "hotel", elevation: index * 3.9, height: 3.9, outline, openings };
    }) };
  const fixture = makeFixture({ seed, type: "hotel", tier: "rich", blueprint });
  fixture.request = validateRequest(fixture.request);
  return fixture;
}
