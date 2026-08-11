"use strict";

const Skill = require("../models/Skill");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// @desc    Create a new skill
// @route   POST /api/v1/skills
// @access  Private
exports.createSkill = asyncHandler(async (req, res, next) => {
  const { skillName, skillDescription, isActive } = req.body;

  const exists = await Skill.findOne({ skillName: { $regex: new RegExp(`^${skillName}$`, "i") } });
  if (exists) {
    return next(new AppError("Skill name already exists", 400));
  }

  const skill = await Skill.create({
    skillName,
    skillDescription,
    isActive,
  });

  res.status(201).json({
    isOk: true,
    data: skill,
    message: "Skill created successfully",
  });
});

// @desc    Get all skills
// @route   GET /api/v1/skills
// @access  Private
exports.getAllSkills = asyncHandler(async (req, res, next) => {
  const { isActive } = req.query;
  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  const skills = await Skill.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    isOk: true,
    data: skills,
  });
});

// @desc    Get single skill
// @route   GET /api/v1/skills/:id
// @access  Private
exports.getSkill = asyncHandler(async (req, res, next) => {
  const skill = await Skill.findById(req.params.id);

  if (!skill) {
    return next(new AppError("Skill not found", 404));
  }

  res.status(200).json({
    isOk: true,
    data: skill,
  });
});

// @desc    Update a skill
// @route   PUT /api/v1/skills/:id
// @access  Private
exports.updateSkill = asyncHandler(async (req, res, next) => {
  const { skillName, skillDescription, isActive } = req.body;

  let skill = await Skill.findById(req.params.id);
  if (!skill) {
    return next(new AppError("Skill not found", 404));
  }

  if (skillName && skillName.toLowerCase() !== skill.skillName.toLowerCase()) {
    const exists = await Skill.findOne({ skillName: { $regex: new RegExp(`^${skillName}$`, "i") } });
    if (exists) {
      return next(new AppError("Skill name already exists", 400));
    }
  }

  skill.skillName = skillName || skill.skillName;
  if (skillDescription !== undefined) skill.skillDescription = skillDescription;
  if (isActive !== undefined) skill.isActive = isActive;

  await skill.save();

  res.status(200).json({
    isOk: true,
    data: skill,
    message: "Skill updated successfully",
  });
});

// @desc    Delete a skill
// @route   DELETE /api/v1/skills/:id
// @access  Private
exports.deleteSkill = asyncHandler(async (req, res, next) => {
  const skill = await Skill.findById(req.params.id);

  if (!skill) {
    return next(new AppError("Skill not found", 404));
  }

  await skill.deleteOne();

  res.status(200).json({
    isOk: true,
    data: null,
    message: "Skill deleted successfully",
  });
});
