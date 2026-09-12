import React, { useState } from "react";
import ReactDatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { CalendarDays, X } from "lucide-react";

const pad = (n) => String(n).padStart(2, "0");
const toDateObj = (v) => (v ? new Date(`${v}T00:00:00`) : null);
const toDateStr = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "");
const fmt = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "");

// "This month"/"Last month" are capped at today rather than the month's
// last day — these ranges filter production entries that don't exist yet,
// so a future end date would just be an empty tail with no rows in it.
const PRESETS = [
  { label: "Today", range: (today) => [today, today] },
  {
    label: "Last 7 days",
    range: (today) => {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return [start, today];
    },
  },
  {
    label: "This month",
    range: (today) => [new Date(today.getFullYear(), today.getMonth(), 1), today],
  },
  {
    label: "Last month",
    range: (today) => [
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
      new Date(today.getFullYear(), today.getMonth(), 0),
    ],
  },
];

// Single pill trigger — same shape as the app's plain DatePicker button
// (Components/Common/DatePicker.jsx) — but its label always renders both
// edges of the range straight from the from/to props, since react-datepicker
// only clones one edge into a customInput's `value` at a time.
const PillTrigger = React.forwardRef(({ onClick, from, to, open }, ref) => {
  const fromLabel = fmt(toDateObj(from));
  const toLabel = fmt(toDateObj(to));
  const hasRange = fromLabel || toLabel;
  const label = fromLabel && !toLabel ? `${fromLabel} → pick end date` : hasRange ? `${fromLabel} to ${toLabel}` : "Select date range";
  return (
    <button
      type="button"
      onClick={onClick}
      ref={ref}
      title={label}
      aria-haspopup="true"
      aria-expanded={open}
      className={`w-full flex items-center gap-2 cursor-pointer border rounded-xl px-3 py-1.5 text-sm transition-all bg-white dark:bg-[#1a1a1a] text-left ${
        open
          ? "border-brand-500 ring-4 ring-brand-500/15"
          : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
      }`}
    >
      <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
      <span className={`truncate ${hasRange ? "text-slate-800 dark:text-slate-100" : "text-slate-400 font-normal"}`}>{label}</span>
    </button>
  );
});
PillTrigger.displayName = "PillTrigger";

// Quick-select chips + a running hint, rendered as react-datepicker
// `children` — that's rendered inside its own CalendarContainer, so clicks
// here still count as "inside the picker" and won't trigger its
// outside-click close.
const RangeFooter = ({ picking, hasRange, onPick, onClear }) => (
  <div className="flex flex-col gap-2 px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111827] select-none">
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      {picking ? "Now pick an end date, or close this to filter by just that day" : "Pick a start date, or choose a quick range"}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            const [start, end] = p.range(new Date());
            onPick({ from: toDateStr(start), to: toDateStr(end) });
          }}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium px-2.5 py-1 transition-colors"
        >
          {p.label}
        </button>
      ))}
      {hasRange && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-[#1a1a1a] hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-medium px-2.5 py-1 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  </div>
);

/**
 * Components/Common/DateRangePicker.jsx
 * ──────────────────────────────────────
 * One "From to To" pill that opens a single calendar — month/year
 * dropdowns for quick navigation, pick a start date then an end date, plus
 * a quick-range footer (Today / Last 7 days / This month / Last month /
 * Clear) — instead of two separate DatePicker inputs side by side.
 *
 * Built on react-datepicker (already a dependency, already dark-themed in
 * index.css for Employee.jsx's use of it) rather than this app's own
 * Components/Common/DatePicker.jsx, since that component only ever picks
 * one date and has no concept of a range/in-range highlight.
 *
 * Controlled: the caller owns `from`/`to` (plain "YYYY-MM-DD" strings, or
 * "" for unset) and passes a single onChange({ from, to }).
 */
const DateRangePicker = ({ from, to, onChange }) => {
  const [open, setOpen] = useState(false);
  // The first-clicked day of an in-progress range pick — deliberately kept
  // OUT of `from`/`to` (the committed filter). react-datepicker's own
  // selectsRange logic only treats a click as "extend the range" when its
  // startDate prop is set and endDate is null; the moment both are set (a
  // "complete" range — even a single day where start===end) it treats ANY
  // further click as a brand-new pick instead of a second endpoint. So a
  // single click applies immediately as a same-day filter (from=to=that
  // day, reported to the parent right away below) while the calendar
  // itself keeps seeing endDate=null via `pickAnchor` — meaning a second
  // click still extends into a real range instead of restarting.
  const [pickAnchor, setPickAnchor] = useState(null);
  const hasRange = !!(from || to);
  const picking = !!pickAnchor;

  const handleChange = ([start, end]) => {
    if (start && !end) {
      setPickAnchor(start);
      onChange({ from: toDateStr(start), to: toDateStr(start) });
      return;
    }
    setPickAnchor(null);
    onChange({ from: toDateStr(start), to: toDateStr(end) });
  };

  const commit = (range) => {
    setPickAnchor(null);
    onChange(range);
  };

  return (
    <div className="flex items-center gap-1 min-w-0">
      <ReactDatePicker
        selectsRange
        startDate={pickAnchor || toDateObj(from)}
        endDate={pickAnchor ? null : toDateObj(to)}
        onChange={handleChange}
        onCalendarClose={() => { setOpen(false); setPickAnchor(null); }}
        onCalendarOpen={() => setOpen(true)}
        customInput={<PillTrigger from={from} to={to} open={open} />}
        wrapperClassName="w-full"
        // Escapes to a dedicated node under <body> (auto-created by
        // react-datepicker if missing) — same reasoning as this project's
        // own Components/Common/DatePicker.jsx: a plain absolutely/fixed
        // positioned popup still gets clipped by the nearest ancestor with
        // overflow set (e.g. FilterBar's own scrollable popover), no matter
        // its z-index.
        portalId="date-range-picker-portal"
        popperPlacement="bottom-start"
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        openToDate={(pickAnchor || toDateObj(from)) || undefined}
        autoComplete="off"
      >
        <RangeFooter
          picking={picking}
          hasRange={hasRange}
          onPick={commit}
          onClear={() => commit({ from: "", to: "" })}
        />
      </ReactDatePicker>
      {hasRange && (
        <button
          type="button"
          onClick={() => commit({ from: "", to: "" })}
          title="Clear date range"
          className="shrink-0 p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1a1a] text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default DateRangePicker;
