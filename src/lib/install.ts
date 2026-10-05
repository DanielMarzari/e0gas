import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type W = Window & { __e0install?: InstallPrompt | null };

/** Which "how to install" steps to show when the browser can't prompt. */
export type InstallPlatform = "ios-safari" | "ios-other" | "android-samsung" | "android-firefox" | "android" | "desktop";

function detect(): InstallPlatform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/android/i.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Firefox/.test(ua)) return "android-firefox";
    return "android";
  }
  return "desktop";
}

export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(() =>
    typeof window === "undefined" ? null : ((window as W).__e0install ?? null),
  );
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" &&
    (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true),
  );
  const [platform] = useState<InstallPlatform>(() => (typeof window === "undefined" ? "desktop" : detect()));
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

  /** Shows the browser's own install dialog; false if it isn't available. */
  const install = async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    (window as W).__e0install = null;
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
    return true;
  };
  return { installed, canPrompt: !!prompt, platform, install };
}
