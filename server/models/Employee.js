const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

const EmployeeSchema = new mongoose.Schema(
  {
    // ── Name fields ────────────────────────────────────────────────
    firstName: {
      type: String,
      required: false,
      trim: true,
    },
    lastName: {
      type: String,
      required: false,
      trim: true,
    },
    // employeeCode (new requirement)
    employeeCode: {
      type: String,
      required: false,
      trim: true,
    },
    // employeeName kept as the display name (auto-filled from first+last if not set)
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Username (primary login identifier) ────────────────────────
    // Unique per company, lowercase, no spaces. Auto-generated from
    // firstName.lastName + suffix if admin doesn't specify one.
    username: {
      type: String,
      unique: true,
      sparse: true, // allow null while migration runs
      lowercase: true,
      trim: true,
    },

    departmentIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    }],
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoleMaster",
      required: true,
    },
    skills: [{ type: String }],
    teamIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    }],
    // An employee can report to more than one manager — e.g. they sit in
    // more than one team's hierarchy, each with its own manager above them.
    reportingManagerIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: [],
    }],
    joiningDate: {
      type: Date,
    },
    profilePic: {
      type: String, // Local upload URL (/uploads/profile/...)
    },

    // ── Email — now optional; multiple employees may share one company address ──
    emailOffice: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      maxlength: 30,
    },

    mobileNumber: {
      type: String,
      required: false,
      trim: true,
    },
    country: {
      type: String,
      required: false,
      trim: true,
      default: "India"
    },
    state: {
      type: String,
      required: false,
      trim: true,
    },
    city: {
      type: String,
      required: false,
      trim: true,
    },
    address: {
      type: String,
      required: false,
      trim: true,
    },
    remark: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    password: {
      type: String,
      required: true,
      trim: true,
      select: false, // Don't return password in normal queries
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    // Useful fields for login tracking
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Number
    },
    lastLogin: Date,
    preferences: {
      themeMode: { type: String, enum: ['light', 'dark'], default: 'light' },
      showDashboardClock: { type: Boolean, default: true },
      shortcuts: [{ type: String }]
    }
  },
  { timestamps: true },
);

// ── Indexes ───────────────────────────────────────────────────────────────────
EmployeeSchema.index({ emailOffice: 1 });
EmployeeSchema.index({ isActive: 1 });

// Hash password before saving
EmployeeSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

// Compare password method
EmployeeSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Virtual for checking if account is currently locked
EmployeeSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

module.exports = mongoose.model("Employee", EmployeeSchema);
