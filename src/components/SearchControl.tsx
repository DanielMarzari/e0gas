"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { CloseIcon, FilterIcon, SearchIcon } from "@/components/icons";

const BUTTON = 48;
/** Widest the bar gets (matches the bottom sheet's max width). */
const MAX_BAR = 576;
const SURFACE =
  "bg-[var(--surface-strong)] shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-[var(--ring)] backdrop-blur-md";

/**
 * Opening: the bar springs open leftward from the button with a little overshoot,
 * then the text, filter and close roll up one after another.
 * Closing: those drop away first, the bar slides back right, and the button
 * (icon still showing) does the same press-and-pop as the other round buttons.
 */
const bar: Variants = {
  closed: {
    width: BUTTON,
    transition: { when: "afterChildren", width: { type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.28 } },
  },
  open: (w: number) => ({
    width: w,
    transition: {
      // Springy but never past its final width, so it stays on screen.
      width: { type: "spring", stiffness: 260, damping: 30, restDelta: 0.5 },
      delayChildren: 0.14,
      staggerChildren: 0.07,
    },
  }),
};
/** Same press-and-pop the other round buttons use. */
const POP = { type: "spring", stiffness: 520, damping: 20 } as const;
const part: Variants = {
  closed: { opacity: 0, y: 10, transition: { duration: 0.09 } },
  open: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 500, damping: 30 } },
};

function useBarWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 360 : Math.min(window.innerWidth - 32, MAX_BAR)));
  useEffect(() => {
    const on = () => setW(Math.min(window.innerWidth - 32, MAX_BAR));
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return w;
}

export default function SearchControl({
  open, query, onQueryChange, onOpen, onClose, onInputFocus,
  filterCount, filterOpen, onToggleFilter, closedBadge,
}: {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onInputFocus: () => void;
  /** Filters other than the typed search. */
  filterCount: number;
  filterOpen: boolean;
  onToggleFilter: () => void;
  /** Count shown on the round button while closed (filters still applied). */
  closedBadge: number;
}) {
  const width = useBarWidth();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <motion.div
          key="bar"
          custom={width}
          variants={bar}
          initial="closed"
          animate="open"
          exit="closed"
          style={{ borderRadius: BUTTON / 2, originX: 1 }}
          className={`flex h-12 shrink-0 items-center overflow-hidden focus-within:ring-[var(--accent)] ${SURFACE}`}
        >
          {/* The glass stays put at the bar's left edge; it never scales. */}
          <span className="grid h-12 w-12 shrink-0 place-items-center text-[var(--accent)]"><SearchIcon size={20} /></span>
          <motion.input
            variants={part}
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={onInputFocus}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Search brand, town, octane"
            aria-label="Search stations"
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />
          <motion.button
            variants={part}
            onClick={onToggleFilter}
            aria-label="Filters"
            aria-expanded={filterOpen}
            className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${filterOpen || filterCount ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--accent)]"}`}
          >
            <FilterIcon />
            {filterCount > 0 && !filterOpen && <Badge n={filterCount} />}
          </motion.button>
          <motion.button
            variants={part}
            onClick={onClose}
            aria-label="Close search"
            className="mr-1 grid h-10 w-10 shrink-0 place-items-center text-[var(--muted)]"
          >
            <CloseIcon />
          </motion.button>
        </motion.div>
      ) : (
        <motion.button
          key="button"
          onClick={onOpen}
          aria-label="Search"
          initial={{ scale: 0.86 }}
          animate={{ scale: 1, transition: POP }}
          whileTap={{ scale: 0.86, transition: POP }}
          // Swap instantly to the bar, which starts at exactly this size.
          exit={{ opacity: 0, transition: { duration: 0 } }}
          className={`relative grid h-12 w-12 place-items-center rounded-full text-[var(--accent)] ${SURFACE}`}
        >
          <SearchIcon size={20} />
          {closedBadge > 0 && <Badge n={closedBadge} />}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#f5b301] px-1 text-[11px] font-bold text-white ring-2 ring-[var(--surface)]">
      {n}
    </span>
  );
}
