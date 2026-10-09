"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (production builds only) and links the
 * web app manifest; React hoists the link and meta tags into <head>.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker left over from a production run on the same port would serve stale dev bundles.
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      // Store a newly deployed build's files now, while the network is here.
      .then((registration) => registration.active?.postMessage({ type: "refresh" }))
      .catch(() => {
        // The app still works online without it; offline use just is not available.
      });
  }, []);
  return (
    <>
      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="theme-color" content="#ff8a3d" />
    </>
  );
}
