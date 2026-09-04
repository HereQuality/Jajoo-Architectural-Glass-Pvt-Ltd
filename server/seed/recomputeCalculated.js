"use strict";
/**
 * seed/recomputeCalculated.js
 *
 * Maintenance script: re-runs the batch-position-aware calculation (see
 * productionCalculation.service.js's 2026-09-03 note) against every
 * existing ProductionEntry, grouped by batchId, and updates ONLY each
 * entry's `calculated` sub-document (+ the derived top-level `overtimeMin`)
 * in place. Every other field — machine, operator, quantities, stoppage
 * minutes, etc. — is left untouched.
 *
 * Rows sharing a batchId are NOT independent anymore — a row's own Working
 * Schedule Time (and Overtime/Start Delay/Early Closed) depends on whether
 * it's the chronological first/last row among its siblings, so this MUST
 * group by batchId and use computeBatchRowCalculations, not
 * computeRowCalculations per entry in isolation (that would default every
 * row to isFirst=isLast=true, which is only correct for a standalone entry).
 *
 * Use this (not a wipe-and-reseed) whenever a formula in
 * productionCalculation.service.js changes and needs to apply
 * retroactively to real, already-entered production data — reseeding
 * would destroy real entries; this only touches derived fields.
 *
 * Usage: node server/seed/recomputeCalculated.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const ProductionEntry = require("../models/ProductionEntry");
const Machine = require("../models/Machine");
const { computeBatchRowCalculations } = require("../services/productionCalculation.service");

// Resolves Shift On/Off Time exactly like resolveShiftTimes() in
// productionEntry.controller.js: prefer the entry's own snapshot (taken
// from the Machine when the entry was saved), only falling back to the
// Machine's CURRENT Shift Time when the snapshot is missing entirely
// (legacy entries saved before the snapshot fields existed).
async function resolveShiftTimes(entry) {
  let shiftOnTime = entry.shiftOnTime;
  let shiftOffTime = entry.shiftOffTime;
  if (!shiftOnTime || !shiftOffTime) {
    const machine = await Machine.findById(entry.machine);
    shiftOnTime = shiftOnTime || machine?.machineOnTime;
    shiftOffTime = shiftOffTime || machine?.machineOffTime;
  }
  return { shiftOnTime, shiftOffTime };
}

async function run() {
  await connectDB();

  const entries = await ProductionEntry.find({});
  console.log(`Recomputing calculated fields for ${entries.length} entries...`);

  const batches = new Map();
  for (const entry of entries) {
    const key = entry.batchId ? String(entry.batchId) : `_solo:${entry._id}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(entry);
  }

  let updated = 0;
  for (const rows of batches.values()) {
    const { shiftOnTime, shiftOffTime } = await resolveShiftTimes(rows[0]);
    const results = computeBatchRowCalculations(rows, shiftOnTime, shiftOffTime);
    for (const { row, calculated } of results) {
      row.calculated = calculated;
      row.overtimeMin = calculated.overtimeMin;
      await row.save();
      updated++;
    }
  }

  console.log(`Done — recomputed ${updated} entries across ${batches.size} batches in place (no entries created/deleted).`);
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Recompute failed:", err);
  process.exit(1);
});
