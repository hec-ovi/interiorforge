import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LightFixture } from "../../core/types.js";
import { FixtureLighting } from "./fixture-lighting.js";
import { el } from "../components/dom.js";
import { createPreviewEnvironment } from "./preview-environment.js";

export interface FloorSlice {
  y0: number;
  y1: number;
}

export interface Viewer3D {
  el: HTMLElement;
  setGlb(bytes: Uint8Array): Promise<void>;
  setFloorSlice(slice: FloorSlice | null): void;
  /** Displays the floor's published fixtures within the preview's shadow budget. */
  setLights(lights: readonly LightFixture[] | null): void;
  /** Stands the camera in a room at eye height, looking across it: what the player sees. */
  standIn(at: [number, number], eyeY: number, headingDeg: number): void;
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  container.append(renderer.domElement, hudTop, hudBottom, busyOverlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  const environment = createPreviewEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
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
  const fixtures = new FixtureLighting(renderer.capabilities.maxTextures);
  let publishedLights: readonly LightFixture[] = [];
  scene.add(fixtures.group);

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
        mesh.castShadow = true;
        mesh.receiveShadow = true;
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
      publishedLights = lights ?? [];
      ambient.intensity = publishedLights.length ? .15 : .75;
      sun.intensity = publishedLights.length ? 0 : 1.4;
      fixtures.set(publishedLights, camera.position);
    },
    standIn(at, eyeY, headingDeg) {
      const rad = (headingDeg * Math.PI) / 180;
      hudModeText.textContent = "EYE VIEW (+1.65m)";
      camera.position.set(at[0], eyeY, at[1]);
      fixtures.set(publishedLights, camera.position);
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
