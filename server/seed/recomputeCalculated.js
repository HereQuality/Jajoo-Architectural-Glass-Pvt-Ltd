"use strict";
/**
 * seed/recomputeCalculated.js
 *
 * Maintenance script: re-runs computeBatchCalculations()/
 * computeRowIdealProductionQty() against every existing ProductionEntry and
 * updates ONLY its `calculated` sub-document (+ the derived top-level
 * `overtimeMin`) in place. Every other field — machine, operator,
 * quantities, stoppage minutes, etc. — is left untouched.
 *
 * Working Schedule Time/Total Stoppage/Available Working Time/Effective M/C
 * Run Time/Availability/Performance/Quality/OEE % are BATCH-level (see
 * productionCalculation.service.js) — entries are grouped by batchId (an
 * entry with no batchId is its own one-entry batch) before recomputing, so
 * every entry in a batch ends up with the same batch-level numbers, exactly
 * as a fresh save through the controller would produce.
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
const { computeBatchCalculations, computeRowIdealProductionQty } = require("../services/productionCalculation.service");

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Resolves Shift On/Off Time exactly like resolveShiftTimes() in
// productionEntry.controller.js: prefer the entry's own snapshot
// (shiftOnTime/shiftOffTime, taken from the Machine when the entry was
// saved), only falling back to the Machine's CURRENT Shift Time when the
// snapshot is missing entirely (legacy entries saved before the snapshot
// fields existed). The entry's old `shift` ref (pre-snapshot design) is no
// longer read anywhere in the live code and is intentionally not used here
// either, so a backfill run produces the same numbers a fresh save would.
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

  const batches = new Map(); // batchId (or a solo key) -> entries[]
  for (const entry of entries) {
    const key = entry.batchId ? String(entry.batchId) : `_solo:${entry._id}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(entry);
  }
  console.log(`Grouped into ${batches.size} batches (a standalone entry counts as its own batch of one).`);

  let updated = 0;
  for (const rows of batches.values()) {
    const { shiftOnTime, shiftOffTime } = await resolveShiftTimes(rows[0]);
    const batchCalc = computeBatchCalculations(rows, shiftOnTime, shiftOffTime);
    for (const entry of rows) {
      const idealProductionQty = round2(computeRowIdealProductionQty(entry));
      entry.calculated = { ...batchCalc, idealProductionQty };
      entry.overtimeMin = batchCalc.overtimeMin;
      await entry.save();
      updated++;
    }
  }

  console.log(`Done — recomputed ${updated} entries in place (no entries created/deleted).`);
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Recompute failed:", err);
  process.exit(1);
});
