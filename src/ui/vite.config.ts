import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { materialsDir } from "../materials/load.js";

const MIME: Record<string, string> = {
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ktx2": "image/ktx2",
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

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [materialsRoute()],
});
