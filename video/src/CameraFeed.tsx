// What the phone camera sees in the capture: the sample drawing on a sheet of
// paper lying on the same wooden table as the opening shots, from above.
// Rendered to a still (scripts/camera-feed.mjs) and fed to Chrome as a fake webcam.
import { AbsoluteFill, Img, staticFile } from "remotion";
import { STILLS } from "./components/PaperShot";

export const CAMERA_FEED = { width: 960, height: 1280 };

export function CameraFeed({ drawing = "tala-dragon" }: { drawing?: string }) {
  const still = STILLS.handsCrayon;
  // Cover the frame with the still's wood (left of the paper), softly out of focus.
  const scale = 1.05;
  return (
    <AbsoluteFill style={{ background: "#c89a63", overflow: "hidden" }}>
      <Img
        src={staticFile(still.src)}
        style={{
          position: "absolute",
          width: still.w * scale,
          height: still.h * scale,
          left: 0,
          top: -300 * scale,
          maxWidth: "none",
          filter: "blur(2px) saturate(0.95)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 150,
          width: 720,
          height: 960,
          transform: "rotate(-3.5deg)",
          background: "linear-gradient(160deg, #fffdf8 0%, #f7f3ea 60%, #efe9dc 100%)",
          boxShadow: "0 30px 40px -16px rgba(60,35,10,0.45), 0 4px 10px rgba(60,35,10,0.25)",
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile(`drawings/${drawing}.png`)}
          style={{
            width: "100%",
            height: "100%",
            mixBlendMode: "multiply",
            filter: "brightness(1.07) contrast(1.1)",
          }}
        />
      </div>
      {/* A little warm light from the window, like the stills. */}
      <AbsoluteFill style={{ background: "radial-gradient(90% 70% at 15% 10%, rgba(255,226,170,0.22), rgba(0,0,0,0) 60%), radial-gradient(80% 60% at 90% 95%, rgba(40,20,0,0.18), rgba(0,0,0,0) 60%)" }} />
    </AbsoluteFill>
  );
}
