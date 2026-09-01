import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface FloorSlice {
  y0: number;
  y1: number;
}

export interface Viewer3D {
  el: HTMLElement;
  setGlb(bytes: Uint8Array): Promise<void>;
  setFloorSlice(slice: FloorSlice | null): void;
}

export function createViewer3d(): Viewer3D {
  const container = document.createElement("div");
  container.className = "viewer3d";

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.localClippingEnabled = true;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161a);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  camera.position.set(45, 40, 45);
  const controls = new OrbitControls(camera, renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 100, 40);
  scene.add(sun);

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
      if (building) scene.remove(building);
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "",
      );
      building = gltf.scene;
      scene.add(building);
      const bounds = new THREE.Box3().setFromObject(building);
      controls.target.copy(bounds.getCenter(new THREE.Vector3()));
      applyClipping();
      resize();
    },
    setFloorSlice(slice) {
      clipping = slice !== null;
      if (slice) {
        // keep geometry with slice.y0 <= y <= slice.y1
        clipLow.constant = -slice.y0;
        clipHigh.constant = slice.y1;
      }
      applyClipping();
    },
  };
}
