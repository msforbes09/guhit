// Serves the app's static build (../out) plus the local model mirror
// (../mirror/models) using the app's own scripts/serve-static.mjs, on a port
// that stays clear of the other Guhit servers.
//
//   node capture/serve-app.mjs              (port 3191)
//   node capture/serve-app.mjs 3192         (another port)
//   node capture/serve-app.mjs --isolate    (cross-origin isolated, like the live site's headers)
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(appRoot);
const args = process.argv.slice(2);
process.env.PORT = args.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? "3191";
if (args.includes("--isolate")) process.env.ISOLATE = "1";
await import(join(appRoot, "scripts", "serve-static.mjs"));
