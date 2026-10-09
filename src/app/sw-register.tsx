"use client";

import { useEffect } from "react";
import { requestPersistence } from "@/lib/ai/offline";

/**
 * Registers the offline service worker (production builds only) and links the
 * web app manifest; React hoists the link and meta tags into <head>.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Browsers grant persistent storage far more readily to an installed app,
    // so ask again right after a parent installs Guhit (or when it runs installed).
    const askToKeep = () => void requestPersistence();
    window.addEventListener("appinstalled", askToKeep);
    if (window.matchMedia("(display-mode: standalone)").matches) askToKeep();
    return () => window.removeEventListener("appinstalled", askToKeep);
  }, []);

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
