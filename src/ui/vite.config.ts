import { createReadStream, existsSync, readdirSync } from "node:fs";
import { basename, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { materialsDir } from "../materials/load.js";

const MIME: Record<string, string> = {
  ".glb": "model/gltf-binary", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ktx2": "image/ktx2",
};

/** Serves the materials database at /materials so the preview shows textured buildings the
 *  moment it opens; the generated GLB points its image URIs here. */
function materialsRoute(): Plugin {
  const root = materialsDir();
  return {
    name: "urbe-materials",
    configureServer(server) {
      server.middlewares.use("/materials", (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!)).replace(/^(\.\.[/\\])+/, "");
        const file = join(root, rel);
        if (!file.startsWith(root) || !existsSync(file)) return next();
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** Where the city's shared resources stand: `URBE_SHARED_DIR`, else the sibling engine's
 *  published kit plans. The plan samples fetch their blueprints from here. */
function sharedDir(): string {
  return process.env.URBE_SHARED_DIR ?? fileURLToPath(new URL("../../../engine/out/shared", import.meta.url));
}

function sharedRoute(): Plugin {
  const root = sharedDir();
  return {
    name: "urbe-shared",
    configureServer(server) {
      server.middlewares.use("/shared", (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!)).replace(/^(\.\.[/\\])+/, "");
        const file = join(root, rel);
        if (!file.startsWith(root) || !existsSync(file)) return next();
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** Exposes ignored, license-restricted imports to the local preview only; the route's root
 *  lists the model files present, which is what generation may place. */
function interiorAssetsRoute(): Plugin {
  const root = fileURLToPath(new URL("../assets/models", import.meta.url));
  return {
    name: "urbe-interior-assets",
    configureServer(server) {
      server.middlewares.use("/interior-assets", (req, res, next) => {
        const requested = decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^[/\\]+/, "");
        if (!requested) {
          res.setHeader("content-type", MIME[".json"]!);
          res.end(JSON.stringify(readdirSync(root).filter(name => extname(name) === ".glb").sort()));
          return;
        }
        if (requested !== basename(requested)) return next();
        const file = join(root, requested);
        if (!existsSync(file)) return next();
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [materialsRoute(), sharedRoute(), interiorAssetsRoute()],
});
