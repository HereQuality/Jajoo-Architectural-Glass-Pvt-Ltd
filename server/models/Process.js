const mongoose = require("mongoose");

const ProcessSchema = new mongoose.Schema(
  {
    processName: {
      type: String,
      required: [true, "Process name is required"],
      trim: true,
      maxlength: [100, "Process name must be 100 characters or fewer"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description must be 300 characters or fewer"],
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Process", ProcessSchema);
