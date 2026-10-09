// Shared capture tooling: a headed Chrome with a persistent profile (the
// on-device models stay cached between runs), a screencast recorder that
// turns CDP frames into a constant 30 fps H.264 clip, and a tap on the
// page's Web Audio so the friend's real voice lands in the clip.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright";
// @ts-expect-error plain JS helper shared with scripts/voice.mjs
import { loudnormFilter } from "../scripts/loudnorm.mjs";

export const VIDEO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FOOTAGE = join(VIDEO, "footage");
export const WORK = join(VIDEO, ".capture");
export const PROFILE = join(WORK, "profile");
export const MEDIA = join(WORK, "media");
export const APP = process.env.GUHIT_URL ?? "http://localhost:3191";

export const PHONE = { width: 430, height: 932, scale: 2, mobile: true } as const;
export const LAPTOP = { width: 1280, height: 800, scale: 1.5, mobile: false } as const;
export type Device = typeof PHONE | typeof LAPTOP;

const FPS = 30;

/** A full ffmpeg build (ffmpeg-static); Remotion's own copy lacks the filters and muxers used here. */
export const FFMPEG = join(VIDEO, "node_modules", "ffmpeg-static", "ffmpeg");
export const FFPROBE = join(VIDEO, "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

export function ffmpeg(args: string[]) {
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { sleep };

export interface LaunchOptions {
  device: Device;
  /** Fake camera: a .y4m or .mjpeg file Chrome plays as the webcam. */
  camera?: string;
  /** Fake microphone: a .wav Chrome plays once each time the mic opens. */
  mic?: string;
}

/**
 * Headed Google Chrome (WebGPU needs a real GPU context), with a persistent
 * profile so /setup's downloaded models stay between runs.
 */
export async function launch({ device, camera, mic }: LaunchOptions): Promise<{ context: BrowserContext; page: Page }> {
  mkdirSync(PROFILE, { recursive: true });
  const args = [
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--enable-unsafe-webgpu",
    "--hide-scrollbars",
    "--disable-features=Translate",
  ];
  if (camera || mic) args.push("--use-fake-device-for-media-stream");
  if (camera) args.push(`--use-file-for-fake-video-capture=${camera}`);
  if (mic) args.push(`--use-file-for-fake-audio-capture=${mic}%noloop`);
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: false,
    hasTouch: device.mobile,
    // Phone layout from the viewport alone; the user agent stays desktop Chrome
    // so the engine picks the laptop GPU tier this machine really is.
    permissions: ["camera", "microphone"],
    args,
    ignoreDefaultArgs: ["--mute-audio"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

/** A clean viewport: no Next.js dev overlays exist in the static build, but hide the cursor. */
export async function hideCursor(page: Page) {
  await page.addStyleTag({ content: "*{cursor:none!important}" }).catch(() => {});
}

interface Frame {
  t: number;
  file: string;
}

interface AudioClip {
  /** Wall time (ms since epoch) the sound reaches the speaker. */
  wall: number;
  rate: number;
  sampleRate: number;
  samples: Float32Array;
}

/**
 * Records the page: JPEG screencast frames with their timestamps, marks for
 * the moments a scene needs (snap, landed, guess…), and every buffer the page
 * plays through Web Audio (the Kokoro voice).
 */
export class Recorder {
  private cdp: CDPSession | null = null;
  private frames: Frame[] = [];
  private marks: { label: string; t: number }[] = [];
  private clips: AudioClip[] = [];
  private dir: string;
  private n = 0;
  private writing: Promise<void>[] = [];
  private page: Page;
  private name: string;

  constructor(page: Page, name: string) {
    this.page = page;
    this.name = name;
    this.dir = join(WORK, "frames", name);
  }

  /** Call once per page before navigating: taps Web Audio playback. */
  static async tapAudio(page: Page, sink: (clip: AudioClip) => void) {
    await page.exposeBinding("__guhitAudioTap", (_src, payload: { wall: number; rate: number; sampleRate: number; b64: string }) => {
      const bytes = Buffer.from(payload.b64, "base64");
      const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      sink({ wall: payload.wall, rate: payload.rate, sampleRate: payload.sampleRate, samples: new Float32Array(samples) });
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __guhitAudioTap?: (p: unknown) => void };
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number, ...rest: number[]) {
        try {
          const buffer = this.buffer;
          if (buffer && w.__guhitAudioTap) {
            const ctx = this.context as AudioContext;
            const delay = Math.max(0, (when ?? 0) - ctx.currentTime);
            const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
            const data = buffer.getChannelData(0);
            const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            let bin = "";
            for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            w.__guhitAudioTap({
              wall: Date.now() + (delay + latency) * 1000,
              rate: this.playbackRate.value,
              sampleRate: buffer.sampleRate,
              b64: btoa(bin),
            });
          }
        } catch {
          // Recording must never break the page.
        }
        return original.call(this, when, ...rest);
      };
    });
  }

  addClip(clip: AudioClip) {
    this.clips.push(clip);
  }

  async start() {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const file = join(this.dir, `${String(this.n++).padStart(6, "0")}.jpg`);
      this.frames.push({ t: metadata.timestamp ?? Date.now() / 1000, file });
      this.writing.push(
        import("node:fs/promises").then((fs) => fs.writeFile(file, Buffer.from(data, "base64"))),
      );
      this.cdp?.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  }

  mark(label: string) {
    this.marks.push({ label, t: Date.now() / 1000 });
    console.log(`  [${this.name}] ${label}`);
  }

  /** Stops, writes footage/<name>.mp4 (30 fps, with the page's voice) and footage/<name>.json (marks in seconds). */
  async stop(extra: Record<string, unknown> = {}) {
    await this.cdp?.send("Page.stopScreencast").catch(() => {});
    await sleep(300);
    await Promise.all(this.writing);
    if (this.frames.length < 2) throw new Error(`${this.name}: no frames recorded`);
    const t0 = this.frames[0].t;
    const end = Math.max(this.frames[this.frames.length - 1].t + 1 / FPS, Date.now() / 1000);
    // Concat list: each frame holds until the next one arrived.
    const lines: string[] = [];
    for (let i = 0; i < this.frames.length; i++) {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : end;
      lines.push(`file '${this.frames[i].file}'`, `duration ${Math.max(0.001, next - this.frames[i].t).toFixed(4)}`);
    }
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`);
    const list = join(this.dir, "list.txt");
    writeFileSync(list, lines.join("\n"));

    mkdirSync(FOOTAGE, { recursive: true });
    const wav = this.clips.length ? this.writeAudio(t0, end) : null;
    const out = join(FOOTAGE, `${this.name}.mp4`);
    ffmpeg([
      "-f", "concat", "-safe", "0", "-i", list,
      ...(wav ? ["-i", wav] : []),
      "-vf", `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
      "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-movflags", "+faststart",
      // The friend's voice at a steady level (-16 LUFS), like the narration.
      ...(wav ? ["-af", loudnormFilter(wav), "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
      out,
    ]);
    const meta = {
      name: this.name,
      duration: end - t0,
      frames: this.frames.length,
      fpsCaptured: this.frames.length / (end - t0),
      marks: Object.fromEntries(this.marks.map((m) => [m.label, +(m.t - t0).toFixed(3)])),
      voice: this.clips.map((c) => ({ at: +((c.wall / 1000) - t0).toFixed(3), seconds: +(c.samples.length / c.sampleRate / c.rate).toFixed(3) })),
      ...extra,
    };
    writeFileSync(join(FOOTAGE, `${this.name}.json`), JSON.stringify(meta, null, 2));
    console.log(`  → ${out} (${meta.duration.toFixed(1)} s, ${meta.fpsCaptured.toFixed(1)} fps captured, ${this.clips.length} voice clips)`);
    return meta;
  }

  /** Mixes the tapped voice buffers onto the clip's timeline (48 kHz mono WAV). */
  private writeAudio(t0: number, end: number): string {
    const rate = 48000;
    const total = Math.ceil((end - t0) * rate);
    const mix = new Float32Array(total);
    for (const clip of this.clips) {
      const startAt = (clip.wall / 1000 - t0) * rate;
      // playbackRate speeds up (and pitches up) the buffer; resample linearly.
      const step = (clip.sampleRate * clip.rate) / rate;
      const outLen = Math.floor(clip.samples.length / step);
      for (let i = 0; i < outLen; i++) {
        const at = Math.round(startAt + i);
        if (at < 0 || at >= total) continue;
        const src = i * step;
        const k = Math.floor(src);
        const f = src - k;
        const a = clip.samples[k] ?? 0;
        const b = clip.samples[k + 1] ?? a;
        mix[at] += a + (b - a) * f;
      }
    }
    const file = join(this.dir, "voice.wav");
    writeFileSync(file, wavBytes(mix, rate));
    return file;
  }
}

export function wavBytes(samples: Float32Array, rate: number, channels = 1): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

export function need(file: string, hint: string) {
  if (!existsSync(file)) throw new Error(`Missing ${file}. ${hint}`);
}
