"use strict";
/**
 * seed/seedProductionEntries.js
 *
 * Dev/demo seeder for the Grinding Data Entry sheet — uses the REAL
 * machines and operators already set up in Machine Master / Operator
 * Master (does not invent synthetic ones; an earlier version of this
 * script did, which polluted the DB with duplicate/orphaned Machine and
 * StandardTime records once those synthetic machines were deleted).
 *
 * What it does, in order:
 *   1. Wipes ALL StandardTime records and inserts 2-3 realistic ones per
 *      active Grinding machine (sane sizes/thicknesses/times — replacing
 *      whatever placeholder/test values existed before).
 *   2. Wipes ALL ProductionEntry records and inserts exactly ONE entry
 *      per active Grinding machine per day, for the last 14 days
 *      (including today) — so the Dashboard's Daily OEE Trend has a
 *      clean, realistic multi-day history instead of a jumble of
 *      multiple/duplicate same-day entries.
 *
 * Safe to re-run — it always starts from a clean slate (steps above),
 * so re-running just regenerates the same shape of data with fresh
 * pseudo-random (but deterministic) numbers for the current date range.
 *
 * Usage: node server/seed/seedProductionEntries.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Machine = require("../models/Machine");
const Operator = require("../models/Operator");
const Process = require("../models/Process");
const StandardTime = require("../models/StandardTime");
const ProductionEntry = require("../models/ProductionEntry");
const { computeCalculations } = require("../services/productionCalculation.service");

const SEED_TAG = "[seed-data]";
const DAYS_BACK = 13; // + today = 14 days total

// Deterministic PRNG so re-runs produce the same numbers (no faker dep in this repo).
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260811);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(min + rand() * (max - min + 1));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// 2-3 realistic size/thickness/time combos per machine — real industrial
// glass panel sizes (mm) and sane grinding times (minutes/piece), not the
// placeholder 5x5 / 0.12min / 2222min style test values that were here
// before.
const STANDARD_TIME_TEMPLATES = [
  [
    { sizeWidthMm: 100, sizeHeightMm: 200, thicknessMm: 2, standardTimeMin: 2.5 },
    { sizeWidthMm: 150, sizeHeightMm: 250, thicknessMm: 4, standardTimeMin: 3.5 },
    { sizeWidthMm: 200, sizeHeightMm: 300, thicknessMm: 5, standardTimeMin: 4.5 },
  ],
  [
    { sizeWidthMm: 100, sizeHeightMm: 200, thicknessMm: 2, standardTimeMin: 2.2 },
    { sizeWidthMm: 120, sizeHeightMm: 180, thicknessMm: 4, standardTimeMin: 2.8 },
    { sizeWidthMm: 150, sizeHeightMm: 250, thicknessMm: 5, standardTimeMin: 3.6 },
  ],
  [
    { sizeWidthMm: 100, sizeHeightMm: 200, thicknessMm: 2, standardTimeMin: 2.4 },
    { sizeWidthMm: 150, sizeHeightMm: 250, thicknessMm: 4, standardTimeMin: 3.3 },
    { sizeWidthMm: 200, sizeHeightMm: 300, thicknessMm: 6, standardTimeMin: 4.8 },
  ],
  [
    { sizeWidthMm: 120, sizeHeightMm: 180, thicknessMm: 2, standardTimeMin: 2.1 },
    { sizeWidthMm: 150, sizeHeightMm: 250, thicknessMm: 5, standardTimeMin: 3.7 },
    { sizeWidthMm: 200, sizeHeightMm: 300, thicknessMm: 8, standardTimeMin: 5.2 },
  ],
  [
    { sizeWidthMm: 100, sizeHeightMm: 200, thicknessMm: 4, standardTimeMin: 3.0 },
    { sizeWidthMm: 150, sizeHeightMm: 250, thicknessMm: 6, standardTimeMin: 4.0 },
    { sizeWidthMm: 200, sizeHeightMm: 300, thicknessMm: 8, standardTimeMin: 5.5 },
  ],
];

const SHIFTS = [
  { mcStartTime: "09:00", mcOffTime: "18:00" }, // 540 min
  { mcStartTime: "08:00", mcOffTime: "20:00" }, // 720 min
  { mcStartTime: "21:00", mcOffTime: "06:00" }, // overnight, 540 min
];

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

async function seedStandardTimes(machines) {
  await StandardTime.deleteMany({});
  const created = [];
  machines.forEach((machine, i) => {
    const templates = STANDARD_TIME_TEMPLATES[i % STANDARD_TIME_TEMPLATES.length];
    for (const t of templates) {
      created.push({ machine: machine._id, ...t, isActive: true });
    }
  });
  await StandardTime.insertMany(created);
  console.log(`Seeded ${created.length} Standard Time records (${STANDARD_TIME_TEMPLATES[0].length} per machine × ${machines.length} machines).`);
}

async function seedProductionEntries(machines, operators) {
  await ProductionEntry.deleteMany({});

  const stByMachine = new Map();
  for (const m of machines) {
    stByMachine.set(String(m._id), await StandardTime.find({ machine: m._id, isActive: true }).lean());
  }

  const docs = [];
  for (let dayOffset = DAYS_BACK; dayOffset >= 0; dayOffset--) {
    const dateStr = dateNDaysAgo(dayOffset);

    for (const machine of machines) {
      const sts = stByMachine.get(String(machine._id));
      if (!sts || sts.length === 0) continue;

      const st = pick(sts);
      const shift = pick(SHIFTS);
      const operator = pick(operators);

      const plannedDowntimeMin = int(0, 30);
      const noManpowerMin = int(0, 15);
      const mechanicalBreakdownMin = int(0, 20);
      const electricalBreakdownMin = int(0, 10);
      const rawMaterialNotAvailableMin = int(0, 15);
      const humanErrorStoppageMin = int(0, 10);
      const changeoverMin = int(0, 20);
      const rawMaterialProblemMin = int(0, 10);
      const noPowerMin = int(0, 5);
      const othersMin = 0;
      const overtimeMin = rand() < 0.15 ? int(15, 60) : 0;

      const entry = {
        date: new Date(dateStr),
        mcStartTime: shift.mcStartTime,
        mcOffTime: shift.mcOffTime,
        machine: machine._id,
        operator: operator._id,
        sizeWidthMm: st.sizeWidthMm,
        sizeHeightMm: st.sizeHeightMm,
        thicknessMm: st.thicknessMm,
        standardTimePerPieceMin: st.standardTimeMin,
        overtimeMin,
        plannedDowntimeMin,
        noManpowerMin,
        mechanicalBreakdownMin,
        electricalBreakdownMin,
        rawMaterialNotAvailableMin,
        humanErrorStoppageMin,
        changeoverMin,
        rawMaterialProblemMin,
        noPowerMin,
        othersMin,
        othersRemark: SEED_TAG,
      };

      const calculated = computeCalculations(entry);
      // Keep Process Qty comfortably inside what the shift can actually
      // produce (Ideal Production), same as the real form's own capacity
      // check would require — a realistic 75-95% of ideal, not more.
      const idealQty = calculated.idealProductionQty || 0;
      const processQty = Math.max(1, Math.round(idealQty * (0.75 + rand() * 0.2)));
      const okQty = Math.max(0, Math.round(processQty * (0.85 + rand() * 0.13)));
      const rejectedQty = Math.max(0, processQty - okQty);

      entry.processQty = processQty;
      entry.okQty = okQty;
      entry.rejectedQty = rejectedQty;
      entry.calculated = computeCalculations(entry);

      docs.push(entry);
    }
  }

  await ProductionEntry.insertMany(docs);
  console.log(`Seeded ${docs.length} production entries (${machines.length} machines × ${DAYS_BACK + 1} days, one entry per machine per day).`);
}

async function run() {
  await connectDB();

  const grinding = await Process.findOne({ processName: "Grinding" });
  if (!grinding) {
    throw new Error('No "Grinding" process found — run the app\'s normal setup (Process Master) first.');
  }

  const machines = await Machine.find({ isActive: true, processes: grinding._id }).sort({ machineCode: 1 }).lean();
  if (machines.length === 0) {
    throw new Error("No active Grinding machines found in Machine Master — nothing to seed against.");
  }

  const operators = await Operator.find({ isActive: true }).lean();
  if (operators.length === 0) {
    throw new Error("No active operators found in Operator Master — nothing to assign entries to.");
  }

  console.log(`Using ${machines.length} real active Grinding machines and ${operators.length} real active operators.`);

  await seedStandardTimes(machines);
  await seedProductionEntries(machines, operators);

  console.log("Done.");
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
