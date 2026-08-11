const mongoose = require("mongoose");

/**
 * Operator Master
 *
 * Operators appear in the Production Data Entry dropdown.
 * Name is required; code is optional (used as a short identifier / badge).
 */
const OperatorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Operator name is required"],
      trim: true,
      maxlength: [100, "Operator name must be 100 characters or fewer"],
    },

    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Operator", OperatorSchema);
