import React, { useState, useEffect, useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";

/**
 * Components/Common/FilterBar.jsx
 * ────────────────────────────────
 * Collapses a page's filter controls (a Process <select>, a Machine
 * <select>, a DateRangePicker, ...) behind one small "Filters" button (a
 * red dot once any filter is active) that opens a floating panel with
 * every control stacked vertically — instead of each control sitting
 * always-visible in its own row, which is what kept overflowing/crowding
 * once enough filters piled up side by side (Process + Machine + Clear +
 * a date range + two report buttons all fighting for the same row).
 *
 * A "Clear" button lives in this same row, right next to the Filters
 * button — always rendered (so it never shifts anything next to it), and
 * visually red/enabled only while `hasActiveFilters` is true, dimmed and
 * disabled otherwise — the red is the "something to clear" signal, not
 * just a hover state.
 *
 * `actions` is for controls that sit in the same row but aren't filters —
 * a Download button, a "Custom Report…" button — so they stay
 * always-visible and separate from the filter panel/Clear button.
 */
const FilterBar = ({ children, hasActiveFilters, onClear, actions }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const controls = React.Children.toArray(children).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      // DateRangePicker's calendar (react-datepicker) portals its popup to
      // a dedicated node under <body> — see DateRangePicker.jsx's
      // `portalId` — so it's never a DOM descendant of wrapperRef even
      // while it's visually inside this panel. Without this check, every
      // click inside the calendar (a day, a preset chip, the month/year
      // dropdowns) reads as "outside" and slams this whole panel shut
      // before the pick can register.
      const inCalendarPopup = e.target.closest?.(".react-datepicker-popper");
      if (wrapperRef.current && !wrapperRef.current.contains(e.target) && !inCalendarPopup) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (controls.length === 0 && !actions) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {controls.length > 0 && (
        <div ref={wrapperRef} className="relative inline-flex">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={hasActiveFilters ? "Filters (active)" : "Filters"}
            className={`relative inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium bg-white dark:bg-[#1a1a1a] transition-colors ${
              open
                ? "border-brand-500 ring-4 ring-brand-500/15 text-slate-700 dark:text-slate-200"
                : "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-[#1a1a1a]" aria-hidden="true" />
            )}
          </button>
          {open && (
            <div className="absolute z-40 top-full left-0 mt-2 w-72 max-w-[90vw] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a1a1a] shadow-2xl p-3 flex flex-col gap-3">
              {controls}
            </div>
          )}
        </div>
      )}
      {/* Right next to Filters — not after `actions` (Download, Custom
          Report, ...), which would put a page's own action buttons between
          the two controls that actually belong together. */}
      <button
        type="button"
        onClick={onClear}
        disabled={!hasActiveFilters}
        title={hasActiveFilters ? "Clear all filters" : "No filters applied"}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
          hasActiveFilters
            ? "border-red-300 dark:border-red-800 bg-white dark:bg-[#1a1a1a] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 cursor-not-allowed"
        }`}
      >
        <X className="w-3.5 h-3.5" /> Clear
      </button>
      {actions}
    </div>
  );
};

export default FilterBar;
