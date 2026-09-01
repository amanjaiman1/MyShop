"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker.
 *
 * Registration is deliberately skipped in development: a cached shell while
 * editing code is a debugging trap, not a feature.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration must never break the app — it only costs
        // offline shell caching.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
