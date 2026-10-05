import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type W = Window & { __e0install?: InstallPrompt | null };

export type InstallState = "installed" | "prompt" | "ios" | "manual";

export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(() =>
    typeof window === "undefined" ? null : ((window as W).__e0install ?? null),
  );
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" &&
    (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true),
  );
  useEffect(() => {
    const onReady = () => setPrompt((window as W).__e0install ?? null);
    const onInstalled = () => setInstalled(true);
    addEventListener("e0:installable", onReady);
    addEventListener("appinstalled", onInstalled);
    return () => {
      removeEventListener("e0:installable", onReady);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const ios = typeof navigator !== "undefined" &&
    (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
  const state: InstallState = installed ? "installed" : prompt ? "prompt" : ios ? "ios" : "manual";

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    (window as W).__e0install = null;
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
  };
  return { state, install };
}
