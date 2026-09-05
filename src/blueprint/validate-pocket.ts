import { InteriorError } from "../core/errors.js";
import { edgeLength } from "../core/geom.js";
import type { BlueprintFloor, DoorEnvelope, Opening, PocketDoorMotion } from "../core/types.js";

const TOLERANCE = 1e-6;
type FaceRect = Pick<DoorEnvelope, "offset" | "sill" | "width" | "height">;
type Chamber = { opening: Opening; leaf: number; rect: FaceRect };

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

function contains(outer: FaceRect, inner: FaceRect): boolean {
  return inner.offset >= outer.offset - TOLERANCE && inner.sill >= outer.sill - TOLERANCE &&
    inner.offset + inner.width <= outer.offset + outer.width + TOLERANCE &&
    inner.sill + inner.height <= outer.sill + outer.height + TOLERANCE;
}

function overlaps(a: FaceRect, b: FaceRect): boolean {
  return Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset) > TOLERANCE &&
    Math.min(a.sill + a.height, b.sill + b.height) - Math.max(a.sill, b.sill) > TOLERANCE;
}

/** Face-local passage and leaf chambers share the producer's measured cassette. */
export function validatePocketDoors(floor: BlueprintFloor, wallDepth: number | undefined): void {
  const chambers: Chamber[] = [];
  for (const opening of floor.openings) {
    const door = opening.door;
    if (door?.motion?.kind !== "pocket") continue;
    const fail = (detail: string): never => {
      throw new InteriorError("E_BLUEPRINT_INVALID", `pocket door ${opening.id} ${detail}`, floor.index);
    };
    const motion = door.motion;
    // The request schema requires both envelopes for pocket motion.
    const cassette = door.cassette!;
    const clearance = door.clearance!;
    if (wallDepth === undefined) fail("requires measured facade wall depth");
    if (cassette.backDepth > wallDepth! + TOLERANCE) fail("cassette exceeds facade wall depth");
    const face = { offset: 0, sill: 0, width: edgeLength(floor.outline, opening.edge), height: floor.height };
    if (!contains(face, cassette)) fail("cassette exceeds its face or floor");
    if (!(Object.keys(face) as (keyof FaceRect)[]).every((key) => same(clearance[key], opening[key])) ||
      !same(clearance.backDepth, cassette.backDepth)) fail("clearance differs from its passage or cassette back depth");
    if (!contains(cassette, clearance)) fail("passage exceeds its cassette");
    validateLeaves(opening, motion, fail);
    const leafWidth = opening.width / motion.leaves.length;
    for (const leaf of motion.leaves) {
      const pocket = leaf.pocket;
      if (pocket.frontDepth >= pocket.backDepth || pocket.backDepth > cassette.backDepth + TOLERANCE) {
        fail(`leaf ${leaf.leaf} chamber depths exceed its free cassette volume`);
      }
      if (!contains(cassette, pocket)) fail(`leaf ${leaf.leaf} chamber exceeds its cassette`);
      const slot = leaf.travelU < 0 ? pocket.offset + pocket.width : pocket.offset;
      const passageEdge = opening.offset + (leaf.travelU < 0 ? 0 : opening.width);
      if (!same(slot, passageEdge) || overlaps(pocket, opening)) fail(`leaf ${leaf.leaf} chamber does not meet its passage-side slot`);
      const retractedStart = opening.offset + leaf.leaf * leafWidth + leaf.travelU;
      if (retractedStart < pocket.offset - TOLERANCE || retractedStart + leafWidth > pocket.offset + pocket.width + TOLERANCE) {
        fail(`leaf ${leaf.leaf} does not retract fully into its chamber`);
      }
      for (const other of floor.openings) {
        if (other !== opening && other.edge === opening.edge && overlaps(pocket, other)) {
          fail(`leaf ${leaf.leaf} chamber overlaps opening ${other.id}`);
        }
      }
      for (const other of chambers) {
        if (other.opening.edge === opening.edge && overlaps(pocket, other.rect)) {
          fail(`leaf ${leaf.leaf} chamber overlaps door ${other.opening.id} leaf ${other.leaf} chamber`);
        }
      }
      chambers.push({ opening, leaf: leaf.leaf, rect: pocket });
    }
  }
}

function validateLeaves(opening: Opening, motion: PocketDoorMotion, fail: (detail: string) => never): void {
  const indices = new Set<number>(motion.leaves.map((leaf) => leaf.leaf));
  if (opening.leaves !== motion.leaves.length || indices.size !== motion.leaves.length ||
    motion.leaves.some((_, index) => !indices.has(index))) fail("leaf identities differ from the opening leaf count");
  if (!same(motion.maxTravel, Math.max(...motion.leaves.map((leaf) => Math.abs(leaf.travelU))))) {
    fail("maximum travel differs from its moving leaves");
  }
}
