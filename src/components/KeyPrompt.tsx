"use client";

import { useState } from "react";

/** Asks once for the e0gas server key before saving a station or a flag to the server. */
export default function KeyPrompt({
  error, onSubmit, onSkip,
}: { error?: string; onSubmit: (key: string) => void; onSkip: () => void }) {
  const [key, setKey] = useState("");
  return (
    <form
      className="px-5 pb-4 pt-5"
      onSubmit={(e) => { e.preventDefault(); if (key.trim()) onSubmit(key.trim()); }}
    >
      <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">Enter your server key</h2>
      <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
        Changes go to the e0gas server so every phone sees them. You only enter this once per device.
      </p>
      <input
        type="password"
        autoFocus
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Server key"
        autoComplete="off"
        className="mt-3 h-11 w-full rounded-xl bg-[var(--press)] px-3 text-[16px] text-[var(--ink)] outline-none ring-1 ring-[var(--ring)] placeholder:text-[var(--muted)] focus:ring-[var(--accent)]"
      />
      {error && <p className="mt-2 text-[12px] text-[var(--danger)]">{error}</p>}
      <button
        type="submit"
        disabled={!key.trim()}
        className="mt-3 h-12 w-full rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-[var(--on-accent)] disabled:opacity-50"
      >
        Save to server
      </button>
      <button type="button" onClick={onSkip} className="mt-2 w-full text-center text-[13px] font-medium text-[var(--muted)]">
        Keep it on this phone only
      </button>
    </form>
  );
}
