import { PMREMGenerator, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Soft room illumination for reading PBR surfaces in the inspection viewport. */
export function createPreviewEnvironment(renderer: WebGLRenderer): WebGLRenderTarget {
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  try { return generator.fromScene(room, 0.04); }
  finally { room.dispose(); generator.dispose(); }
}
