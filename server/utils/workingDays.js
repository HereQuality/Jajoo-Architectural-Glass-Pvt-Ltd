"use strict";

/**
 * Edit-window rule for Production Entries: an entry stays editable for up
 * to 2 working days after its date. The working week is Mon/Wed/Thu/Fri/
 * Sat/Sun — Tuesday is the off day and doesn't count.
 */

const OFF_DAY = 2; // Date#getDay(): 0=Sun..6=Sat, 2=Tuesday

function isWorkingDay(date) {
  return date.getDay() !== OFF_DAY;
}

/**
 * Counts working (non-Tuesday) calendar days strictly after `entryDate`,
 * up to and including `now`.
 */
function workingDaysElapsed(entryDate, now) {
  const cursor = new Date(entryDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor)) count++;
  }
  return count;
}

function isEntryEditable(entryDate, now = new Date(), maxWorkingDays = 2) {
  return workingDaysElapsed(entryDate, now) <= maxWorkingDays;
}

module.exports = { OFF_DAY, isWorkingDay, workingDaysElapsed, isEntryEditable };
