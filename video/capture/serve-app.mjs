// Serves the app's static build (../out) plus the local model mirror
// (../mirror/models) using the app's own scripts/serve-static.mjs, on a port
// that stays clear of the other Guhit servers.
//
//   node capture/serve-app.mjs            (port 3191)
//   node capture/serve-app.mjs 3192       (another port)
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(appRoot);
process.env.PORT = process.argv[2] ?? process.env.PORT ?? "3191";
await import(join(appRoot, "scripts", "serve-static.mjs"));
