"use strict";

const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const User = require("../models/user.model");
const Employee = require("../models/Employee");
const RoleMaster = require("../models/RoleMaster");

const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(
        new AppError("You are not logged in. Please log in to get access.", 401)
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try finding in User collection (SuperAdmin)
    let currentUser = await User.findById(decoded.id).select("-password");
    
    // If not found, try Employee collection
    if (!currentUser) {
      currentUser = await Employee.findById(decoded.id)
        .populate('departmentIds', 'departmentName')
        .select("-password");
    }

    if (!currentUser) return next(new AppError("User no longer exists.", 401));

    if (currentUser.isBlocked) {
      return next(new AppError("Your account has been blocked.", 403));
    }

    // Deactivated accounts must be cut off immediately, not just hidden from
    // list views — otherwise a token issued before deactivation keeps
    // working until it expires.
    if (currentUser.isActive === false) {
      return next(new AppError("Your account has been deactivated. Contact your administrator.", 403));
    }

    // A deactivated Role should cut off its members the same way — checked
    // separately (not via populate) so req.user.roleId stays a plain
    // ObjectId, which the rest of the app (e.g. requireMenuPermission)
    // relies on for direct query use.
    if (currentUser.roleId) {
      const role = await RoleMaster.findById(currentUser.roleId).select("isActive").lean();
      if (role && role.isActive === false) {
        return next(new AppError("Your role has been deactivated. Contact your administrator.", 403));
      }
    }

    req.user = currentUser;
    // Use roleType from token if available, otherwise fallback to model
    req.user.roleType = decoded.roleType || currentUser.roleType || 'Employee'; 

    next();
  } catch (err) {
    next(err);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.roleType)) {
      return next(
        new AppError(
          `Role '${req.user.roleType}' is not authorized to access this route.`,
          403
        )
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
