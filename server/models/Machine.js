const mongoose = require("mongoose");

const MachineSchema = new mongoose.Schema(
  {
    machineName: {
      type: String,
      required: [true, "Machine name is required"],
      trim: true,
      maxlength: [100, "Machine name must be 100 characters or fewer"],
    },
    machineCode: {
      type: String,
      trim: true,
      maxlength: [20, "Machine code must be 20 characters or fewer"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description must be 300 characters or fewer"],
    },
    processes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Process",
      },
    ],
    // Machine's own default operating schedule — manually entered here.
    // The Shift Time column/field shown elsewhere is DERIVED from these
    // (combined with the machine's process's Shift via min/max) and is
    // never itself directly editable; these two raw fields are.
    machineOnTime: {
      type: String, // "HH:mm"
      trim: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Machine Start Time must be HH:mm"],
    },
    machineOffTime: {
      type: String, // "HH:mm"
      trim: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Machine End Time must be HH:mm"],
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Machine", MachineSchema);
