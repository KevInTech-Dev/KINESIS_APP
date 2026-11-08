"use client";

import { useEffect, useRef } from "react";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof layer.showPopover !== "function") return;

    const raiseLayer = () => {
      if (layer.matches(":popover-open")) layer.hidePopover();
      layer.showPopover();
    };

    raiseLayer();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
        raiseLayer();
      }
    });
    observer.observe(layer, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (layer.matches(":popover-open")) layer.hidePopover();
    };
  }, []);

  return (
    <div ref={layerRef} className="app-toast-layer" popover="manual">
      <SonnerToaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ duration: 10_000 }}
      />
    </div>
  );
}
