import { Composition } from "remotion";
import { CAMERA_FEED, CameraFeed } from "./CameraFeed";
import { Promo } from "./Promo";
import { FPS, TOTAL_FRAMES } from "./timeline";

export function Root() {
  return (
    <>
      {/* 16:9 first; 9:16 reuses every scene (each reads the canvas size). */}
      <Composition id="Guhit16x9" component={Promo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="Guhit9x16" component={Promo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
      {/* Utility: the fake phone-camera frame for the capture (capture/make-media.ts). */}
      <Composition id="CameraFeed" component={CameraFeed} durationInFrames={1} fps={FPS} width={CAMERA_FEED.width} height={CAMERA_FEED.height} defaultProps={{ drawing: "tala-dragon" }} />
    </>
  );
}
