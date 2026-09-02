"use strict";

/**
 * Edit-window rule for Production Entries: an entry stays editable for up
 * to 2 working days after its date. The working week is Mon/Wed/Thu/Fri/
 * Sat/Sun — Tuesday is the off day and doesn't count. Company holidays
 * (server/models/CompanyHoliday.js) don't count either, for exactly the
 * same reason as Tuesday: buildHolidaySet/isHoliday below just make a
 * holiday another day isWorkingDay() says no to, so the 2-working-day
 * window naturally extends one more calendar day past it — no separate
 * "bypass" branch needed.
 */

const OFF_DAY = 2; // Date#getDay(): 0=Sun..6=Sat, 2=Tuesday

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthDayKey(d) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Builds a lookup from a list of CompanyHoliday documents (or plain
 * {date, isRecurringYearly} objects) — build once per check, not per day,
 * since workingDaysElapsed calls isWorkingDay in a loop.
 */
function buildHolidaySet(holidays = []) {
  const exact = new Set();
  const recurring = new Set();
  for (const h of holidays) {
    const d = new Date(h.date);
    if (Number.isNaN(d.getTime())) continue;
    if (h.isRecurringYearly) recurring.add(monthDayKey(d));
    else exact.add(dateKey(d));
  }
  return { exact, recurring };
}

function isHoliday(date, holidaySet) {
  if (!holidaySet) return false;
  return holidaySet.exact.has(dateKey(date)) || holidaySet.recurring.has(monthDayKey(date));
}

function isWorkingDay(date, holidaySet) {
  return date.getDay() !== OFF_DAY && !isHoliday(date, holidaySet);
}

/**
 * Counts working (non-Tuesday, non-holiday) calendar days strictly after
 * `entryDate`, up to and including `now`.
 */
function workingDaysElapsed(entryDate, now, holidaySet) {
  const cursor = new Date(entryDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor, holidaySet)) count++;
  }
  return count;
}

function isEntryEditable(entryDate, now = new Date(), maxWorkingDays = 2, holidaySet) {
  return workingDaysElapsed(entryDate, now, holidaySet) <= maxWorkingDays;
}

module.exports = {
  OFF_DAY,
  isWorkingDay,
  workingDaysElapsed,
  isEntryEditable,
  buildHolidaySet,
  isHoliday,
};
