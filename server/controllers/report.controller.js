const ProductionEntry = require("../models/ProductionEntry");
const Machine = require("../models/Machine");
const Process = require("../models/Process");
const { resolveMachineFilter } = require("../utils/entryQuery");
const { aggregateOee } = require("../utils/oeeAggregate");
const { buildOeeReportPdf, buildOeeDashboardPdf } = require("../services/report.service");

const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, "-");

exports.downloadOeeReport = async (req, res) => {
  try {
    const { machine, process, from, to, columns } = req.query;
    const today = new Date().toISOString().split("T")[0];
    const fromDate = from || today;
    const toDate = to || fromDate;

    const machineFilter = await resolveMachineFilter({ machine, process });
    const query = { date: { $gte: new Date(fromDate), $lte: new Date(toDate) } };
    if (machineFilter !== undefined) query.machine = machineFilter;

    const entries = await ProductionEntry.find(query).populate("machine", "machineName").lean();

    let machineName = "All Machines";
    if (machine) {
      const m = await Machine.findById(machine).select("machineName");
      machineName = m ? m.machineName : "Unknown Machine";
    }

    let processName = "All Processes";
    if (process) {
      const p = await Process.findById(process).select("processName");
      processName = p ? p.processName : "Unknown Process";
    }

    const columnList = columns
      ? String(columns).split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const doc = buildOeeReportPdf({
      entries,
      filterDescription: `Process: ${processName}   ·   Machine: ${machineName}`,
      from: fromDate,
      to: toDate,
      columns: columnList,
    });

    const filename = `OEE-Report_${slug(processName)}_${slug(machineName)}_${fromDate}${
      toDate !== fromDate ? `_to_${toDate}` : ""
    }.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error("Error generating OEE report:", err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

// Dashboard's quick "Download PDF" — user picks one or more processes from a
// popup first; the PDF then covers only those processes' machines, always
// for today (or whatever from/to is passed). Every machine under a selected
// process is listed even with zero entries that day (zero-filled, not
// skipped), and each process section leads with a combined total card.
exports.downloadDashboardOeeReport = async (req, res) => {
  try {
    const { from, to, processes } = req.query;
    const today = new Date().toISOString().split("T")[0];
    const fromDate = from || today;
    const toDate = to || fromDate;
    const dateQuery = { $gte: new Date(fromDate), $lte: new Date(toDate) };

    const processIds = processes
      ? String(processes).split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (processIds.length === 0) {
      return res.status(400).json({ isOk: false, message: "Select at least one process" });
    }

    const selectedProcesses = await Process.find({ _id: { $in: processIds }, isActive: true })
      .select("processName")
      .sort({ processName: 1 })
      .lean();

    if (selectedProcesses.length === 0) {
      return res.status(400).json({ isOk: false, message: "No matching process found" });
    }

    const selectedIdSet = new Set(selectedProcesses.map((p) => String(p._id)));
    const machines = await Machine.find({ isActive: true, processes: { $in: [...selectedIdSet] } })
      .select("machineName processes")
      .sort({ machineName: 1 })
      .lean();

    const entriesByMachine = new Map();
    for (const m of machines) {
      const entries = await ProductionEntry.find({ machine: m._id, date: dateQuery }).lean();
      entriesByMachine.set(String(m._id), entries);
    }

    const grouped = selectedProcesses.map((p) => {
      const machinesForProcess = machines.filter((m) =>
        (m.processes || []).some((pid) => String(pid) === String(p._id))
      );
      const machineRows = machinesForProcess.map((m) => ({
        machineName: m.machineName,
        agg: aggregateOee(entriesByMachine.get(String(m._id)) || []),
      }));
      const totalAgg = aggregateOee(machinesForProcess.flatMap((m) => entriesByMachine.get(String(m._id)) || []));
      return { processName: p.processName, total: totalAgg, machines: machineRows };
    });

    const doc = buildOeeDashboardPdf({ grouped, from: fromDate, to: toDate });

    const processSlug = selectedProcesses.map((p) => slug(p.processName)).join("_");
    const filename = `OEE-Report_${processSlug}_${fromDate}${toDate !== fromDate ? `_to_${toDate}` : ""}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error("Error generating dashboard OEE report:", err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};
