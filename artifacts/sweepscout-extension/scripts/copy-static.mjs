import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const publicDir = new URL("public/", root);
const distDir = new URL("dist/", root);

await fs.mkdir(distDir, { recursive: true });
await fs.cp(publicDir, distDir, { recursive: true });

const manifestPath = path.join(fileURLToPath(distDir), "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
manifest.version = process.env.npm_package_version ?? manifest.version;
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
