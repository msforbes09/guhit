"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { canvasToBlob } from "@/lib/story/image";
import { CutError, CutoutPreview, CuttingView, useBringToLife } from "./BringToLife";
import { useFriends } from "./FriendsGrid";
import { Camera, ImageIcon } from "./icons";
import { ShelfFull } from "./ShelfFull";
import { Button, Sheet, TopBar } from "./ui";

type CameraState = "starting" | "live" | "none";

/** The framing box covers this share of the viewfinder on every side. */
const FRAME_INSET = 0.09;

export function SnapScreen() {
  const life = useBringToLife();
  const shelf = useFriends();
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [mirrored, setMirrored] = useState(false);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);

  const showCamera = life.phase === "idle" && shelf.friends !== null && !shelf.full;
  const shelfFullNow = (life.phase === "idle" && shelf.full) || life.phase === "full";

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // The live camera runs only while the viewfinder is on screen.
  useEffect(() => {
    if (!showCamera) return;
    let cancelled = false;
    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("none");
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const facing = media.getVideoTracks()[0]?.getSettings().facingMode;
        // Laptop webcams face the child: mirror the preview so moving the
        // paper left moves it left on screen. The snapshot is never mirrored.
        setMirrored(facing !== "environment");
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => {});
        }
        setCamera("live");
      } catch {
        if (!cancelled) setCamera("none");
      }
    };
    open();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [showCamera, stopCamera]);

  const capture = useCallback(async () => {
    const v = video.current;
    const box = frame.current;
    if (!v || !box || !v.videoWidth) return;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    const scale = Math.max(cw / v.videoWidth, ch / v.videoHeight);
    const ox = (cw - v.videoWidth * scale) / 2;
    const oy = (ch - v.videoHeight * scale) / 2;
    const bx = cw * FRAME_INSET;
    const by = ch * FRAME_INSET;
    const bw = cw * (1 - FRAME_INSET * 2);
    const bh = ch * (1 - FRAME_INSET * 2);
    const sw = bw / scale;
    const sh = bh / scale;
    const sx = mirrored ? v.videoWidth - (bx + bw - ox) / scale : (bx - ox) / scale;
    const sy = (by - oy) / scale;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext("2d")?.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 260);
    const blob = await canvasToBlob(canvas, "image/jpeg");
    stopCamera();
    life.start(blob);
  }, [life, mirrored, stopCamera]);

  // A webcam faces the child, who needs both hands for the paper: count down.
  const snap = () => {
    if (!mirrored) return void capture();
    setCount(3);
  };
  useEffect(() => {
    if (count <= 0) return;
    const id = setTimeout(() => {
      if (count === 1) {
        setCount(0);
        capture();
      } else setCount(count - 1);
    }, 800);
    return () => clearTimeout(id);
  }, [count, capture]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stopCamera();
    life.start(file);
  };

  const pickPhoto = () => fileInput.current?.click();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
      <TopBar
        title={shelfFullNow ? "Make room" : life.phase === "preview" || life.phase === "saving" ? "Ta-da!" : "Snap your drawing"}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
      />

      <div className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        {showCamera && camera !== "none" && (
          <div className="flex flex-1 flex-col items-center gap-5">
            <div
              ref={frame}
              className="crayon-edge relative w-full flex-1 overflow-hidden rounded-cut-lg bg-ink shadow-soft max-h-[62vh] min-h-[46vh] sm:min-h-[52vh]"
            >
              <video
                ref={video}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
              />
              {camera === "starting" && (
                <p className="absolute inset-0 grid place-items-center font-display text-2xl font-bold text-white">
                  Opening the camera…
                </p>
              )}
              {/* Framing box: everything inside it is what gets cut out. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute rounded-[28px] border-4 border-dashed border-white shadow-[0_0_0_100vmax_rgb(42_34_56/0.45)]"
                style={{ inset: `${FRAME_INSET * 100}%` }}
              />
              <p className="absolute inset-x-0 top-3 mx-auto w-fit max-w-[88%] rounded-full bg-white/95 px-4 py-2 text-center font-display text-lg font-bold text-ink shadow-soft sm:text-xl">
                {mirrored ? "Hold your drawing up and fill the box" : "Put your drawing on a table, fill the box"}
              </p>
              {count > 0 && (
                <span
                  key={count}
                  className="anim-pop-in absolute inset-0 grid place-items-center font-display text-[9rem] font-black text-white [text-shadow:0_6px_24px_rgb(42_34_56/0.6)]"
                  aria-live="assertive"
                >
                  {count}
                </span>
              )}
              {flash && <span aria-hidden="true" className="absolute inset-0 bg-white" />}
            </div>

            <div className="flex w-full items-center justify-center gap-5">
              <Button
                tone="paper"
                size="md"
                onClick={pickPhoto}
                icon={<ImageIcon size={28} weight="bold" aria-hidden="true" />}
                className="max-sm:hidden"
              >
                Use a photo
              </Button>
              <button
                type="button"
                onClick={snap}
                disabled={camera !== "live" || count > 0}
                className="crayon-edge press grid h-28 w-28 place-items-center rounded-full bg-sun text-ink sm:h-32 sm:w-32"
                aria-label="Snap the photo"
              >
                <span className="flex flex-col items-center">
                  <Camera size={52} weight="fill" aria-hidden="true" />
                  <span className="font-display text-xl font-black">Snap!</span>
                </span>
              </button>
              <Button
                tone="paper"
                size="md"
                onClick={pickPhoto}
                icon={<ImageIcon size={28} weight="bold" aria-hidden="true" />}
                className="sm:hidden"
              >
                Photo
              </Button>
            </div>
          </div>
        )}

        {showCamera && camera === "none" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
            <Sheet className="flex w-full max-w-lg flex-col items-center gap-5 p-6 text-center sm:p-8">
              <div className="grid h-40 w-full place-items-center rounded-[24px] border-4 border-dashed border-paper-edge bg-white">
                <Camera size={72} weight="duotone" className="text-sky-deep" aria-hidden="true" />
              </div>
              <p className="text-xl font-bold text-ink-soft">Put your drawing on a table and fill the picture with it.</p>
              <Button tone="sun" size="lg" onClick={pickPhoto} icon={<Camera size={36} weight="fill" aria-hidden="true" />} className="w-full">
                Take a photo
              </Button>
            </Sheet>
          </div>
        )}

        {shelfFullNow && shelf.friends && (
          <ShelfFull
            friends={shelf.friends}
            onChange={() => {
              shelf.refresh();
              if (life.phase === "full") life.backToPreview();
            }}
          />
        )}
        {life.phase === "cutting" && <CuttingView photo={life.photo} />}
        {(life.phase === "preview" || life.phase === "saving") && life.result && (
          <CutoutPreview
            cut={life.result.cut}
            saving={life.phase === "saving"}
            retakeLabel="Take it again"
            onRetake={life.reset}
            onAccept={life.accept}
          />
        )}
        {life.phase === "error" && <CutError onRetry={life.reset} />}
      </div>
    </main>
  );
}
