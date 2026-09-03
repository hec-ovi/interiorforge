import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LightFixture } from "../../core/types.js";
import { el } from "../components/dom.js";

export interface FloorSlice {
  y0: number;
  y1: number;
}

export interface Viewer3D {
  el: HTMLElement;
  setGlb(bytes: Uint8Array): Promise<void>;
  setFloorSlice(slice: FloorSlice | null): void;
  /** Instantiates the floor's own fixtures, so the preview shows the room as it will be lit. */
  setLights(lights: readonly LightFixture[] | null): void;
  /** Stands the camera in a room at eye height, looking across it: what the player sees. */
  standIn(at: [number, number], eyeY: number, headingDeg: number): void;
}

/** How many lights the preview instantiates before it stops adding more. */
const MAX_LIGHTS = 60;
/** Lumens per three.js point-light unit at this scale. */
const LUMEN_SCALE = 900;

/** Approximate sRGB colour of a black body at that temperature. */
function whiteAt(kelvin: number): THREE.Color {
  const t = Math.max(1800, Math.min(8000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  return new THREE.Color(
    Math.min(1, Math.max(0, r / 255)),
    Math.min(1, Math.max(0, g / 255)),
    Math.min(1, Math.max(0, b / 255)),
  );
}

export function createViewer3d(): Viewer3D {
  const container = document.createElement("div");
  container.className = "viewer3d";

  // HUD Elements
  const hudModeText = el("span", { class: "hud-highlight" }, ["BUILDING VIEW"]);
  const hudTop = el("div", { class: "viewer-hud viewer-hud-top" }, [
    el("div", { class: "viewer-hud-tag" }, [
      "3D VIEWPORT // ",
      hudModeText,
    ]),
  ]);

  const hudBottom = el("div", { class: "viewer-hud viewer-hud-bottom" }, [
    "LMB: ROTATE  •  RMB: PAN  •  WHEEL: ZOOM",
  ]);

  const busyOverlay = el("div", { class: "viewer-busy-overlay" }, [
    el("div", { class: "busy-spinner" }),
    el("span", { class: "busy-label" }, ["UPDATING 3D GEOMETRY..."]),
  ]);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  container.append(renderer.domElement, hudTop, hudBottom, busyOverlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  camera.position.set(45, 40, 45);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 100, 40);
  scene.add(sun);
  const fixtures = new THREE.Group();
  scene.add(fixtures);

  let building: THREE.Group | null = null;
  const clipLow = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const clipHigh = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  let clipping = false;

  function resize(): void {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  function applyClipping(): void {
    if (!building) return;
    building.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const material = mesh.material as THREE.Material;
        material.clippingPlanes = clipping ? [clipLow, clipHigh] : null;
        material.clipIntersection = false;
      }
    });
  }

  return {
    el: container,
    async setGlb(bytes) {
      busyOverlay.classList.add("active");
      try {
        if (building) scene.remove(building);
        const loader = new GLTFLoader();
        const copy = new Uint8Array(bytes); // detach from any shared buffer for the loader
        const gltf = await loader.parseAsync(copy.buffer as ArrayBuffer, "");
        building = gltf.scene;
        scene.add(building);
        // real parcels live at city coordinates: fit the camera to the building
        const bounds = new THREE.Box3().setFromObject(building);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3()).length();
        controls.target.copy(center);
        camera.position.set(center.x + size * 0.55, center.y + size * 0.45, center.z + size * 0.55);
        camera.near = Math.max(0.1, size / 500);
        camera.far = size * 20;
        camera.updateProjectionMatrix();
        applyClipping();
        resize();
      } finally {
        busyOverlay.classList.remove("active");
      }
    },
    setLights(lights) {
      fixtures.clear();
      // the fixtures light the room; daylight drops back so what is seen is the interior's own
      ambient.intensity = lights && lights.length > 0 ? 0.18 : 0.75;
      sun.intensity = lights && lights.length > 0 ? 0.15 : 1.4;
      if (!lights) return;
      let budget = MAX_LIGHTS;
      for (const fixture of lights) {
        if (budget <= 0) break;
        const points = fixture.length > 2 ? Math.min(3, Math.ceil(fixture.length / 3)) : 1;
        const rad = (fixture.angleDeg * Math.PI) / 180;
        for (let i = 0; i < points && budget > 0; i++) {
          const t = points === 1 ? 0 : (i / (points - 1) - 0.5) * fixture.length;
          const light = new THREE.PointLight(
            whiteAt(fixture.colorTemperatureK),
            fixture.intensity / LUMEN_SCALE / points,
            fixture.range * (1 + fixture.diffuse),
            1.4,
          );
          // an uplighting cove sits a little above its lip, where its wash starts
          light.position.set(
            fixture.position[0] + Math.cos(rad) * t,
            fixture.position[1] + (fixture.facing === "up" ? 0.09 : -0.05),
            fixture.position[2] + Math.sin(rad) * t,
          );
          fixtures.add(light);
          budget--;
        }
      }
    },
    standIn(at, eyeY, headingDeg) {
      const rad = (headingDeg * Math.PI) / 180;
      hudModeText.textContent = "EYE VIEW (+1.65m)";
      camera.position.set(at[0], eyeY, at[1]);
      controls.target.set(at[0] + Math.sin(rad) * 6, eyeY - 0.4, at[1] + Math.cos(rad) * 6);
      camera.near = 0.05;
      camera.far = 400;
      camera.updateProjectionMatrix();
      controls.update();
    },
    setFloorSlice(slice) {
      clipping = slice !== null;
      if (slice) {
        hudModeText.textContent = `FLOOR SLICE (${slice.y0.toFixed(1)}m - ${slice.y1.toFixed(1)}m)`;
        // keep geometry with slice.y0 <= y <= slice.y1
        clipLow.constant = -slice.y0;
        clipHigh.constant = slice.y1;
      } else {
        hudModeText.textContent = "BUILDING VIEW";
      }
      applyClipping();
    },
  };
}
