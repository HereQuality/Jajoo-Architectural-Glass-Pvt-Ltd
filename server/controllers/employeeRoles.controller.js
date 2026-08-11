const EmployeeRoles = require("../models/EmployeeRoles");

// Create Employee Role Permissions
exports.createEmployeeRoles = async (req, res) => {
  try {
    const { roleId, roles, isActive } = req.body;

    // Check if role permissions already exist
    const existingRoles = await EmployeeRoles.findOne({ roleId });
    if (existingRoles) {
      return res.status(400).json({ isOk: false, message: "Permissions already exist for this role. Use update instead." });
    }

    const employeeRoles = await EmployeeRoles.create({
      roleId,
      roles,
      isActive
    });

    res.status(201).json({
      isOk: true,
      data: employeeRoles,
      message: "Employee roles created successfully"
    });
  } catch (error) {
    console.error("Error creating employee roles:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Get Employee Role Permissions by Role ID
exports.getEmployeeRoles = async (req, res) => {
  try {
    const { roleId } = req.params;

    const employeeRoles = await EmployeeRoles.find({ roleId });

    if (!employeeRoles || employeeRoles.length === 0) {
      return res.status(200).json({ isOk: true, data: [] });
    }

    res.status(200).json({
      isOk: true,
      data: employeeRoles
    });
  } catch (error) {
    console.error("Error fetching employee roles:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Update Employee Role Permissions
exports.updateEmployeeRoles = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { roles, isActive } = req.body;

    const employeeRoles = await EmployeeRoles.findOneAndUpdate(
      { roleId },
      { roles, isActive },
      { new: true }
    );

    if (!employeeRoles) {
      return res.status(404).json({ isOk: false, message: "Employee roles not found" });
    }

    res.status(200).json({
      isOk: true,
      data: employeeRoles,
      message: "Employee roles updated successfully"
    });
  } catch (error) {
    console.error("Error updating employee roles:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

