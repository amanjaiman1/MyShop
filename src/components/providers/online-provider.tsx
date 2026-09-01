"use client";

import * as React from "react";
import { CloudOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Connectivity awareness.
 *
 * Aurelia records money, so it must never let a purchase or a sale *appear* to
 * succeed while offline. Rather than queueing financial writes and hoping, the
 * app disables them and says why. `useOnline` is what those buttons read.
 */
const OnlineContext = React.createContext<boolean>(true);

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  // Assume online for the first paint: navigator.onLine is unavailable during
  // SSR, and flashing an offline banner on every load would be worse than a
  // brief optimistic assumption.
  const [online, setOnline] = React.useState(true);
  // Tracked here (not in the banner) so it can be set from the same event
  // handler as `online`, rather than in an effect that reacts to it.
  const [everOffline, setEverOffline] = React.useState(false);

  React.useEffect(() => {
    const update = () => {
      const next = navigator.onLine;
      setOnline(next);
      if (!next) setEverOffline(true);
    };
    // Read once on mount via the same handler, deferred to a microtask so the
    // initial paint isn't interrupted by a synchronous state update.
    const initial = window.setTimeout(update, 0);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <OnlineContext.Provider value={online}>
      {children}
      <OfflineBanner online={online} everOffline={everOffline} />
    </OnlineContext.Provider>
  );
}

export function useOnline(): boolean {
  return React.useContext(OnlineContext);
}

function OfflineBanner({
  online,
  everOffline,
}: {
  online: boolean;
  everOffline: boolean;
}) {
  // Show a reassuring "back online" flash only if we were actually offline.
  if (online && !everOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2",
        "text-xs font-medium transition-transform duration-[--dur-slow] ease-[--ease-out]",
        online
          ? "-translate-y-full bg-profit text-on-accent"
          : "translate-y-0 bg-loss text-on-accent shadow-md",
      )}
    >
      {online ? (
        <>
          <Wifi className="size-3.5" aria-hidden />
          Back online
        </>
      ) : (
        <>
          <CloudOff className="size-3.5" aria-hidden />
          You are offline — purchases and sales cannot be saved until you reconnect
        </>
      )}
    </div>
  );
}

/**
 * Wraps an action that must not run offline.
 * Returns the reason to show, or null when it is safe to proceed.
 */
export function offlineBlockReason(online: boolean, action: string): string | null {
  return online
    ? null
    : `${action} needs an internet connection. Aurelia will not pretend a transaction succeeded while offline.`;
}
