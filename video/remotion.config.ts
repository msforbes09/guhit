// Remotion settings for `npx remotion render` and `npx remotion studio`.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");

// Use Playwright's headless shell when it is already on this machine (saves a download).
const shell = join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell");
if (existsSync(shell)) Config.setBrowserExecutable(shell);
