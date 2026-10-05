"use client";

import type { InstallPlatform } from "@/lib/install";
import { CloseIcon, ShareIcon } from "@/components/icons";

const STEPS: Record<InstallPlatform, { browser: string; steps: React.ReactNode[] }> = {
  "ios-safari": {
    browser: "iPhone · Safari",
    steps: [
      <>Tap the <b>Share</b> button <Share /> in the toolbar (on iOS 26, tap <b>•••</b> first, then <b>Share</b>).</>,
      <>Scroll down and tap <b>Add to Home Screen</b>. If you don&apos;t see it, tap <b>Edit Actions</b> to add it.</>,
      <>Tap <b>Add</b>. e0 gas opens full-screen from your Home Screen.</>,
    ],
  },
  "ios-other": {
    browser: "iPhone · Chrome / Firefox / Edge",
    steps: [
      <>Tap the <b>Share</b> button <Share /> in the address bar (Chrome: top-right).</>,
      <>Tap <b>Add to Home Screen</b> (scroll down if needed).</>,
      <>Tap <b>Add</b>. Needs iOS 16.4 or later — otherwise open this page in Safari.</>,
    ],
  },
  android: {
    browser: "Android · Chrome",
    steps: [
      <>Tap the <b>⋮</b> menu at the top-right.</>,
      <>Tap <b>Add to Home screen</b> (or <b>Install app</b>).</>,
      <>Tap <b>Install</b> / <b>Add</b>.</>,
    ],
  },
  "android-samsung": {
    browser: "Android · Samsung Internet",
    steps: [
      <>Tap the <b>☰</b> menu at the bottom-right.</>,
      <>Tap <b>Add page to</b> → <b>Home screen</b>.</>,
      <>Tap <b>Add</b>.</>,
    ],
  },
  "android-firefox": {
    browser: "Android · Firefox",
    steps: [<>Tap the <b>⋮</b> menu.</>, <>Tap <b>Install</b> (or <b>Add to Home screen</b>).</>, <>Tap <b>Add</b>.</>],
  },
  desktop: {
    browser: "Computer",
    steps: [
      <>In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose <b>Install e0 gas</b>.</>,
      <>On a phone, open this page and use Settings → Add to Home Screen.</>,
    ],
  },
};

function Share() {
  return <span className="mx-0.5 inline-grid h-5 w-5 translate-y-1 place-items-center rounded bg-[var(--accent-soft)] text-[var(--accent)]"><ShareIcon size={13} /></span>;
}

/** Step-by-step "Add to Home Screen" for browsers that can't show an install button. */
export default function InstallSheet({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  const { browser, steps } = STEPS[platform];
  return (
    <div className="px-5 pb-5 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">Add to Home Screen</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{browser}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--press)] text-[var(--muted)]">
          <CloseIcon />
        </button>
      </div>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-snug text-[var(--ink)]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[12px] font-semibold text-[var(--on-accent)]">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
