"use strict";
const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema(
  {
    skillName: {
      type: String,
      required: [true, "Skill name is required"],
      trim: true,
      maxlength: [30, "Skill name cannot exceed 30 characters"],
      unique: true,
    },
    skillDescription: {
      type: String,
      trim: true,
      maxlength: [150, "Skill description cannot exceed 150 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Skill", skillSchema);
