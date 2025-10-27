const adminService = require("../services/adminService");
const { getRolesWithCount } = require("../services/usersService");

exports.createAdmin = async (req, res) => {
  try {
    const admin = await adminService.createAdmin(req.body);
    res.status(201).json(admin);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await adminService.getAllAdmins();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAdminById = async (req, res) => {
  try {
    const admin = await adminService.getAdminById(req.params.id);
    res.json(admin);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const admin = await adminService.updateAdmin(req.params.id, req.body);
    res.json(admin);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const result = await adminService.deleteAdmin(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.superAdminView = async (req,res) =>{
  try{
    const result = await getRolesWithCount(req.params.id);
    res.json(result);
  }catch (err) {
    res.status(400).json({ message: err.message });
  }
}
